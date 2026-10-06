import { markMapChanged, markMapCellVisited, state as rawState, addLog } from "./state_core.js";
import { captureException, captureMessage } from "../sentry.js";
import { generateRandomSeed, createDefaultCodex } from "./initial_state.js";
import { createSavePayload, applySavePayload } from "./save_payload.js";
import { SAVE_KEYS } from "../save_keys.js";
import { migrateSavePayload } from "./save_migrations.js";
import { START_X, START_Y, DIR_N } from "../data.js";
import { generateRandomMap } from "../map_generator.js";
import { applyDungeonMemoryToMaps } from "./dungeon_state.js";
import { createDefaultRecords } from "./records_state.js";
import { createDefaultFeatsState } from "./feats_state.js";
import { createDefaultFacilitiesState } from "./facilities_state.js";
import { createDefaultGuidebookState } from "./guidebook_state.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { ensureRunFloor, isUsableFloorMap } from "./run_floor_state.js";

interface SaveStorageState extends Record<string, unknown> {
  x: number;
  y: number;
  dir: number;
  prevX: number;
  prevY: number;
  party: unknown[];
  inventory: unknown[];
  firstChestUnidentifiedGuaranteed: boolean;
  seed: string;
  floor: number;
  maps: Array<SaveMapGrid | null>;
  roamingMovementStepCount: number;
  noiseEvents: unknown[];
  roamingMonsters: unknown[];
  visitedMaps: unknown[][];
  lightTurns: number;
  lightPower: string;
  repelTurns: number;
  silenceTurns: number;
  forcedEncounterSteps: number;
  activeMerchantStock: unknown[];
  floorChestsOpened: number[];
  floorChestsTotal: number[];
  firstKills: string[];
  sessionMaxFloor: number;
  currentRun: { runSeed?: string; returnReason?: unknown } | null;
  records: ReturnType<typeof createDefaultRecords>;
  unlockedMilestones: number[];
  runHistory: unknown[];
  deathLogs: unknown[];
  codex: unknown;
  storage: unknown[];
  storageMax: number;
  identifyTickets: number;
  dungeonMemory: { mapFragments: Record<string, unknown>; visitedFloors: number[] };
  gameState: string;
  combatState: unknown;
  chestState: { fromDrop?: boolean } | null;
  transitioning: boolean;
  cleared: boolean;
  metaMaterials: Record<string, number>;
  workshop: { ranks: Record<string, number>; lateralUnlocks: unknown[] };
  keyItems: unknown[];
  lastPreparation: unknown;
  feats: unknown;
  facilities: unknown;
  guidebook: unknown;
  logs: string[];
}

type MapCoordinate = { x: number; y: number };
type SaveMapGrid = Array<Array<{ event?: unknown } | null> | null>;
type GeneratedSaveMap = { grid: SaveMapGrid; stairsDownCoord: MapCoordinate | null };

// These JavaScript helpers infer null-only optional parameters; their runtime contract accepts generated map coordinates.
const generateSaveMap = generateRandomMap as unknown as (
  floor: number,
  previousStairs: MapCoordinate | null,
  seed: string
) => GeneratedSaveMap;
const findGeneratedMapCell = findMapCellByType as (
  grid: SaveMapGrid,
  type: string
) => MapCoordinate;
const isUsableSavedFloorMap = isUsableFloorMap as (grid: unknown, floor?: number | null) => boolean;

const state = rawState as unknown as SaveStorageState;

interface InitNewGameOptions {
  preserveSeed?: boolean;
}

function isNamedError(error: unknown, name: string): error is { name: string } {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}

