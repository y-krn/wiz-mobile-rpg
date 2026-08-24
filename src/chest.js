import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem, recordCharDeath, markMapChanged, markMapCellVisited } from "./state.js";
import { MAP_WIDTH, MAP_HEIGHT, getItemData, getCharTrapBonus, getCharAffixSum, getCharCoreParams, getTrapEaterBonusAfterDisarm, getCoreLogText } from "./data.js";
import {
  rollChestTrap,
  rollChestAccessory,
  rollChestReward,
  rollChestSpecialReward,
  CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP,
  resolveChestSmashRewardLosses
} from "./rules/chest_rules.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { updateUI } from "./ui.js";
import { menuContext, openSubmenu, resetSubmenuBackButton } from "./navigation.js";
import { triggerGameOver } from "./combat.js";
import { createRng } from "./seed_rng.js";
import { increaseChestTrapTier } from "./systems/traps.js";
import {
  applyStatusEffect,
  clearCharIncapacitationOnDamage,
  EXPLORATION_POISON_DURATION_STEPS,
  STATUS_EFFECT_IDS
} from "./combat_logic/status_effects.js";
import { IDENTIFICATION_BALANCE } from "./rules/identification_rules.js";
import { calculateChestDisarmChance } from "./rules/trap_rules.js";
import { applyTrapGuardToEffect, resolveChestTrapEffect } from "./rules/trap_effect_rules.js";
import { getChestMaterialPool } from "./rules/material_rules.js";
import { getItemBaseId } from "./rules/item_rules.js";
import { trackChestAction, trackChestSmashResult } from "./telemetry.js";

export const CHEST_PHASES = Object.freeze({
  MENU: "menu",
  DISARM_SELECT: "disarm_select",
  OPEN_SELECT: "open_select",
  RESOLVING: "resolving",
  REWARD: "reward",
  TERMINAL: "terminal"
});

export const CHEST_PHASE_TRANSITIONS = Object.freeze({
  [CHEST_PHASES.MENU]: [CHEST_PHASES.MENU, CHEST_PHASES.DISARM_SELECT, CHEST_PHASES.OPEN_SELECT, CHEST_PHASES.RESOLVING, CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.DISARM_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.OPEN_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.RESOLVING]: [CHEST_PHASES.REWARD, CHEST_PHASES.MENU, CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.REWARD]: [CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.TERMINAL]: []
});

function getChestPhase(chest) {
  return chest?.phase || CHEST_PHASES.MENU;
}

function transitionChestPhase(chest, nextPhase) {
  const currentPhase = getChestPhase(chest);
  if (!CHEST_PHASE_TRANSITIONS[currentPhase]?.includes(nextPhase)) return false;
  chest.phase = nextPhase;
  return true;
}

function chestActionAllowed(phases, { allowTransition = false } = {}) {
  if (!state.chestState) return false;
  if (state.transitioning && !allowTransition) return false;
  return phases.includes(getChestPhase(state.chestState));
}

function isEligibleChestCharacter(char) {
  return Boolean(
    char &&
    state.party.includes(char) &&
    ["ok", "poisoned", "blind"].includes(char.status)
  );
}

function clearChestInspectionState(chest) {
  delete chest.inspected;
  delete chest.identifiedTrap;
  delete chest.inspectChance;
}

function finishChest(chest) {
  transitionChestPhase(chest, CHEST_PHASES.TERMINAL);
  state.chestState = null;
}

export function applyTombRaiderTrapTier(chest, opener) {
  const params = getCharCoreParams(opener, "CORE_TOMB_RAIDER");
  if (!params || chest.tombRaiderTrapApplied) return false;
  chest.trap = increaseChestTrapTier(chest.trap, params.trapTierBonus);
  chest.tombRaiderTrapApplied = true;
  return true;
}

