import { markMapChanged, state } from "./state_core.js";
import { SAVE_VERSION, normalizeSavePayload } from "./save_migrations.js";
import { menuContext, menuHistory } from "../navigation.js";
import { resetEquipState } from "../equip.js";
import { normalizeStatusEffectTarget } from "../combat_logic/status_effects.js";

const STABLE_PERSISTED_GAME_STATES = new Set([
  "town", "explore", "combat", "result", "gameover", "victory"
]);
const DEFAULT_MENU_CONTEXT = Object.freeze({
  type: "",
  actorIdx: -1,
  spellName: "",
  itemKey: "",
  itemIdx: -1,
  prevGameState: null,
  slot: ""
});

// balance-impact: none — this change is a persistence boundary only; reward
// and trap formulas remain covered by their owning modules.
// 一時オーバーレイ状態は付随コンテキストが永続化されないため、そのまま保存すると
// 再開時に壊れる。基底画面へ畳んでから保存する。
//
// - "submenu": 親画面情報(menuContext)が未保存。gameState="submenu" のまま保存すると
//   再開時に menuContext が初期化され、街サブメニュー(お城/工房 等)にいても
//   renderer が街と判定できず、floor=1/START座標(=地下1F登り階段)のダンジョンを描画。
//   closeSubmenu と同じ規則で親画面へ畳む。
// - ordinary "chest" / "submenu": chestState/menuContext が未保存。phase途中の宝箱や
//   選択画面を再開時に復元すると、報酬・罠・操作対象だけが残った不整合状態になるため
//   exploreへ畳む(宝箱マスはマップに残り、再入場時に通常の初期化を行う)。fromDrop chest
//   は例外として、再入場できるマップイベントがないため未開封状態を保存する。
// - "trap_encounter": activeTrapState が未保存。gameState="trap_encounter" のまま保存すると
//   再開時に罠UIが表示されず、罠操作パネルだけ出て操作不能になる。罠は探索中のみ発生する
//   ため explore へ畳む(罠マス上で再開し、踏み直せば罠が再発生する)。
function getStableFallbackGameState() {
  return state.currentRun?.runSeed && !state.currentRun.returnReason ? "explore" : "town";
}

function hasUsableCombatState(combatState) {
  return combatState && typeof combatState === "object" && !Array.isArray(combatState) &&
    Array.isArray(combatState.monsters) &&
    combatState.monsters.length > 0 &&
    combatState.monsters.every(monster => monster && typeof monster === "object" && !Array.isArray(monster));
}

function resolveStableGameState(candidate) {
  if (!STABLE_PERSISTED_GAME_STATES.has(candidate)) return null;
  if (candidate === "combat" && !hasUsableCombatState(state.combatState)) {
    return getStableFallbackGameState();
  }
  return candidate;
}

function resolvePersistedGameState() {
  if (state.chestState?.fromDrop) return "submenu";
  if (state.chestState) return "explore";
  if (state.gameState === "chest") return "explore";
  if (state.gameState === "trap_encounter") return "explore";
  if (state.gameState === "equip_overlay") return "explore";
  if (state.gameState !== "submenu") {
    return resolveStableGameState(state.gameState) || getStableFallbackGameState();
  }
  const stableParent = resolveStableGameState(menuContext.prevGameState);
  if (stableParent) return stableParent;
  const t = menuContext.type || "";
  if (
    t.startsWith("castle") ||
    t.startsWith("solo_start") ||
    t.startsWith("workshop")
  ) {
    return "town";
  }
  if (t.startsWith("combat")) {
    return hasUsableCombatState(state.combatState)
      ? "combat"
      : getStableFallbackGameState();
  }
  if (t.startsWith("milestone")) return "explore";
  return getStableFallbackGameState();
}