export function initNewGame({ preserveSeed = false }: InitNewGameOptions = {}): void {
  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.prevX = START_X;
  state.prevY = START_Y;
  state.party = [];
  state.inventory = [];
  state.firstChestUnidentifiedGuaranteed = false;

  if (!preserveSeed || !state.seed) {
    state.seed = generateRandomSeed();
  }

  state.floor = 1;
  const b1 = generateSaveMap(1, null, state.seed);
  const b2 = generateSaveMap(2, b1.stairsDownCoord, state.seed);
  const b3 = generateSaveMap(3, b2.stairsDownCoord, state.seed);
  const b4 = generateSaveMap(4, b3.stairsDownCoord, state.seed);
  const b5 = generateSaveMap(5, b4.stairsDownCoord, state.seed);
  state.maps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
  const start = findGeneratedMapCell(b1.grid, "stairs-up");
  state.x = start.x;
  state.y = start.y;
  state.prevX = start.x;
  state.prevY = start.y;
  state.roamingMovementStepCount = 0;
  state.noiseEvents = [];
  state.roamingMonsters = [];
  applyDungeonMemoryToMaps();
  state.visitedMaps = state.maps.map(grid => (grid ?? []).map(row => (row ?? []).map(() => false)));

  // Mark initial coordinate as visited
  markMapCellVisited(state.x, state.y);
  state.lightTurns = 0;
  state.lightPower = "";
  state.repelTurns = 0;
  state.silenceTurns = 0;
  state.forcedEncounterSteps = 0;
  state.activeMerchantStock = [];

  state.floorChestsOpened = [0, 0, 0, 0, 0];
  state.floorChestsTotal = state.maps.map(grid => {
    let count = 0;
    if (grid) {
      for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        if (!row) continue;
        for (let x = 0; x < row.length; x++) {
          const cell = row[x];
          if (cell && cell.event === "chest") {
            count++;
          }
        }
      }
    }
    return count;
  });
  state.firstKills = [];
  state.sessionMaxFloor = 1;
  state.currentRun = null;
  state.records = createDefaultRecords();
  state.unlockedMilestones = [];
  state.runHistory = [];
  state.deathLogs = [];
  state.codex = createDefaultCodex();

  // Storage initialization
  state.storage = [];
  state.storageMax = 30;
  state.storageMigrationVersion = 1;
  state.identifyTickets = 0;
  state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };

  state.gameState = "town";
  state.combatState = null;
  state.chestState = null;
  state.transitioning = false;
  state.cleared = false;
  state.metaMaterials = {};
  state.workshop = { ranks: {}, lateralUnlocks: [] };
  state.keyItems = [];
  state.lastPreparation = null;
  state.feats = createDefaultFeatsState();
  state.facilities = createDefaultFacilitiesState();
  state.guidebook = createDefaultGuidebookState();
    state.logs = ["開始キットを選び、ひとりで迷宮へ潜ろう。"];
  markMapChanged();
  saveAutosave();
}

export function saveGame(): void {
  saveAutosave();
}

function persistSave({ rotateBackup = true }: { rotateBackup?: boolean } = {}): void {
  try {
    const keys = SAVE_KEYS;
    const data = JSON.stringify(createSavePayload());
    if (rotateBackup) {
      // 新規書き込み前に直前の正常セーブをバックアップへローテート。
      // setItemは原子的なので、この時点のSAVE_KEYは前回の正常データ。
      const prev = localStorage.getItem(keys.save);
      if (prev) {
        try {
          localStorage.setItem(keys.backup, prev);
        } catch (backupErr) {
          // バックアップ失敗は致命ではない(容量超過など)。本体保存を優先。
          captureException(backupErr, {
            level: "warning",
            tags: { subsystem: "save", op: "backup-rotation", recovery: "continue-primary-save" },
          });
          console.warn("Save backup rotation failed", backupErr);
        }
      }
    }
    writePrimarySave(keys, data);
    saveFailureReported = false;
  } catch (err: unknown) {
    console.error("Save autosave failed", err);
    // 保存自体の失敗はプレイヤーの進行喪失に直結するため送信する。
    captureException(err, {
      level: "error",
      tags: { subsystem: "save", op: "autosave" },
    });
    // Never lose progress silently (#1974): tell the player once until a
    // save succeeds again.
    if (!saveFailureReported) {
      saveFailureReported = true;
      addLog("セーブデータを保存できませんでした。ブラウザの保存容量が不足している可能性があります。");
    }
  }
}