export function setupChestState(forcedTrap = null, _legacyReward = null, forcedItem = null, customRng = null, options = {}) {
  void _legacyReward;
  if (state.codex && state.codex.events && state.codex.events.facilities) {
    if (!state.codex.events.facilities.chest) {
      state.codex.events.facilities.chest = { found: 0, opened: 0 };
    }
    state.codex.events.facilities.chest.found++;
  }

  if (state.floor === 1 && state.currentRun) {
    state.currentRun.b1ChestsOpened = (state.currentRun.b1ChestsOpened || 0) + 1;
  }
  const chestSeed = `${state.seed}:chest:B${state.floor}:${state.x},${state.y}`;
  const rng = customRng || (state.seed ? createRng(chestSeed) : Math.random);

  // Traps are floor dependent
  const trap = forcedTrap !== null ? forcedTrap : rollChestTrap(state.floor, rng);

  // Item reward scale by floor
  let item;
  if (forcedItem !== null) {
    item = forcedItem;
  } else {
    const reward = rollChestReward({
      floor: state.floor,
      rng,
      party: state.party,
      currentRun: state.currentRun,
      trap,
      firstChestGuaranteed: state.firstChestUnidentifiedGuaranteed,
      itemCandidates: options.fromDrop
        ? CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP[Math.min(5, state.floor)]
        : null
    });
    item = reward.item;
    if (reward.consumedFirstChestGuarantee) {
      state.firstChestUnidentifiedGuaranteed = true;
    }
  }
  const specialItem = forcedItem === null && !options.fromDrop
    ? rollChestSpecialReward(state.floor, rng)
    : null;
  const accessoryItem = forcedItem === null ? rollChestAccessory(state.floor, rng, state.party) : null;

  // Aura & loot hint calculation
  let aura = "weak";
  let hasEquipmentSignal = false;
  if (item && typeof item === "object" && item.kind === "equipment") {
    hasEquipmentSignal = true;
    if (item.rarity === "epic") aura = "strong";
    else if (item.rarity === "rare") aura = "medium";
    else aura = "weak";
  }
  if (accessoryItem) {
    hasEquipmentSignal = true;
    if (accessoryItem.rarity === "epic") aura = "strong";
    else if (accessoryItem.rarity === "rare" && aura !== "strong") aura = "medium";
  }
  let label = hasEquipmentSignal ? "装備品の反応あり" : "消耗品または反応なし";
  if (hasEquipmentSignal) {
    const tagLabels = {
      followUp: "連撃",
      spellPower: "術力",
      arcane: "秘術",
      devotion: "神聖",
      guardian: "守護",
      treasureSense: "宝探",
      trapBonus: "技巧",
      antiUndead: "不死祓い",
      antiDragon: "竜殺し",
      spellGuard: "魔除け",
      poisonWard: "毒避け",
      firstStrike: "先制"
    };
    const senseSum = state.party.reduce((sum, c) => {
      if (c.status === "dead") return sum;
      return sum + getCharAffixSum(c, "treasureSense");
    }, 0);
    const shouldRevealTag = senseSum >= 5 || rng() < 0.20;
    const hintedAffix = item?.affixes?.find(aff => tagLabels[aff.type]);
    const hintedAccessoryAffix = accessoryItem?.affixes?.find(aff => tagLabels[aff.type]);
    if (shouldRevealTag && (hintedAffix || hintedAccessoryAffix)) {
      const affixType = hintedAffix?.type || hintedAccessoryAffix.type;
      label = `${label} / 気配:${tagLabels[affixType]}`;
    }
  }

  state.chestState = {
    trap,
    item,
    specialItem,
    accessoryItem,
    inspected: false,
    identifiedTrap: "",
    phase: CHEST_PHASES.MENU,
    x: state.x,
    y: state.y,
    fromDrop: options.fromDrop ?? false,
    lootHint: {
      hasEquipmentSignal,
      aura,
      label
    }
  };

  // Transition to chest submenu
  openChestMenu();
}

