import { BUILD_SEED_CHOICE_ROLE, generateBuildSeedOffer, shouldOfferBuildSeed } from "./systems/build_vnext_seed.js";
import { state, saveAutosave, addLog, clearEventObservations, resolveEventObservation, recordEquipmentDiscovery, recordCharDeath, formatCharDeathLog, markMapChanged, markMapCellVisited } from "./state.js";
import { getCharTrapBonus, getCharAffixSum, getCharCoreParams, getTrapEaterBonusAfterDisarm, getCoreLogText, ITEMS } from "./data.js";
import { canChestHaveTrap, getChestRewardCategory, upgradeMimicChestReward } from "./rules/chest_rules.js";
import { getChestTrapCodexId } from "./state/codex_trap_ids.js";
import { playSound } from "./audio.js";
import { dungeonRenderer as renderer } from "./renderer_runtime.js";
import { updateUI } from "./ui.js";
import { menuContext, resetSubmenuBackButton } from "./navigation.js";
import { startCombat, triggerGameOver } from "./combat.js";
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
import { consumeRunObjectLoot, findRunObjectLootEntry } from "./state/run_loot.js";
import { trackChestAction, trackLootLifecycle, trackTrapResolution, trackValuableLocation } from "./telemetry.js";
import { captureException } from "./sentry.js";
import {
  CHEST_PHASES,
  CHEST_PHASE_TRANSITIONS,
  canTransitionChestPhase,
  generateChestMaterials,
  getChestOpener,
  getChestRewardEntries,
  isChestActionAllowed,
  createChestLootHint,
  resolveChestTrapSign,
  rollChestEncounter
} from "./chest/chest_domain.js";
import { createRng } from "./seed_rng.js";
import { getDungeonFloor, getDungeonRule } from "./rules/dungeons.js";
import { getDarknessChestRarityBonus } from "./systems/darkness.js";
import { renderChestMenu } from "./chest/chest_view.js";
import { recordEliteGreedAction } from "./systems/roaming_elites.js";
import { getFeatAnnouncementLines } from "./systems/feats.js";
import { openPendingRewardMenu, stagePendingRewardBundle } from "./pending_rewards.js";

export { CHEST_PHASES, CHEST_PHASE_TRANSITIONS, generateChestMaterials };

function transitionChestPhase(chest, nextPhase) {
  if (!canTransitionChestPhase(chest, nextPhase)) return false;
  chest.phase = nextPhase;
  return true;
}

function chestActionAllowed(phases, { allowTransition = false } = {}) {
  return isChestActionAllowed(state.chestState, phases, state.transitioning, { allowTransition });
}

function finishChest(chest) {
  transitionChestPhase(chest, CHEST_PHASES.TERMINAL);
  clearEventObservations({ scope: `chest:${state.floor}:${chest?.x}:${chest?.y}` });
  // The chest that was sensed from a distance has now been dealt with (#1821).
  resolveEventObservation(`aura:${state.floor}:chest:${chest?.x}:${chest?.y}`);
  state.chestState = null;
}

// The game is solo; the run keeps its one character at state.party[0].
function getSoloCharacter() {
  return state.party?.[0] ?? null;
}

function translateTrap(trap) {
  if (trap === "poison needle") return "毒針";
  if (trap === "corrosion") return "腐食";
  if (trap === "teleporter") return "テレポーター";
  if (trap === "mimic") return "ミミック";
  if (trap === "flash bomb") return "閃光弾";
  return "なし";
}

// The sign uses its own seeded stream so reading it never shifts the chest's
// trap and reward rolls. A chest restored from an older save has no sign yet
// and still carries the retired inspection fields.
function ensureChestTrapSign(chest) {
  delete chest.inspected;
  delete chest.identifiedTrap;
  delete chest.inspectChance;
  if (chest.trapSign) return;
  const trapSign = resolveChestTrapSign({
    trap: chest.trap,
    character: getChestOpener(getSoloCharacter()),
    lightPower: state.lightPower,
    lightTurns: state.lightTurns,
    rng: state.seed
      ? createRng(`${state.seed}:chest-sign:B${state.floor}:${chest.x},${chest.y}`)
      : Math.random
  });
  chest.trapSign = trapSign.sign;
  chest.trapSignAccuracy = trapSign.accuracy;
}