let saveFailureReported = false;

function isQuotaExceeded(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

// The primary save outranks the backup: when storage is full, drop the backup
// copy and retry once before giving up.
function writePrimarySave(keys: typeof SAVE_KEYS, data: string): void {
  try {
    localStorage.setItem(keys.save, data);
  } catch (error: unknown) {
    if (!isQuotaExceeded(error)) throw error;
    localStorage.removeItem(keys.backup);
    localStorage.setItem(keys.save, data);
  }
}

// Ordinary exploration steps defer their autosave (#1973): writing the whole
// save synchronously on every step blocked the main thread for tens of
// milliseconds and stalled the step motion. A deferred save runs once input
// has been quiet for DEFERRED_AUTOSAVE_IDLE_MS, and never later than
// DEFERRED_AUTOSAVE_MAX_MS after the first unsaved step, so a reload loses at
// most the last few steps. It does not rotate the backup; immediate saves at
// events and floor changes still do.
export const DEFERRED_AUTOSAVE_IDLE_MS = 400;
export const DEFERRED_AUTOSAVE_MAX_MS = 2000;
let deferredAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
let deferredAutosaveSince: number | null = null;

function cancelDeferredAutosave(): void {
  if (deferredAutosaveTimer !== null) clearTimeout(deferredAutosaveTimer);
  deferredAutosaveTimer = null;
  deferredAutosaveSince = null;
}

export function hasPendingAutosave(): boolean {
  return deferredAutosaveTimer !== null;
}

/** Write a deferred autosave now, if one is pending. Returns whether it wrote. */
export function flushAutosave(): boolean {
  if (deferredAutosaveTimer === null) return false;
  cancelDeferredAutosave();
  persistSave({ rotateBackup: false });
  return true;
}

/** Autosave after the current burst of steps instead of on this one. */
export function scheduleAutosave(): void {
  if (typeof setTimeout !== "function") {
    persistSave({ rotateBackup: false });
    return;
  }
  const now = Date.now();
  deferredAutosaveSince ??= now;
  if (deferredAutosaveTimer !== null) clearTimeout(deferredAutosaveTimer);
  const wait = Math.max(0, Math.min(DEFERRED_AUTOSAVE_IDLE_MS, deferredAutosaveSince + DEFERRED_AUTOSAVE_MAX_MS - now));
  deferredAutosaveTimer = setTimeout(flushAutosave, wait);
}

export function saveAutosave(): void {
  // An immediate save covers any deferred one.
  cancelDeferredAutosave();
  persistSave();
}

// ロード後の正規化・復旧書き戻しでは、既存のbackup世代を維持する。
function saveLoadedState(): void {
  persistSave({ rotateBackup: false });
}

export function clearSave(): void {
  cancelDeferredAutosave();
  const keys = SAVE_KEYS;
  localStorage.removeItem(keys.save);
  localStorage.removeItem(keys.old);
  localStorage.removeItem(keys.backup);
  localStorage.removeItem(keys.corrupt);
  initNewGame();
}

// 生データからstateへ復元する。失敗時はthrowし、呼び出し側でフォールバックする。
function applyRawSave(raw: string): void {
  const data: unknown = JSON.parse(raw);
  const migrated = migrateSavePayload(data);
  applySavePayload(migrated);
  recoverActiveRunFloorIfNeeded();
  applyDungeonMemoryToMaps();
}

function recoverActiveRunFloorIfNeeded(): void {
  const activeRun = state.currentRun?.runSeed && !state.currentRun.returnReason;
  const explorationState = ["explore", "combat", "chest", "trap_encounter"].includes(state.gameState);
  if (!activeRun || !explorationState) return;

  const floorMap = state.maps?.[state.floor - 1];
  const hadUsableFloorMap = isUsableSavedFloorMap(floorMap, state.floor);
  ensureRunFloor(state, state.floor);
  if (hadUsableFloorMap) return;
  addLog("探索中のマップデータが欠落していたため、同じランの階層を再生成して復旧しました。");
}

export function loadGame(): void {
  const keys = SAVE_KEYS;
  // 優先度順に読込元を試す。SAVE_KEYが破損してもBACKUP/旧キーから復旧する。
  const sources = [
    { key: keys.save, label: "オートセーブ" },
    { key: keys.backup, label: "バックアップ" },
    { key: keys.old, label: "旧セーブ" }
  ];

  let firstCorrupt: string | null = null;
  let recoveryFailure: { raw: string; error: { userMessage: string } } | null = null;
  let foundIncompatibleSave = false;
  for (const src of sources) {
    const raw = localStorage.getItem(src.key);
    if (!raw) continue;
    try {
      applyRawSave(raw);
      if (src.key !== keys.save) {
        addLog(`セーブデータが破損していたため、${src.label}から復旧しました。`);
      }
      // 復旧内容を正データとして確定(SAVE_KEYへ書き戻し)。
      saveLoadedState();
      return;
    } catch (err: unknown) {
      if (isNamedError(err, "RunFloorRecoveryError") && "userMessage" in err && typeof err.userMessage === "string") {
        recoveryFailure ||= { raw, error: { userMessage: err.userMessage } };
        break;
      }
      if (isNamedError(err, "IncompatibleSaveVersionError")) {
        foundIncompatibleSave = true;
        continue;
      }
      console.error(`Failed to load save from ${src.label}, trying fallback.`, err);
      // 破損検知(fallbackで復旧しても)。migration不具合の早期発見に有用。
      captureException(err, {
        level: "warning",
        tags: { subsystem: "save", op: "load" },
        extra: { source: src.label },
      });
      if (firstCorrupt === null) firstCorrupt = raw;
    }
  }

  if (recoveryFailure) {
    try {
      localStorage.setItem(keys.corrupt, recoveryFailure.raw);
    } catch (err: unknown) {
      captureException(err, {
        level: "warning",
        tags: { subsystem: "save", op: "preserve-corrupt", recovery: "active-run-fallback" },
        extra: { reason: "run-floor-recovery-failed" },
      });
      console.error("Failed to preserve unrecoverable active-run save", err);
    }
    state.gameState = "town";
    state.transitioning = false;
    state.logs = [...(state.logs || []), recoveryFailure.error.userMessage];
    return;
  }

  if (foundIncompatibleSave) {
    localStorage.removeItem(keys.save);
    localStorage.removeItem(keys.backup);
    localStorage.removeItem(keys.old);
    initNewGame();
    state.logs = ["旧バージョンのセーブはソロ仕様と互換性がないため破棄しました。開始キットを選んで新しく開始してください。"];
    saveAutosave();
    return;
  }

  // 全滅時のみ新規開始。破損データは上書きせずCORRUPT_KEYへ退避して残す。
  if (firstCorrupt !== null) {
    try {
      localStorage.setItem(keys.corrupt, firstCorrupt);
    } catch (err: unknown) {
      captureException(err, {
        level: "warning",
        tags: { subsystem: "save", op: "preserve-corrupt", recovery: "continue-new-game" },
        extra: { reason: "all-saves-unreadable" },
      });
      console.error("Failed to preserve corrupt save", err);
    }
    console.error("All saves unreadable. Corrupt data preserved under", keys.corrupt);
    // 全読込元が破損=進行の完全喪失。最重要イベントとして送信する。
    captureMessage("全セーブ読込不能。新規ゲーム開始(進行喪失)", {
      level: "error",
      tags: { subsystem: "save", op: "load-total-loss" },
    });
  }
  initNewGame();
  if (firstCorrupt !== null) {
    state.logs = ["セーブデータのマップを読み込めなかったため、新しい冒険を開始しました。破損データは保管されています。"];
    saveAutosave();
  }
}
