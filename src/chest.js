import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem, recordCharDeath, formatCharDeathLog, markMapChanged, markMapCellVisited, INVENTORY_CAPACITY } from "./state.js";
import { MAP_WIDTH, MAP_HEIGHT, getItemData, getCharTrapBonus, getCharAffixSum, getCharCoreParams, getTrapEaterBonusAfterDisarm, getCoreLogText } from "./data.js";
import {
  getChestSmashRewardCategory,
  resolveChestSmashRewardLosses
} from "./rules/chest_rules.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer.js";
import { updateUI } from "./ui.js";
import { menuContext, resetSubmenuBackButton } from "./navigation.js";
import { triggerGameOver } from "./combat.js";
import { increaseChestTrapTier } from "./systems/traps.js";
import {
  applyStatusEffect,
  clearCharIncapacitationOnDamage,
  rollExplorationPoisonDuration,
  STATUS_EFFECT_IDS
} from "./combat_logic/status_effects.js";
import { IDENTIFICATION_BALANCE } from "./rules/identification_rules.js";
import { calculateChestDisarmChance } from "./rules/trap_rules.js";
import { applyTrapGuardToEffect, resolveChestTrapEffect } from "./rules/trap_effect_rules.js";
import { getItemBaseId } from "./rules/item_rules.js";
import { consumeRunObjectLoot } from "./state/run_loot.js";
import { trackChestAction, trackChestSmashResult, trackValuableLocation } from "./telemetry.js";
import {
  CHEST_PHASES,
  CHEST_PHASE_TRANSITIONS,
  canTransitionChestPhase,
  generateChestMaterials,
  getActiveChestCharacter,
  getChestPhase,
  getChestRewardEntries,
  isChestActionAllowed,
  isEligibleChestCharacter,
  resolveChestInspection,
  rollChestEncounter
} from "./chest/chest_domain.js";
import { renderChestMenu } from "./chest/chest_view.js";
import { recordEliteGreedAction } from "./systems/roaming_elites.js";

export { CHEST_PHASES, CHEST_PHASE_TRANSITIONS, generateChestMaterials };

// balance-impact: none — this change adds only the chest phase/state boundary;
// reward and trap formulas remain covered by the chest balance mapping.
function transitionChestPhase(chest, nextPhase) {
  if (!canTransitionChestPhase(chest, nextPhase)) return false;
  chest.phase = nextPhase;
  return true;
}