export function applyTombRaiderTrapTier(chest, opener) {
  const params = getCharCoreParams(opener, "CORE_TOMB_RAIDER");
  if (!params || chest.tombRaiderTrapApplied) return false;
  chest.trap = increaseChestTrapTier(chest.trap, params.trapTierBonus);
  chest.tombRaiderTrapApplied = true;
  return true;
}

function createRestoredMimicEncounter(restored) {
  const character = getSoloCharacter();
  const item = upgradeMimicChestReward(restored.item, {
    floor: state.floor,
    rng: Math.random,
    party: character ? [character] : []
  });
  return {
    trap: "none",
    item,
    specialItem: restored.specialItem ?? null,
    accessoryItem: restored.accessoryItem ?? null,
    consumedFirstChestGuarantee: false,
    lootHint: createChestLootHint({ item, accessoryItem: restored.accessoryItem ?? null, character })
  };
}

export function setupChestState(forcedTrap = null, _legacyReward = null, forcedItem = null, customRng = null, options = {}) {
  void _legacyReward;
  const restored = options.restoredChest || null;
  if (!restored && state.codex && state.codex.events && state.codex.events.facilities) {
    if (!state.codex.events.facilities.chest) {
      state.codex.events.facilities.chest = { found: 0, opened: 0 };
    }
    state.codex.events.facilities.chest.found++;
  }

  if (!restored && getDungeonFloor(state.floor) === 1 && state.currentRun) {
    state.currentRun.b1ChestsOpened = (state.currentRun.b1ChestsOpened || 0) + 1;
  }
  const encounter = restored
    ? createRestoredMimicEncounter(restored)
    : rollChestEncounter({
      floor: state.floor,
      x: state.x,
      y: state.y,
      seed: state.seed,
      character: getSoloCharacter(),
      currentRun: state.currentRun,
      firstChestGuaranteed: state.firstChestUnidentifiedGuaranteed,
      forcedTrap,
      forcedItem,
      customRng,
      fromDrop: options.fromDrop ?? false,
      // The throne's rule (#2063): a chest opened in the dark is better.
      rarityBonus: getDarknessChestRarityBonus(state)
    });
  if (encounter.consumedFirstChestGuarantee) {
    state.firstChestUnidentifiedGuaranteed = true;
  }

  state.chestState = {
    trap: encounter.trap,
    item: encounter.item,
    specialItem: encounter.specialItem,
    accessoryItem: encounter.accessoryItem,
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
  ensureChestTrapSign(state.chestState);
  menuContext.prevGameState = null;
  state.gameState = "submenu";
  menuContext.type = "chest_menu";

  const opener = getChestOpener(getSoloCharacter());
  renderChestMenu({
    chest: state.chestState,
    inventory: state.inventory,
    // The menu says why the chest cannot be opened (#1807); who may open it is unchanged.
    openerBlockedStatus: opener ? null : (getSoloCharacter()?.status || "unknown"),
    disarmChance: opener
      ? calculateChestDisarmChance({ trapBonus: getCharTrapBonus(opener), blind: opener.status === "blind" })
      : 0,
    canUseTrapKit: canChestHaveTrap(getDungeonFloor(state.floor)) && state.inventory.includes("TRAP_KIT"),
    onOpen: () => openChest(),
    onOpenWithKit: () => openChest(Math.random, { useKit: true }),
    onLeave: leaveChest
  });
  updateUI();
}

export function leaveChest() {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const chest = state.chestState;
  trackChestChoice(chest, "leave");
  if (chest.trap && chest.trap !== "none") {
    trackTrapResolution("avoided", {
      state,
      character: getChestOpener(getSoloCharacter()),
      source: "chest",
      trap: chest.trap,
      action: "leave",
      x: chest.x,
      y: chest.y
    });
  }
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




function recoverChestOpenTransition(error, chest = state.chestState) {
  captureException(error, {
    level: "warning",
    tags: { subsystem: "chest", op: "open-transition", recovery: "close-chest" },
    extra: { phase: chest?.phase ?? null, fromDrop: Boolean(chest?.fromDrop) }
  });
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
    .map(reward => getChestRewardCategory(reward.item, reward.role));
  trackChestAction(chest, action, {
    state,
    character: getSoloCharacter(),
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

function recordChestTrapCodex(trap, field) {
  const record = state.codex?.events?.traps?.[getChestTrapCodexId(trap)];
  if (!record) return;
  record[field]++;
  if (record.firstFloor === 0) record.firstFloor = state.floor;
}

// A kit removes the trap without a disarm roll, so it is not counted as a
// disarm in the run record or the codex; CORE_TRAP_EATER rewards both.
function recordChestTrapDisarmed(char, trap, action, extra = {}) {
  if (action !== "trap_kit") {
    recordChestTrapCodex(trap, "disarmed");
    if (state.currentRun) state.currentRun.trapsDisarmed++;
  }
  trackTrapResolution("disarmed", {
    state,
    character: char,
    source: "chest",
    trap,
    action,
    x: state.chestState?.x,
    y: state.chestState?.y,
    ...extra
  });
  if (char) {
    const previousTrapBonus = char.runTrapAttackBonus || 0;
    char.runTrapAttackBonus = getTrapEaterBonusAfterDisarm(char, previousTrapBonus);
    if (char.runTrapAttackBonus > previousTrapBonus) {
      addLog(getCoreLogText("CORE_TRAP_EATER"));
    }
  }
  state.chestState.trap = "none";
}

function consumeTrapKit() {
  const kitIndex = state.inventory.indexOf("TRAP_KIT");
  if (kitIndex < 0) return false;
  const lootId = findRunObjectLootEntry(state, "TRAP_KIT")?.id;
  state.inventory.splice(kitIndex, 1);
  consumeRunObjectLoot(state, "TRAP_KIT");
  if (lootId) trackLootLifecycle("consumed", {
    state,
    itemKey: "TRAP_KIT",
    lootId,
    source: "dungeon"
  });
  return true;
}

// Opening is the only way to claim a chest. A trap is disarmed automatically
// with the opener's run-local trapBonus, or with certainty by a kit; a failed
// automatic disarm fires the trap at full strength before the rewards.
export function openChest(rng = Math.random, { useKit = false } = {}) {
  if (!chestActionAllowed([CHEST_PHASES.MENU])) return false;
  const chest = state.chestState;
  const opener = getChestOpener(getSoloCharacter());
  if (!opener) return false;
  if (useKit && !state.inventory.includes("TRAP_KIT")) return false;

  trackChestChoice(chest, useKit ? "trap_kit" : "open");
  transitionChestPhase(chest, CHEST_PHASES.RESOLVING);
  state.transitioning = true;
  try {
    applyTombRaiderTrapTier(chest, opener);
    const trap = chest.trap;
    if (trap === "mimic") return startMimicCombat(chest, opener, useKit);
    if (useKit) {
      if (trap && trap !== "none") {
        recordChestTrapDisarmed(opener, trap, "trap_kit", {
          toolId: "TRAP_KIT",
          toolUsed: true,
          successRate: 100
        });
        consumeTrapKit();
        addLog("罠外しキットを使い、宝箱の罠を確実に解除した。キットは壊れた。");
        playSound("heal");
      } else {
        addLog("罠は仕掛けられていなかった。キットは使わずに済んだ。");
      }
    } else if (trap && trap !== "none") {
      const chance = calculateChestDisarmChance({
        trapBonus: getCharTrapBonus(opener),
        blind: opener.status === "blind"
      });
      if (rng() < chance) {
        addLog(`${opener.name}は罠「${translateTrap(trap)}」に気づき、解除した。`);
        recordChestTrapDisarmed(opener, trap, "open", { successRate: chance * 100 });
        playSound("heal");
      } else {
        addLog(`解除に失敗した。宝箱を開けた瞬間、罠「${translateTrap(trap)}」が作動した！`);
        if (state.currentRun) state.currentRun.trapsTriggered++;
        triggerChestTrap(opener, rng, "open", { successRate: chance * 100 });
      }
    }
  } catch (error) {
    recoverChestOpenTransition(error, chest);
    return false;
  }
  return resolveChestRewards(opener, rng);
}

export function triggerChestTrap(char, rng = Math.random, action = "open", extra = {}) {
  if (!state.chestState || state.chestState.trap === "none") return;
  const trap = state.chestState.trap;
  trackTrapResolution("triggered", {
    state,
    character: char,
    source: "chest",
    trap,
    action,
    x: state.chestState.x,
    y: state.chestState.y,
    ...extra
  });
  recordChestTrapCodex(trap, "triggered");
  state.chestState.trap = "none";
  playSound("chest_trap");

  const effect = applyTrapGuardToEffect(resolveChestTrapEffect({
    trap,
    character: char,
    inventory: state.inventory,
    poisonWard: getCharAffixSum(char, "poisonWard"),
    statusResistance: getCharAffixSum(char, "statusResistance"),
    rng
  }), {
    trapGuard: getCharAffixSum(char, "trapGuard")
  });

  if (trap === "poison needle") {
    const damage = effect.damage;
    char.hp = Math.max(0, char.hp - damage);
    clearCharIncapacitationOnDamage(char);
    const poisonTriggered = effect.poisonTriggered;
    const resisted = effect.poisonResisted;
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
  } else if (trap === "corrosion") {
    if (effect.corrodedIndex >= 0) {
      const item = effect.corrodedItem;
      state.inventory.splice(effect.corrodedIndex, 1);
      const lootId = findRunObjectLootEntry(state, item)?.id;
      consumeRunObjectLoot(state, item);
      if (lootId) trackLootLifecycle("lost", { state, itemKey: item, lootId, source: "dungeon" });
      addLog(`腐食の罠が作動！${ITEMS[item]?.name || item}が腐り落ちた。`);
    } else {
      addLog("腐食の罠が作動したが、腐らせる物は持っていなかった。");
    }
  } else if (trap === "teleporter") {
    // Teleport to random coordinates inside map paths
    // Find empty spots (must not be isolated "stone/wall" cells - i.e. must have at least one open wall)
    const emptySpots = [];
    // Floors are sized per depth band, so bound the scan by the current map.
    const mapHeight = state.map?.length ?? 0;
    for (let y = 1; y < mapHeight - 1; y++) {
      const row = state.map[y] ?? [];
      for (let x = 1; x < row.length - 1; x++) {
        const cell = row[x];
        if (!cell) continue;
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
    if (effect.blinded) {
      char.status = "blind";
      addLog(`${char.name}は光に目がくらみ、盲目状態になった！`);
    }
  }
}

// A mimic cannot be disarmed by roll or kit; opening it starts a fight. The
// chest's contents ride on the combat state and return as a chest on victory.
function startMimicCombat(chest, opener, usedKit) {
  if (usedKit) addLog("罠外しキットはミミックには通じない。キットは無事だ。");
  addLog("宝箱が牙をむいた！ミミックだ！");
  trackTrapResolution("triggered", {
    state,
    character: opener,
    source: "chest",
    trap: "mimic",
    action: usedKit ? "trap_kit" : "open",
    x: chest.x,
    y: chest.y
  });
  recordChestTrapCodex("mimic", "triggered");
  if (state.currentRun) state.currentRun.trapsTriggered++;
  const mimicChest = {
    item: chest.item ?? null,
    specialItem: chest.specialItem ?? null,
    accessoryItem: chest.accessoryItem ?? null
  };
  playSound("chest_trap");
  markChestProcessed(chest);
  finishChest(chest);
  state.transitioning = false;
  resetSubmenuBackButton();
  startCombat(false, false, false, null, { mimicChest });
  return true;
}

// After a won fight, a dropped chest appears; a defeated mimic leaves its own
// chest with the main reward upgraded. The restored chest is persisted like
// any dropped chest so a reload cannot lose it.
export function setupPostCombatChest(mimicChest = null) {
  if (!mimicChest) {
    setupChestState(null, null, null, null, { fromDrop: true });
    return;
  }
  setupChestState("none", null, null, null, { fromDrop: true, restoredChest: mimicChest });
}

// Rewards resolve after the trap step even when a fired trap killed the
// opener; the game-over transition follows the awarded chest.
function resolveChestRewards(opener, rng = Math.random) {
  if (!chestActionAllowed([CHEST_PHASES.RESOLVING], { allowTransition: true })) {
    return false;
  }
  try {
    menuContext.type = "chest_result";
    const chest = state.chestState;
    trackValuableLocation("chest", "opened", {
      state,
      floor: state.floor,
      x: chest.x,
      y: chest.y,
      source: chest.fromDrop ? "combat" : "chest"
    });

    if (state.currentRun) {
      state.currentRun.chestsOpened++;
      recordEliteGreedAction(state, "chest");
      getFeatAnnouncementLines(state.feats, state.currentRun).forEach(line => addLog(line));
    }

    transitionChestPhase(chest, CHEST_PHASES.REWARD);

    // 素材束の獲得
    const tombRaider = getCharCoreParams(opener, "CORE_TOMB_RAIDER");
    // The forge's rule (#2063): its chests hold more materials.
    const ruleMaterials = getDungeonRule(state.floor)?.chestMaterialBonus || 0;
    const mats = generateChestMaterials(state.floor, rng, (tombRaider?.materialBonus || 0) + ruleMaterials);
    if (Object.keys(mats).length > 0) {
      Object.entries(mats).forEach(([mat, qty]) => {
        if (state.currentRun) {
          state.currentRun.materials ||= {};
          state.currentRun.materials[mat] = (state.currentRun.materials[mat] || 0) + qty;
        }
      });
      const matStr = Object.entries(mats).map(([mat, qty]) => `${mat}×${qty}`).join("・");
      addLog(`宝箱から素材束を手に入れた：${matStr}`);
      if (tombRaider) addLog(getCoreLogText("CORE_TOMB_RAIDER"));
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
  
    const objectRewards = getChestRewardEntries(chest).filter(reward => reward.item);
    objectRewards.forEach(({ item }) => {
      recordEquipmentDiscovery(item);
      if (state.currentRun) {
        if (typeof item === "string") state.currentRun.itemsFound.push(item);
        else {
          state.currentRun.equipmentFound.push(item);
          if (getDungeonFloor(state.floor) === 1) state.currentRun.b1EquipFound = (state.currentRun.b1EquipFound || 0) + 1;
        }
      }
    });
    // Build vNext: the run's first ordinary chest also offers three
    // rule-changing directions; the player keeps at most one.
    const seedOffer = shouldOfferBuildSeed(state, { fromDrop: chest.fromDrop })
      ? generateBuildSeedOffer(state, rng)
      : [];
    if (seedOffer.length > 0) {
      state.currentRun.buildSeedOffered = true;
      seedOffer.forEach(item => recordEquipmentDiscovery(item));
      addLog("宝箱の奥に、戦い方を変えそうな品が3つ並んでいる。1つだけ持っていける。");
    }
    const pendingBundle = stagePendingRewardBundle(state, [
      ...objectRewards,
      ...seedOffer.map(item => ({ item, role: BUILD_SEED_CHOICE_ROLE }))
    ], {
      source: chest.fromDrop ? "combat" : "chest",
      floor: state.floor,
      x: chest.x,
      y: chest.y,
      ...(seedOffer.length > 0 ? { choiceRole: BUILD_SEED_CHOICE_ROLE, choiceLimit: 1 } : {})
    });
    if (pendingBundle) {
      addLog(`戦果 ${pendingBundle.entries.length}件をまとめて解決する。`);
    }

    // Clear the original chest cell even if a trap moved the character.
    markChestProcessed(chest);

    // Check game over
    const character = getSoloCharacter();
    if (character && character.status !== "dead") {
      resetSubmenuBackButton();
      state.transitioning = false;
      finishChest(chest);
      if (pendingBundle) {
        openPendingRewardMenu();
      } else {
        state.gameState = "explore";
      }
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
    return true;
  } catch (error) {
    recoverChestOpenTransition(error);
    return false;
  }
}