export function openChestMenu() {
  if (!state.chestState || state.transitioning) return false;
  if (!transitionChestPhase(state.chestState, CHEST_PHASES.MENU)) return false;
  menuContext.prevGameState = null;
  state.gameState = "submenu";
  menuContext.type = "chest_menu";

  const titleEl = document.getElementById("submenu-title");
  titleEl.textContent = "宝箱の調査・解除";

  const optGrid = document.getElementById("submenu-options");
  optGrid.className = "submenu-grid";
  optGrid.innerHTML = "";

  const translateTrap = (t) => {
    if (t === "poison needle") return "毒針";
    if (t === "gas bomb") return "ガス爆弾";
    if (t === "teleporter") return "テレポーター";
    if (t === "flash bomb") return "閃光弾";
    return "なし";
  };

  // Create Info Panel for Chest Details & Floor Risks
  const infoPanel = document.createElement("div");
  infoPanel.className = "chest-info-panel";

  // 1. Floor Risk Warning
  let riskText = "";
  if (state.floor === 1 || state.floor === 3) {
    riskText = `<span style="color:var(--neon-yellow)">[階層] 罠遭遇：高 (約80%)</span>`;
  } else if (state.floor === 2) {
    riskText = `<span style="color:var(--neon-green)">[階層] 罠遭遇：中 (約70%)</span>`;
  } else if (state.floor === 4) {
    riskText = `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き（転移警戒）</span>`;
  } else if (state.floor === 5) {
    riskText = `<span style="color:var(--neon-red)">[警告] 全宝箱罠付き＆火炎トラップ注意</span>`;
  }

  // 2. Inspection result
  let inspectText;
  if (!state.chestState.inspected) {
    inspectText = `<span style="color:var(--text-muted)">推定罠: 未調査</span>`;
  } else {
    const trapNameJp = translateTrap(state.chestState.identifiedTrap);
    const chance = state.chestState.inspectChance || 0;
    let reliability = "極低";
    let reliabilityColor = "var(--neon-red)";
    if (chance >= 0.8) {
      reliability = "高";
      reliabilityColor = "var(--neon-green)";
    } else if (chance >= 0.4) {
      reliability = "中";
      reliabilityColor = "var(--neon-yellow)";
    } else if (chance >= 0.3) {
      reliability = "低";
      reliabilityColor = "#ff9f0a"; // orange
    }
    const uncertainty = chance >= 0.8
      ? `<span style="color:var(--text-muted)">推定は外れる場合あり</span>`
      : `<span style="color:${reliabilityColor}; font-weight:bold;">[!] 外れる可能性あり</span>`;
    inspectText = `推定: <strong style="color:var(--neon-cyan)">${trapNameJp}</strong> / 信頼度 <span style="color:${reliabilityColor}">${reliability}</span><br>${uncertainty}`;
  }

  // 3. Traps Help
  const helpText = `<div class="chest-help-text">
毒針:単体+毒 | ガス:全体ダメ<br>
テレポ:転移 | 閃光:全体盲目<br>
<span style="color:var(--neon-red)">叩き壊す：罠を弱める代わりに、報酬が壊れることがある。</span>
</div>`;

  const loot = state.chestState.lootHint;
  let lootText = "";
  if (loot) {
    const auraLabel = loot.aura === "strong" ? `<span style="color:var(--neon-red); font-weight:bold;">強</span>` :
                      loot.aura === "medium" ? `<span style="color:var(--neon-yellow); font-weight:bold;">中</span>` :
                      `<span style="color:var(--text-muted);">弱</span>`;
    lootText = `
      <div class="chest-loot-hint">
        <div>宝気: <span style="color:#fff;">${loot.label}</span></div>
        <div>魔力反応: ${auraLabel}</div>
      </div>
    `;
  }

  infoPanel.innerHTML = `
    <div>${riskText}</div>
    <div style="margin-top:4px;">${inspectText}</div>
    ${lootText}
    ${helpText}
  `;
  optGrid.appendChild(infoPanel);

  // Inspect Chest
  const btnInspect = document.createElement("button");
  btnInspect.id = "btn-chest-inspect";
  btnInspect.className = "btn btn-neon btn-block";
  btnInspect.style.minHeight = "44px";
  if (state.chestState.inspected) {
    btnInspect.textContent = "調査済み";
    btnInspect.disabled = true;
    btnInspect.classList.add("disabled");
  } else {
    btnInspect.textContent = "調べる";
    btnInspect.addEventListener("click", () => {
      // Thief class has high inspect rate, others low
      const thief = state.party.find(c => c.class === "Thief" && ["ok", "poisoned", "blind"].includes(c.status));
      let chance = thief ? 0.85 : 0.30;
      if (thief && thief.status === "blind") {
        chance = chance / 2.0;
      } else if (!thief) {
        const activeChar = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status));
        if (activeChar && activeChar.status === "blind") {
          chance = chance / 2.0;
        }
      }
      const lightBonus = state.lightPower === "lomilwa" ? 0.25 : (state.lightTurns > 0 ? 0.15 : 0);
      if (lightBonus > 0) {
        chance = Math.min(0.95, chance + lightBonus);
        addLog(`明かりの呪文が罠の調査を助けている。成功率 +${Math.round(lightBonus * 100)}%`);
      }
      state.chestState.inspected = true;
      state.chestState.inspectChance = chance; // Save inspect success rate for reliability display
      
      if (Math.random() < chance) {
        state.chestState.identifiedTrap = state.chestState.trap;
        addLog(`調査結果：[${translateTrap(state.chestState.trap)}]の罠のようだ！`);
      } else {
        // Pick random false trap
        const falseTraps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
        const randTrap = falseTraps[Math.floor(Math.random() * falseTraps.length)];
        state.chestState.identifiedTrap = randTrap;
        addLog(`調査結果：[${translateTrap(randTrap)}]の罠の可能性が高い。（不確実）`);
      }
      playSound("move");
      openChestMenu(); // redraw
    });
  }

  // Disarm Chest
  const btnDisarm = document.createElement("button");
  btnDisarm.id = "btn-chest-disarm";
  btnDisarm.className = "btn btn-neon btn-block";
  btnDisarm.style.minHeight = "44px";
  if (!state.chestState.inspected) {
    btnDisarm.textContent = "解除（要調査）";
    btnDisarm.disabled = true;
    btnDisarm.classList.add("disabled");
  } else if (state.chestState.identifiedTrap === "none" || state.chestState.identifiedTrap === "") {
    btnDisarm.textContent = "解除不要";
    btnDisarm.disabled = true;
    btnDisarm.classList.add("disabled");
  } else {
    btnDisarm.textContent = "解除する";
    btnDisarm.addEventListener("click", () => {
      if (!transitionChestPhase(state.chestState, CHEST_PHASES.DISARM_SELECT)) return;
      openSubmenu("chest_disarmer_select", "罠を解除するキャラクターを選択：");
    });
  }

  // Append action buttons directly to grid for 1-column layout
  optGrid.appendChild(btnInspect);
  optGrid.appendChild(btnDisarm);

  // Disarm with a consumable kit without inspection or class-based rewards.
  if (state.inventory.includes("TRAP_KIT")) {
    const btnKit = document.createElement("button");
    btnKit.id = "btn-chest-trap-kit";
    btnKit.className = "btn btn-neon btn-block";
    btnKit.textContent = "キットで解除";
    btnKit.style.minHeight = "44px";
    btnKit.addEventListener("click", () => {
      if (useTrapKit()) openChestMenu();
    });
    optGrid.appendChild(btnKit);
  }

  // Open Chest
  const btnOpen = document.createElement("button");
  btnOpen.className = "btn btn-neon btn-block";
  btnOpen.textContent = "宝箱を開ける";
  btnOpen.style.minHeight = "44px";
  btnOpen.addEventListener("click", () => {
    if (!transitionChestPhase(state.chestState, CHEST_PHASES.OPEN_SELECT)) return;
    openSubmenu("chest_opener_select", "宝箱を開けるキャラクターを選択：");
  });
  optGrid.appendChild(btnOpen);

  // Smash Chest
  const btnSmash = document.createElement("button");
  btnSmash.id = "btn-chest-smash";
  btnSmash.className = "btn btn-danger btn-block";
  btnSmash.textContent = "叩き壊す";
  btnSmash.title = "罠を弱める代わりに、報酬が壊れることがあります";
  btnSmash.style.minHeight = "44px";
  btnSmash.addEventListener("click", () => {
    btnSmash.disabled = true;
    smashChest();
  }, { once: true });
  optGrid.appendChild(btnSmash);

  // Leave Chest
  const btnLeave = document.createElement("button");
  btnLeave.className = "btn btn-danger btn-block";
  btnLeave.textContent = "立ち去る";
  btnLeave.style.minHeight = "44px";
  btnLeave.addEventListener("click", () => {
    leaveChest();
  });
  optGrid.appendChild(btnLeave);
  
  // Custom back button disable because we are in event
  document.getElementById("btn-submenu-back").style.display = "none";
  updateUI();
}

