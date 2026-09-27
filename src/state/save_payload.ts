import { markMapChanged, state as rawState } from "./state_core.js";
import { SAVE_VERSION, backfillItemAffixes, normalizeSavePayload } from "./save_migrations.js";
import { menuContext as rawMenuContext, menuHistory } from "../navigation.js";
import { resetEquipState } from "../equip.js";
import { normalizeStatusEffectTarget } from "../combat_logic/status_effects.js";
import { isUsableCombatState } from "./view_state.js";
import { normalizeRecords } from "./records_state.js";
import { EQUIPMENT_SLOTS } from "../rules/equipment_slots.js";
import { normalizeCombatActions } from "../combat_logic/combat_action.js";
import { assertNormalizedSavePayload } from "./save_contract.js";
import { normalizeMaterialBalance } from "./material_balance.js";
import type { NormalizedSavePayload, PersistedGameState } from "./save_contract.js";
import type { StorageCollection, RuntimeItemCollection, RuntimeItemRef } from "./item.js";
import type { CharacterEquipment } from "./equipment.js";

type RuntimeSaveCharacter = NormalizedSavePayload["party"][number];

type SavePayload = Omit<NormalizedSavePayload, "gameState" | "activeMerchantStock"> & {
  gameState: PersistedGameState | "submenu";
  activeMerchantStock: RuntimeItemCollection | undefined;
};

interface SaveCombatState extends Record<string, unknown> {
  lastActions?: unknown[] | null;
  monsters?: Record<string, unknown>[];
}

interface SavePayloadRuntimeState {
  party: RuntimeSaveCharacter[];
  inventory: RuntimeItemCollection;
  x: number;
  y: number;
  dir: number;
  floor: number;
  maps: unknown[];
  visitedMaps: unknown[] | null | undefined;
  lightTurns: number;
  lightPower: string;
  repelTurns: number;
  silenceTurns: number;
  forcedEncounterSteps: number;
  activeMerchantStock: RuntimeItemCollection | undefined;
  floorChestsOpened: unknown[];
  floorChestsTotal: unknown[];
  firstKills: string[];
  currentRun: NormalizedSavePayload["currentRun"];
  records: NormalizedSavePayload["records"];
  unlockedMilestones: number[];
  runHistory: unknown[];
  deathLogs: NormalizedSavePayload["deathLogs"];
  codex: NormalizedSavePayload["codex"];
  seed: string;
  gameState: string;
  combatState: SaveCombatState | null;
  chestState: (Record<string, unknown> & { fromDrop?: boolean }) | null;
  prevX: number;
  prevY: number;
  roamingMonsters: unknown[];
  roamingMovementStepCount: number;
  noiseEvents: unknown[];
  firstChestUnidentifiedGuaranteed: boolean;
  storage: StorageCollection;
  storageMax: number;
  identifyTickets: number;
  cleared: boolean;
  metaMaterials: NormalizedSavePayload["metaMaterials"];
  workshop: NormalizedSavePayload["workshop"];
  keyItems: unknown[];
  dungeonMemory: NormalizedSavePayload["dungeonMemory"];
  logs: string[];
  sessionMaxFloor: number;
  activeTrapState: unknown;
  transitioning: boolean;
  controlsGuardUntil: number;
  mapRevision: number;
}

interface SavePayloadMenuContext {
  [key: string]: unknown;
  type: string;
  prevGameState: unknown;
}

// state_core.js exposes a narrower initial-state inference than its mutable runtime shape.
const state = rawState as unknown as SavePayloadRuntimeState;

function getSaveMenuContext(): SavePayloadMenuContext {
  return rawMenuContext as unknown as SavePayloadMenuContext;
}