function chestActionAllowed(phases, { allowTransition = false } = {}) {
  return isChestActionAllowed(state.chestState, phases, state.transitioning, { allowTransition });
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

function translateTrap(trap) {
  if (trap === "poison needle") return "毒針";
  if (trap === "gas bomb") return "ガス爆弾";
  if (trap === "teleporter") return "テレポーター";
  if (trap === "flash bomb") return "閃光弾";
  return "なし";
}

function inspectChest() {
  const chest = state.chestState;
  if (!chest || state.transitioning || chest.inspected) return false;
  const { chance, lightBonus, identifiedTrap } = resolveChestInspection({
    chest,
    party: state.party,
    lightPower: state.lightPower,
    lightTurns: state.lightTurns
  });
  if (lightBonus > 0) {
    addLog(`明かりの呪文が罠の調査を助けている。成功率 +${Math.round(lightBonus * 100)}%`);
  }
  chest.inspected = true;
  chest.inspectChance = chance;
  chest.identifiedTrap = identifiedTrap;
  if (identifiedTrap === chest.trap) {
    addLog(`調査結果：[${translateTrap(chest.trap)}]の罠のようだ！`);
  } else {
    addLog(`調査結果：[${translateTrap(identifiedTrap)}]の罠の可能性が高い。（不確実）`);
  }
  playSound("move");
  openChestMenu();
  return true;
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
  const encounter = rollChestEncounter({
    floor: state.floor,
    x: state.x,
    y: state.y,
    seed: state.seed,
    party: state.party,
    currentRun: state.currentRun,
    firstChestGuaranteed: state.firstChestUnidentifiedGuaranteed,
    forcedTrap,
    forcedItem,
    customRng,
    fromDrop: options.fromDrop ?? false
  });
  if (encounter.consumedFirstChestGuarantee) {
    state.firstChestUnidentifiedGuaranteed = true;
  }

  state.chestState = {
    trap: encounter.trap,
    item: encounter.item,
    specialItem: encounter.specialItem,
    accessoryItem: encounter.accessoryItem,
    inspected: false,
    identifiedTrap: "",
    phase: CHEST_PHASES.MENU,
    x: state.x,
    y: state.y,
    fromDrop: options.fromDrop ?? false,
    lootHint: encounter.lootHint
  };
  trackValuableLocation("chest", "discovered", {
    state,
    floor: state.floor,
    x: state.x,
    y: state.y,
    source: options.fromDrop ? "combat" : "chest"
  });

  // Transition to chest submenu
  openChestMenu();
}

export function openChestMenu() {
  if (!state.chestState || state.transitioning) return false;
  if (!transitionChestPhase(state.chestState, CHEST_PHASES.MENU)) return false;
  menuContext.prevGameState = null;
  state.gameState = "submenu";
  menuContext.type = "chest_menu";

  renderChestMenu({
    chest: state.chestState,
    floor: state.floor,
    inventory: state.inventory,
    onInspect: inspectChest,
    onDisarm: () => {
      const disarmer = getActiveChestCharacter(state.party);
      if (disarmer) executeDisarm(disarmer);
    },
    onTrapKit: () => {
      if (!useTrapKit()) return false;
      openChestMenu();
      return true;
    },
    onOpen: () => {
      const opener = getActiveChestCharacter(state.party);
      if (opener) openChestDirectly(opener);
    },
    onSmash: smashChest,
    onLeave: leaveChest
  });
  updateUI();
}

export function leaveChest() {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const chest = state.chestState;
  trackChestChoice(chest, "leave");
  trackValuableLocation("chest", "skipped", {
    state,
    floor: state.floor,
    x: chest.x,
    y: chest.y,
    source: chest.fromDrop ? "combat" : "chest"
  });
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

function trackChestChoice(chest, action) {
  const rewardCategories = getChestRewardEntries(chest)
    .filter(reward => reward.item)
    .map(reward => getChestSmashRewardCategory(reward.item, reward.role));
  trackChestAction(chest, action, {
    state,
    character: state.party[0],
    combat: state.combatState,
    floor: state.floor,
    trap: chest?.trap || "none",
    inventoryCount: state.inventory.length,
    hasTrapKit: state.inventory.includes("TRAP_KIT"),
    rewardCount: getChestRewardEntries(chest).filter(reward => reward.item).length,
    rewardCategories: [...new Set(rewardCategories)]
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
    !chestActionAllowed([CHEST_PHASES.MENU, CHEST_PHASES.DISARM_SELECT]) ||
    !isEligibleChestCharacter(char, state.party)
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
    let deathLog = null;
    if (char.hp === 0) {
      char.status = "dead";
      deathLog = recordCharDeath(state, char, "宝箱の罠「毒針」", { type: "trap", source: "宝箱の毒針" });
    } else if (poisonTriggered && !resisted) {
      applyStatusEffect(char, STATUS_EFFECT_IDS.POISONED, {
        remainingTurns: rollExplorationPoisonDuration(rng),
        source: "chest"
      });
    }
    const poisonResult = resisted
      ? "毒避けの備えで毒は免れた！"
      : (poisonTriggered ? "" : "毒は付着しなかった。");
    addLog(`毒針が作動！${char.name}は${damage}のダメージを受けた。${poisonResult}`);
    if (deathLog) addLog(formatCharDeathLog(deathLog));
    if (poisonTriggered && !resisted && char.hp > 0) {
      addLog(`${char.name}は毒に侵された。`);
      addLog("毒はそれほど深くない。やがて体から抜けるだろう。");
    }
    if (renderer) renderer.addDamageText(String(damage), "#ff3b30");
  } else if (trap === "gas bomb") {
    addLog("ガス爆弾が作動！冒険者はガスに包まれた！");
    state.party.forEach((c, index) => {
      const dmg = effect.partyDamage[index];
      if (dmg > 0) {
        c.hp = Math.max(0, c.hp - dmg);
        clearCharIncapacitationOnDamage(c);
        let deathLog = null;
        if (c.hp === 0) {
          c.status = "dead";
          deathLog = recordCharDeath(state, c, "宝箱の罠「ガス爆弾」", { type: "trap", source: "宝箱のガス爆弾" });
        }
        addLog(`${c.name}は${dmg}のガスダメージを受けた。`);
        if (deathLog) addLog(formatCharDeathLog(deathLog));
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
        const isCurrentPosition = x === state.x && y === state.y;
        if (isPassable && cell.event !== "boss" && !isCurrentPosition) {
          emptySpots.push({ x, y });
        }
      }
    }
    const spot = emptySpots.length > 0
      ? (() => {
        // Keep a valid destination even when an injected RNG returns its
        // upper bound. Math.random() normally returns values below 1, but
        // the teleporter contract is stronger: a candidate must not turn
        // into an accidental no-op because of the random index.
        const roll = Number(rng());
        const index = Number.isFinite(roll)
          ? Math.min(emptySpots.length - 1, Math.max(0, Math.floor(roll * emptySpots.length)))
          : 0;
        return emptySpots[index];
      })()
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
  consumeRunObjectLoot(state, "TRAP_KIT");
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
  if (options.smash !== true && options.fromDisarm !== true && !isEligibleChestCharacter(opener, state.party)) return false;
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
    trackValuableLocation("chest", "opened", {
      state,
      floor: state.floor,
      x: chest.x,
      y: chest.y,
      source: chest.fromDrop ? "combat" : "chest"
    });
    const tombRaiderActivated = applyTombRaiderTrapTier(chest, opener);

    if (state.currentRun) {
      state.currentRun.chestsOpened++;
      recordEliteGreedAction(state, "chest");
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
      const added = addInventoryItem(chest.item, { dungeonLoot: true, source: "chest" });
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
      const added = addInventoryItem(chest.specialItem, { dungeonLoot: true, source: "chest" });
      if (added) {
        awardedRewardCount++;
        recordEquipmentDiscovery(chest.specialItem);
        if (state.currentRun) state.currentRun.itemsFound.push(chest.specialItem);
        addLog("箱の底に帰還の翼が残されていた――帰還の翼を手に入れた。");
      } else {
        const alreadyHasWing = state.inventory.some(item => getItemBaseId(item) === "TOWN_PORTAL");
        if (alreadyHasWing) {
          addLog("帰還の翼はすでに所持している。");
        } else if (state.inventory.length >= INVENTORY_CAPACITY) {
          addLog("[!] バッグがいっぱいで [帰還の翼] を持ち帰れなかった！");
        } else {
          addLog("帰還の翼を持ち帰れなかった。");
        }
      }
    }

    if (chest.accessoryItem) {
      const item = getItemData(chest.accessoryItem);
      const added = addInventoryItem(chest.accessoryItem, { dungeonLoot: true, source: "chest" });
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