export function leaveChest() {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const chest = state.chestState;
  trackChestChoice(chest, "leave");
  addLog("宝箱を開けずに立ち去った。");
  // Clear chest event on current cell
  state.map[state.y][state.x].event = null;
  markMapChanged();
  if (!chest.fromDrop && state.floorChestsOpened) {
    state.floorChestsOpened[state.floor - 1] = (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
  }
  finishChest(chest);
  state.gameState = "explore";
  saveAutosave();
  updateUI();
  return true;
}




function recoverChestDisarmTransition(error) {
  console.error("Failed to finish chest disarm transition", error);
  state.transitioning = false;
  if (state.chestState) {
    state.chestState.phase = CHEST_PHASES.MENU;
    openChestMenu();
  } else {
    state.gameState = "explore";
    updateUI();
  }
}

function recoverChestOpenTransition(error, chest = state.chestState) {
  console.error("Failed to finish chest open transition", error);
  state.transitioning = false;

  // An opening attempt may have applied part of its trap/reward effects before
  // failing. Do not leave a partially processed chest available for a retry.
  const cell = chest && state.map?.[chest.y]?.[chest.x];
  if (cell?.event === "chest") {
    cell.event = null;
    markMapChanged();
  }
  if (chest) transitionChestPhase(chest, CHEST_PHASES.TERMINAL);
  state.chestState = null;
  state.gameState = "explore";
  resetSubmenuBackButton();
  updateUI();
}

function getChestRewardEntries(chest) {
  return [
    { role: "main", item: chest?.item },
    { role: "special", item: chest?.specialItem },
    { role: "accessory", item: chest?.accessoryItem }
  ];
}

function trackChestChoice(chest, action) {
  trackChestAction(chest, action, {
    state,
    character: state.party[0],
    combat: state.combatState,
    floor: state.floor,
    trap: chest?.trap || "none",
    inventoryCount: state.inventory.length,
    hasTrapKit: state.inventory.includes("TRAP_KIT"),
    rewardCount: getChestRewardEntries(chest).filter(reward => reward.item).length
  });
}

function markChestProcessed(chest) {
  const cell = state.map?.[chest.y]?.[chest.x];
  if (cell?.event === "chest") {
    cell.event = null;
    markMapChanged();
  }
  if (!chest.fromDrop && state.floorChestsOpened) {
    state.floorChestsOpened[state.floor - 1] =
      (state.floorChestsOpened[state.floor - 1] ?? 0) + 1;
  }
}

export function executeDisarm(char, rng = Math.random) {
  if (
    !chestActionAllowed([CHEST_PHASES.DISARM_SELECT]) ||
    !isEligibleChestCharacter(char)
  ) return false;

  trackChestChoice(state.chestState, "disarm");
  transitionChestPhase(state.chestState, CHEST_PHASES.RESOLVING);

  applyTombRaiderTrapTier(state.chestState, char);
  const chance = calculateChestDisarmChance({
    className: char.class,
    trapBonus: getCharTrapBonus(char),
    blind: char.status === "blind"
  });
  const success = rng() < chance;
  
  state.transitioning = true;
  try {
    updateUI();
    if (success) {
      addLog(`解除成功！${char.name}は無事に罠を解除した。`);
      const tKey = state.chestState.trap;
      if (state.codex && state.codex.events && state.codex.events.traps) {
      if (state.codex.events.traps[tKey]) {
        state.codex.events.traps[tKey].disarmed++;
        if (state.codex.events.traps[tKey].firstFloor === 0) {
          state.codex.events.traps[tKey].firstFloor = state.floor;
        }
      }
    }
    if (state.currentRun) {
      state.currentRun.trapsDisarmed++;
    }
    const previousTrapBonus = char.runTrapAttackBonus || 0;
    char.runTrapAttackBonus = getTrapEaterBonusAfterDisarm(char, previousTrapBonus);
    if (char.runTrapAttackBonus > previousTrapBonus) {
      addLog(getCoreLogText("CORE_TRAP_EATER"));
    }
    state.chestState.trap = "none";
    playSound("heal");
  } else {
    addLog(`解除失敗！${char.name}は罠を作動させてしまった！`);
    if (state.currentRun) {
      state.currentRun.trapsTriggered++;
    }
    triggerChestTrap(char, false, rng);
  }
  } catch (error) {
    recoverChestDisarmTransition(error);
    return false;
  }
  
  // Open the chest after disarm attempt resolves
  setTimeout(() => {
    try {
      if (!state.chestState) {
        state.transitioning = false;
        state.gameState = "explore";
        updateUI();
        return;
      }
      if (getChestPhase(state.chestState) !== CHEST_PHASES.RESOLVING) {
        state.transitioning = false;
        return;
      }
      openChestDirectly(char, rng, {
        recordAction: false,
        allowTransition: true,
        fromDisarm: true
      });
    } catch (error) {
      recoverChestDisarmTransition(error);
    }
  }, 1500);
  return true;
}

export function triggerChestTrap(char, weakened = false, rng = Math.random) {
  if (!state.chestState || state.chestState.trap === "none") return;
  const trap = state.chestState.trap;
  if (state.codex && state.codex.events && state.codex.events.traps) {
    if (state.codex.events.traps[trap]) {
      state.codex.events.traps[trap].triggered++;
      if (state.codex.events.traps[trap].firstFloor === 0) {
        state.codex.events.traps[trap].firstFloor = state.floor;
      }
    }
  }
  state.chestState.trap = "none";
  playSound("chest_trap");
  if (renderer) renderer.triggerShake(10, 400);

  const targetIndex = Math.max(0, state.party.indexOf(char));
  const effect = applyTrapGuardToEffect(resolveChestTrapEffect({
    trap,
    weakened,
    party: state.party,
    targetIndex,
    poisonWard: getCharAffixSum(char, "poisonWard"),
    rng
  }), {
    trapGuardByParty: state.party.map(member => getCharAffixSum(member, "trapGuard")),
    targetIndex
  });

  if (trap === "poison needle") {
    const damage = effect.targetDamage;
    char.hp = Math.max(0, char.hp - damage);
    clearCharIncapacitationOnDamage(char);
    const poisonTriggered = effect.targetPoisonTriggered;
    const resisted = effect.targetPoisonResisted;
    if (char.hp === 0) {
      char.status = "dead";
      recordCharDeath(state, char, "宝箱の罠「毒針」", { type: "trap", source: "宝箱の毒針" });
    } else if (poisonTriggered && !resisted) {
      applyStatusEffect(char, STATUS_EFFECT_IDS.POISONED, {
        remainingTurns: EXPLORATION_POISON_DURATION_STEPS,
        source: "chest"
      });
    }
    const poisonResult = resisted
      ? "毒避けの備えで毒は免れた！"
      : (poisonTriggered
        ? `毒状態になった！（探索中${EXPLORATION_POISON_DURATION_STEPS}歩で自然に消える）`
        : "毒は付着しなかった。");
    addLog(`毒針が作動！${char.name}は${damage}のダメージを受けた。${poisonResult}`);
    if (renderer) renderer.addDamageText(String(damage), "#ff3b30");
  } else if (trap === "gas bomb") {
    addLog("ガス爆弾が作動！冒険者はガスに包まれた！");
    state.party.forEach((c, index) => {
      const dmg = effect.partyDamage[index];
      if (dmg > 0) {
        c.hp = Math.max(0, c.hp - dmg);
        clearCharIncapacitationOnDamage(c);
        if (c.hp === 0) {
          c.status = "dead";
          recordCharDeath(state, c, "宝箱の罠「ガス爆弾」", { type: "trap", source: "宝箱のガス爆弾" });
        }
        addLog(`${c.name}は${dmg}のガスダメージを受けた。`);
      }
    });
  } else if (trap === "teleporter") {
    if (effect.teleporterFailed) {
      addLog("テレポーターは衝撃で壊れ、不発に終わった！");
      return;
    }
    // Teleport to random coordinates inside map paths
    // Find empty spots (must not be isolated "stone/wall" cells - i.e. must have at least one open wall)
    const emptySpots = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        const cell = state.map[y][x];
        const isPassable = cell.walls.some(closed => !closed);
        if (isPassable && cell.event !== "boss") {
          emptySpots.push({ x, y });
        }
      }
    }
    const spot = emptySpots.length > 0
      ? emptySpots[Math.floor(rng() * emptySpots.length)]
      : null;
    if (spot) {
      state.x = spot.x;
      state.y = spot.y;
      markMapCellVisited(state.x, state.y);
      addLog("テレポーターが作動！冒険者は別の場所にテレポートした！");
    } else {
      addLog("テレポーターは行き先を見つけられず、その場に留まった。");
    }
  } else if (trap === "flash bomb") {
    addLog("閃光弾が作動！まばゆい光が冒険者を包み込んだ！");
    if (renderer && typeof renderer.triggerFlash === "function") {
      renderer.triggerFlash(400);
    }
    state.party.forEach((c, index) => {
      if (effect.partyBlind[index]) {
        c.status = "blind";
        addLog(`${c.name}は光に目がくらみ、盲目状態になった！`);
      }
    });
  }
}