export function createSavePayload() {
  const persistedParty = state.party.slice(0, 1).map(char => {
    const persistedChar = { ...char };
    delete persistedChar.runTrapAttackBonus;
    normalizeStatusEffectTarget(persistedChar);
    return persistedChar;
  });

  const persistedCombatState = hasUsableCombatState(state.combatState)
    ? {
      ...state.combatState,
      monsters: state.combatState.monsters.map(monster => {
        const persistedMonster = { ...monster };
        normalizeStatusEffectTarget(persistedMonster);
        return persistedMonster;
      })
    }
    : null;

  const persistedChestState = state.chestState?.fromDrop
    ? { ...state.chestState, phase: "menu" }
    : null;
  if (persistedChestState) delete persistedChestState.smashTelemetry;

  return {
    version: SAVE_VERSION,
    x: state.x,
    y: state.y,
    dir: state.dir,
    party: persistedParty,
    inventory: state.inventory,
    floor: state.floor,
    maps: state.maps,
    visitedMaps: state.visitedMaps,
    lightTurns: state.lightTurns,
    lightPower: state.lightPower,
    repelTurns: state.repelTurns,
    dumapicTurns: state.dumapicTurns,
    dumapicHint: state.dumapicHint,
    activeMerchantStock: state.activeMerchantStock,
    floorChestsOpened: state.floorChestsOpened,
    floorChestsTotal: state.floorChestsTotal,
    firstKills: state.firstKills,
    currentRun: state.currentRun,
    records: state.records,
    unlockedMilestones: state.unlockedMilestones,
    runHistory: state.runHistory,
    deathLogs: state.deathLogs,
    codex: state.codex,
    seed: state.seed,
    gameState: resolvePersistedGameState(),
    combatState: persistedCombatState,
    chestState: persistedChestState,
    prevX: state.prevX,
    prevY: state.prevY,
    roamingMonsters: state.roamingMonsters,
    roamingMovementStepCount: state.roamingMovementStepCount,
    noiseEvents: state.noiseEvents,
    firstChestUnidentifiedGuaranteed: state.firstChestUnidentifiedGuaranteed,
    storage: state.storage,
    storageMax: state.storageMax,
    identifyTickets: state.identifyTickets,
    cleared: state.cleared,
    metaMaterials: state.metaMaterials,
    workshop: state.workshop,
    keyItems: state.keyItems,
    dungeonMemory: state.dungeonMemory,
    logs: state.logs.slice(-30)
  };
}

function resetTransientState() {
  state.transitioning = false;
  state.controlsGuardUntil = 0;
  state.activeTrapState = null;
  resetEquipState();
  Object.keys(menuContext).forEach(key => delete menuContext[key]);
  Object.assign(menuContext, DEFAULT_MENU_CONTEXT);
  menuContext.prevGameState = null;
  menuHistory.length = 0;
}

export function applySavePayload(data) {
  // Normalize the complete payload before mutating state. This keeps malformed
  // direct callers atomic and leaves loadGame's existing fallback path in
  // control when a payload cannot be safely normalized.
  data = normalizeSavePayload(data);
  resetTransientState();
  state.x = data.x;
  state.y = data.y;
  state.dir = data.dir;
  state.prevX = data.prevX;
  state.prevY = data.prevY;
  state.party = data.party.slice(0, 1).map(char => {
    const restoredChar = { ...char };
    delete restoredChar.runTrapAttackBonus;
    normalizeStatusEffectTarget(restoredChar);
    return restoredChar;
  });
  state.inventory = data.inventory;
  state.seed = data.seed;
  state.floor = data.floor;
  state.maps = data.maps;
  state.visitedMaps = data.visitedMaps;
  state.lightTurns = data.lightTurns;
  state.lightPower = data.lightPower;
  state.repelTurns = data.repelTurns;
  state.dumapicTurns = data.dumapicTurns;
  state.dumapicHint = data.dumapicHint;
  state.activeMerchantStock = data.activeMerchantStock;
  state.gameState = data.gameState;
  state.combatState = data.combatState;
  state.combatState?.monsters?.forEach(normalizeStatusEffectTarget);
  state.chestState = data.chestState?.fromDrop
    ? { ...data.chestState, phase: "menu" }
    : null;
  if (state.chestState) {
    delete state.chestState.smashTelemetry;
    state.gameState = "submenu";
    menuContext.type = "chest_menu";
    menuContext.prevGameState = null;
    menuHistory.length = 0;
  }
  state.logs = data.logs;
  state.floorChestsOpened = data.floorChestsOpened;
  state.floorChestsTotal = data.floorChestsTotal;
  state.firstKills = data.firstKills;
  state.sessionMaxFloor = data.floor;
  state.currentRun = data.currentRun;
  state.records = data.records;
  state.unlockedMilestones = data.unlockedMilestones;
  state.runHistory = data.runHistory;
  state.deathLogs = data.deathLogs;
  state.codex = data.codex;
  state.roamingMonsters = data.roamingMonsters;
  state.firstChestUnidentifiedGuaranteed = data.firstChestUnidentifiedGuaranteed;
  state.roamingMovementStepCount = data.roamingMovementStepCount;
  state.noiseEvents = data.noiseEvents ?? [];
  state.storage = data.storage;
  state.storageMax = data.storageMax;
  state.identifyTickets = data.identifyTickets;
  state.cleared = data.cleared;
  state.metaMaterials = data.metaMaterials;
  state.workshop = data.workshop;
  state.keyItems = data.keyItems ?? [];
  state.dungeonMemory = {
    mapFragments: data.dungeonMemory?.mapFragments || {},
    visitedFloors: data.dungeonMemory?.visitedFloors || [1]
  };
  markMapChanged();
}