function isPersistedGameState(value: string): value is PersistedGameState {
  return value === "town" || value === "explore" || value === "combat" ||
    value === "result" || value === "gameover" || value === "victory";
}
const DEFAULT_MENU_CONTEXT = Object.freeze({
  type: "",
  targetType: "",
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
function getStableFallbackGameState(): PersistedGameState {
  return state.currentRun?.runSeed && !state.currentRun.returnReason ? "explore" : "town";
}

function resolveStableGameState(candidate: unknown): PersistedGameState | null {
  if (typeof candidate !== "string") return null;
  if (!isPersistedGameState(candidate)) return null;
  if (candidate === "combat" && !isUsableCombatState(state.combatState)) {
    return getStableFallbackGameState();
  }
  return candidate;
}

function resolvePersistedGameState(): PersistedGameState | "submenu" {
  const menuContext = getSaveMenuContext();
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
    t.startsWith("workshop") ||
    t.startsWith("run_quest")
  ) {
    return "town";
  }
  if (t.startsWith("combat")) {
    return isUsableCombatState(state.combatState)
      ? "combat"
      : getStableFallbackGameState();
  }
  if (t.startsWith("milestone")) return "explore";
  return getStableFallbackGameState();
}

function sanitizePersistedItem<T extends RuntimeItemRef | null>(item: T): T {
  if (!item || typeof item !== "object") return item;
  const sanitized = structuredClone(item);
  backfillItemAffixes(sanitized);
  return sanitized;
}

export function createSavePayload(): SavePayload {
  const persistedParty = state.party.slice(0, 1).map(char => {
    const persistedChar = { ...char };
    delete persistedChar.runTrapAttackBonus;
    ["str", "int", "pie", "vit", "agi", "luk"].forEach(key => delete persistedChar[key]);
    // EQUIPMENT_SLOTS owns the complete slot set used to construct this shape.
    persistedChar.equipment = Object.fromEntries(
      EQUIPMENT_SLOTS.map(({ id }) => [
        id,
        sanitizePersistedItem(persistedChar.equipment?.[id as keyof CharacterEquipment] || null)
      ])
    ) as unknown as CharacterEquipment;
    normalizeStatusEffectTarget(persistedChar);
    return persistedChar;
  });

  const persistedCombatState = isUsableCombatState(state.combatState)
    ? {
      ...state.combatState,
      lastActions: Array.isArray(state.combatState.lastActions)
        ? normalizeCombatActions(state.combatState.lastActions)
        : null,
      monsters: state.combatState.monsters.map(monster => {
        const persistedMonster = { ...monster };
        normalizeStatusEffectTarget(persistedMonster);
        return persistedMonster;
      })
    }
    : null;

  const persistedChestState: (Record<string, unknown> & { phase: string }) | null = state.chestState?.fromDrop
    ? { ...state.chestState, phase: "menu" }
    : null;
  if (persistedChestState) delete persistedChestState.smashTelemetry;

  return {
    version: SAVE_VERSION,
    x: state.x,
    y: state.y,
    dir: state.dir,
    party: persistedParty,
    inventory: state.inventory.map(item => sanitizePersistedItem(item)),
    floor: state.floor,
    maps: state.maps,
    visitedMaps: state.visitedMaps,
    lightTurns: state.lightTurns,
    lightPower: state.lightPower,
    repelTurns: state.repelTurns,
    silenceTurns: state.silenceTurns,
    forcedEncounterSteps: state.forcedEncounterSteps,
    activeMerchantStock: state.activeMerchantStock?.map(item => sanitizePersistedItem(item)),
    floorChestsOpened: state.floorChestsOpened,
    floorChestsTotal: state.floorChestsTotal,
    firstKills: state.firstKills,
    currentRun: state.currentRun,
    records: normalizeRecords(state.records),
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
    storage: state.storage.map(sanitizePersistedItem),
    storageMax: state.storageMax,
    identifyTickets: state.identifyTickets,
    cleared: state.cleared,
    metaMaterials: normalizeMaterialBalance(state.metaMaterials),
    workshop: state.workshop,
    keyItems: state.keyItems,
    dungeonMemory: state.dungeonMemory,
    logs: state.logs.slice(-30)
  };
}

function resetTransientState() {
  const menuContext = getSaveMenuContext();
  state.transitioning = false;
  state.controlsGuardUntil = 0;
  state.activeTrapState = null;
  resetEquipState();
  Object.keys(menuContext).forEach(key => delete menuContext[key]);
  Object.assign(menuContext, DEFAULT_MENU_CONTEXT);
  menuContext.prevGameState = null;
  menuHistory.length = 0;
}

export function applySavePayload(data: unknown): void {
  // Normalize the complete payload before mutating state. This keeps malformed
  // direct callers atomic and leaves loadGame's existing fallback path in
  // control when a payload cannot be safely normalized.
  const normalized = assertNormalizedSavePayload(normalizeSavePayload(data));
  resetTransientState();
  state.x = normalized.x;
  state.y = normalized.y;
  state.dir = normalized.dir;
  state.prevX = normalized.prevX;
  state.prevY = normalized.prevY;
  state.party = normalized.party.slice(0, 1).map(char => {
    const restoredChar = { ...char };
    delete restoredChar.runTrapAttackBonus;
    ["str", "int", "pie", "vit", "agi", "luk"].forEach(key => delete restoredChar[key]);
    normalizeStatusEffectTarget(restoredChar);
    return restoredChar;
  });
  state.inventory = normalized.inventory;
  state.seed = normalized.seed;
  state.floor = normalized.floor;
  state.maps = normalized.maps;
  state.visitedMaps = normalized.visitedMaps;
  state.lightTurns = normalized.lightTurns;
  state.lightPower = normalized.lightPower;
  state.repelTurns = normalized.repelTurns;
  state.silenceTurns = normalized.silenceTurns;
  state.forcedEncounterSteps = normalized.forcedEncounterSteps;
  state.activeMerchantStock = normalized.activeMerchantStock;
  state.gameState = normalized.gameState;
  state.combatState = normalized.combatState;
  state.combatState?.monsters?.forEach(normalizeStatusEffectTarget);
  state.chestState = normalized.chestState?.fromDrop
    ? { ...normalized.chestState, phase: "menu" }
    : null;
  if (state.chestState) {
    delete state.chestState.smashTelemetry;
    state.gameState = "submenu";
    getSaveMenuContext().type = "chest_menu";
    getSaveMenuContext().prevGameState = null;
    menuHistory.length = 0;
  }
  state.logs = normalized.logs;
  state.floorChestsOpened = normalized.floorChestsOpened;
  state.floorChestsTotal = normalized.floorChestsTotal;
  state.firstKills = normalized.firstKills;
  state.sessionMaxFloor = normalized.floor;
  state.currentRun = normalized.currentRun;
  state.records = normalized.records;
  state.unlockedMilestones = normalized.unlockedMilestones;
  state.runHistory = normalized.runHistory;
  state.deathLogs = normalized.deathLogs;
  state.codex = normalized.codex;
  state.roamingMonsters = normalized.roamingMonsters;
  state.firstChestUnidentifiedGuaranteed = normalized.firstChestUnidentifiedGuaranteed;
  state.roamingMovementStepCount = normalized.roamingMovementStepCount;
  state.noiseEvents = normalized.noiseEvents ?? [];
  state.storage = normalized.storage;
  state.storageMax = normalized.storageMax;
  state.identifyTickets = normalized.identifyTickets;
  state.cleared = normalized.cleared;
  state.metaMaterials = normalized.metaMaterials;
  state.workshop = normalized.workshop;
  state.keyItems = normalized.keyItems ?? [];
  state.dungeonMemory = {
    mapFragments: normalized.dungeonMemory?.mapFragments || {},
    visitedFloors: normalized.dungeonMemory?.visitedFloors || [1]
  };
  markMapChanged();
}