export function useTrapKit() {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const kitIndex = state.inventory.indexOf("TRAP_KIT");
  if (kitIndex < 0) return false;

  trackChestChoice(state.chestState, "trap_kit");
  state.inventory.splice(kitIndex, 1);
  state.chestState.trap = "none";
  addLog("罠外しキットを使い、宝箱の罠を確実に解除した。キットは壊れた。");
  playSound("heal");
  return true;
}

export function smashChest(rng = Math.random) {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const chest = state.chestState;
  const trapFired = Boolean(chest.trap && chest.trap !== "none");
  trackChestChoice(chest, "smash");
  state.transitioning = true;
  transitionChestPhase(chest, CHEST_PHASES.RESOLVING);
  try {
    const trapTarget = state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status)) || state.party[0];
    addLog("宝箱を力任せに叩き壊した！");

    if (chest.trap && chest.trap !== "none") {
      if (state.currentRun) state.currentRun.trapsTriggered++;
      triggerChestTrap(trapTarget, true, rng);
    }

    return openChestDirectly(null, rng, {
      smash: true,
      recordAction: false,
      allowTransition: true,
      smashTrapFired: trapFired
    });
  } catch (error) {
    recoverChestOpenTransition(error, chest);
    return false;
  }
}

export function openChestDirectly(opener = null, rng = Math.random, options = {}) {
  if (!state.chestState) return false;
  if (options.smash !== true && options.fromDisarm !== true && !isEligibleChestCharacter(opener)) return false;
  // A failed disarm may kill the already-validated disarmer before the
  // automatic reward resolution. Keep that internal continuation legal.
  if (options.fromDisarm === true && !state.party.includes(opener)) return false;
  const allowedPhases = options.fromDisarm || options.smash
    ? [CHEST_PHASES.RESOLVING]
    : [CHEST_PHASES.MENU, CHEST_PHASES.OPEN_SELECT];
  if (!chestActionAllowed(allowedPhases, { allowTransition: options.allowTransition === true })) {
    return false;
  }
  if (!options.fromDisarm && !options.smash) {
    transitionChestPhase(state.chestState, CHEST_PHASES.RESOLVING);
  }
  state.transitioning = true;
  try {
    const smash = options.smash === true;
    menuContext.type = "chest_result";
    const chest = state.chestState;
    if (options.recordAction !== false && !smash) trackChestChoice(chest, "open");
    const tombRaiderActivated = applyTombRaiderTrapTier(chest, opener);

    if (state.currentRun) {
      state.currentRun.chestsOpened++;
    }

    const translateTrap = (t) => {
      if (t === "poison needle") return "毒針";
      if (t === "gas bomb") return "ガス爆弾";
      if (t === "teleporter") return "テレポーター";
      if (t === "flash bomb") return "閃光弾";
      return "なし";
    };

    // If trap is still active, trigger on selected opener if provided.
    if (chest.trap && chest.trap !== "none") {
      const trapTarget = opener || state.party.find(c => ["ok", "poisoned", "blind"].includes(c.status)) || state.party[0];
      addLog(`宝箱を開けた瞬間、罠 [${translateTrap(chest.trap)}] が作動した！`);
      if (state.currentRun) {
        state.currentRun.trapsTriggered++;
      }
      triggerChestTrap(trapTarget, false, rng);
    }

    // Smash has a deliberate two-stage risk: the weakened trap resolves first,
    // then a dead party stops all reward work. Ordinary open/disarm/kit paths
    // retain their existing reward behavior and never use these loss rolls.
    if (smash && !state.party.some(c => c.status !== "dead")) {
      const rewardCount = getChestRewardEntries(chest).filter(reward => reward.item).length;
      trackChestSmashResult(chest, {
        floor: state.floor,
        trapFired: options.smashTrapFired,
        partyDied: true,
        rewardCount,
        lostRewardCount: 0,
        lostRewardRoles: [],
        lostRewardCategories: [],
        remainingRewardCount: 0,
        awardedRewardCount: 0,
        unawardedRewardCount: rewardCount
      });
      markChestProcessed(chest);
      finishChest(chest);
      state.gameState = "explore";
      updateUI();
      setTimeout(() => {
        resetSubmenuBackButton();
        state.transitioning = false;
        triggerGameOver();
      }, 1800);
      return true;
    }

    if (smash) {
      const rewardEntries = getChestRewardEntries(chest);
      const rewardCount = rewardEntries.filter(reward => reward.item).length;
      const losses = resolveChestSmashRewardLosses(rewardEntries, rng);
      const lostRoles = new Set(losses.map(loss => loss.role));
      if (lostRoles.has("main")) chest.item = null;
      if (lostRoles.has("special")) chest.specialItem = null;
      if (lostRoles.has("accessory")) chest.accessoryItem = null;

      if (losses.length === 0) {
        addLog("叩き壊した衝撃に耐え、報酬は無事だった。");
      } else if (losses.length > 1) {
        addLog("叩き壊した衝撃で、複数の報酬が失われた。");
      } else if (losses[0].category === "usable") {
        addLog("叩き壊した衝撃で、消耗品が砕けていた。");
      } else {
        addLog("叩き壊した衝撃で、装備品が壊れていた。");
      }
      chest.smashTelemetry = {
        floor: state.floor,
        trapFired: options.smashTrapFired,
        partyDied: false,
        rewardCount,
        lostRewardCount: losses.length,
        lostRewardRoles: losses.map(loss => loss.role),
        lostRewardCategories: losses.map(loss => loss.category),
        remainingRewardCount: rewardEntries.filter(reward => reward.item && !lostRoles.has(reward.role)).length
      };
    }

    transitionChestPhase(chest, CHEST_PHASES.REWARD);
    clearChestInspectionState(chest);

    // 素材束の獲得
    const tombRaider = getCharCoreParams(opener, "CORE_TOMB_RAIDER");
    const mats = generateChestMaterials(state.floor, rng, tombRaider?.materialBonus || 0);
    if (Object.keys(mats).length > 0) {
      Object.entries(mats).forEach(([mat, qty]) => {
        if (state.currentRun) {
          state.currentRun.materials ||= {};
          state.currentRun.materials[mat] = (state.currentRun.materials[mat] || 0) + qty;
        }
      });
      const matStr = Object.entries(mats).map(([mat, qty]) => `${mat} x${qty}`).join(", ");
      addLog(`宝箱から素材束: [${matStr}] を獲得した！`);
      if (tombRaiderActivated || tombRaider) addLog(getCoreLogText("CORE_TOMB_RAIDER"));
    }

    if (rng() < IDENTIFICATION_BALANCE.chestPowderChance) {
      state.identifyTickets = (state.identifyTickets || 0) + 1;
      addLog("宝箱から鑑定粉を1個見つけた！");
    }
  
    if (state.codex && state.codex.events && state.codex.events.facilities) {
      if (!state.codex.events.facilities.chest) {
        state.codex.events.facilities.chest = { found: 1, opened: 0 };
      }
      state.codex.events.facilities.chest.opened++;
    }
  
    let awardedRewardCount = 0;

    // Award Item
    if (chest.item) {
      const item = getItemData(chest.item);
      const added = addInventoryItem(chest.item);
      if (added) {
        awardedRewardCount++;
        recordEquipmentDiscovery(chest.item);
        if (state.currentRun) {
          if (typeof chest.item === "string") {
            state.currentRun.itemsFound.push(chest.item);
          } else {
            state.currentRun.equipmentFound.push(chest.item);
            if (state.floor === 1) {
              state.currentRun.b1EquipFound = (state.currentRun.b1EquipFound || 0) + 1;
            }
          }
        }
        addLog(`アイテム: [${item.name}] を手に入れた！`);
      } else {
        addLog(`[!] バッグがいっぱいで [${item.name}] を持ち帰れなかった！`);
      }
    }

    if (chest.specialItem) {
      const added = addInventoryItem(chest.specialItem);
      if (added) {
        awardedRewardCount++;
        recordEquipmentDiscovery(chest.specialItem);
        if (state.currentRun) state.currentRun.itemsFound.push(chest.specialItem);
        addLog("箱の底に帰還の翼が残されていた――帰還の翼を手に入れた。");
      } else {
        const alreadyHasWing = state.inventory.some(item => getItemBaseId(item) === "TOWN_PORTAL");
        if (alreadyHasWing) {
          addLog("帰還の翼はすでに所持している。");
        } else if (state.inventory.length >= 20) {
          addLog("[!] バッグがいっぱいで [帰還の翼] を持ち帰れなかった！");
        } else {
          addLog("帰還の翼を持ち帰れなかった。");
        }
      }
    }

    if (chest.accessoryItem) {
      const item = getItemData(chest.accessoryItem);
      const added = addInventoryItem(chest.accessoryItem);
      if (added) {
        awardedRewardCount++;
        recordEquipmentDiscovery(chest.accessoryItem);
        if (state.currentRun) {
          state.currentRun.equipmentFound.push(chest.accessoryItem);
          if (state.floor === 1) {
            state.currentRun.b1EquipFound = (state.currentRun.b1EquipFound || 0) + 1;
          }
        }
        addLog(`装身具: [${item.name}] を手に入れた！`);
      } else {
        addLog(`[!] バッグがいっぱいで [${item.name}] を持ち帰れなかった！`);
      }
    }

    // Clear the original chest cell even if a trap moved the party.
    markChestProcessed(chest);

    // Check game over
    const partyAlive = state.party.some(c => c.status !== "dead");
    if (smash) {
      trackChestSmashResult(chest, {
        ...chest.smashTelemetry,
        awardedRewardCount,
        unawardedRewardCount: Math.max(0, (chest.smashTelemetry?.remainingRewardCount ?? 0) - awardedRewardCount)
      });
      delete chest.smashTelemetry;
    }
    if (partyAlive) {
      resetSubmenuBackButton();
      state.transitioning = false;
      finishChest(chest);
      state.gameState = "explore";
      saveAutosave();
      updateUI();
      return true;
    }

    finishChest(chest);
    updateUI();
    setTimeout(() => {
      resetSubmenuBackButton();
      state.transitioning = false;
      triggerGameOver();
    }, 1800);
  } catch (error) {
    recoverChestOpenTransition(error);
    return false;
  }
}

export function generateChestMaterials(
  floor,
  rng = Math.random,
  bonus = 0,
  { materialPoolProfile } = {}
) {
  const mats = {};
  const qty = Math.floor(rng() * 3) + 1 + bonus; // 1-3個 + コア補正
  const pool = getChestMaterialPool(floor, { profile: materialPoolProfile });

  for (let i = 0; i < qty; i++) {
    const mat = pool[Math.floor(rng() * pool.length)];
    mats[mat] = (mats[mat] || 0) + 1;
  }
  return mats;
}
