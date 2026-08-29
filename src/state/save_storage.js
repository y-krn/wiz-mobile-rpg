import { markMapChanged, markMapCellVisited, state, addLog } from "./state_core.js";
import { captureException, captureMessage } from "../sentry.js";
import { generateRandomSeed, createDefaultCodex } from "./initial_state.js";
import { createSavePayload, applySavePayload } from "./save_payload.js";
import { migrateSavePayload } from "./save_migrations.js";
import { START_X, START_Y, DIR_N, MAP_HEIGHT, MAP_WIDTH } from "../data.js";
import { generateRandomMap } from "../map_generator.js";
import { applyDungeonMemoryToMaps } from "./dungeon_state.js";
import { createDefaultRecords } from "./records_state.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { ensureRunFloor, isUsableFloorMap } from "./run_floor_state.js";

const SAVE_KEY = "mobile_wiz_rpg_autosave";
const OLD_SAVE_KEY = "mobile_wiz_rpg_save";
// 直前の正常セーブ(1世代)。SAVE_KEYが破損した際の復旧元。
const BACKUP_KEY = "mobile_wiz_rpg_backup";
// 読込不能だった生データの退避先。上書きせず調査・手動復旧に残す。
const CORRUPT_KEY = "mobile_wiz_rpg_corrupt";


export function initNewGame({ preserveSeed = false } = {}) {
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
  const b1 = generateRandomMap(1, null, state.seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, state.seed);
  const b3 = generateRandomMap(3, b2.stairsDownCoord, state.seed);
  const b4 = generateRandomMap(4, b3.stairsDownCoord, state.seed);
  const b5 = generateRandomMap(5, b4.stairsDownCoord, state.seed);
  state.maps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
  const start = findMapCellByType(b1.grid, "stairs-up");
  state.x = start.x;
  state.y = start.y;
  state.prevX = start.x;
  state.prevY = start.y;
  state.roamingMovementStepCount = 0;
  state.noiseEvents = [];
  state.roamingMonsters = [];
  applyDungeonMemoryToMaps();
  state.visitedMaps = [
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  ];

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
        for (let x = 0; x < grid[y].length; x++) {
          if (grid[y] && grid[y][x] && grid[y][x].event === "chest") {
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
  state.identifyTickets = 0;
  state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };

  state.gameState = "town";
  state.combatState = null;
  state.chestState = null;
  state.transitioning = false;
  state.cleared = false;
  state.metaMaterials = {};
  state.workshop = { ranks: {} };
  state.keyItems = [];
  state.logs = ["クラスを選び、ひとりで迷宮へ潜ろう。"];
  markMapChanged();
  saveAutosave();
}

export function saveGame() {
  saveAutosave();
}

export function saveAutosave() {
  try {
    const data = JSON.stringify(createSavePayload());
    // 新規書き込み前に直前の正常セーブをバックアップへローテート。
    // setItemは原子的なので、この時点のSAVE_KEYは前回の正常データ。
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) {
      try {
        localStorage.setItem(BACKUP_KEY, prev);
      } catch (backupErr) {
        // バックアップ失敗は致命ではない(容量超過など)。本体保存を優先。
        console.warn("Save backup rotation failed", backupErr);
      }
    }
    localStorage.setItem(SAVE_KEY, data);
  } catch (err) {
    console.error("Save autosave failed", err);
    // 保存自体の失敗はプレイヤーの進行喪失に直結するため送信する。
    captureException(err, {
      level: "error",
      tags: { subsystem: "save", op: "autosave" },
    });
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(OLD_SAVE_KEY);
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(CORRUPT_KEY);
  initNewGame();
}

// 生データからstateへ復元する。失敗時はthrowし、呼び出し側でフォールバックする。
function applyRawSave(raw) {
  const data = JSON.parse(raw);
  const migrated = migrateSavePayload(data);
  applySavePayload(migrated);
  recoverActiveRunFloorIfNeeded();
  applyDungeonMemoryToMaps();
}

function recoverActiveRunFloorIfNeeded() {
  const activeRun = state.currentRun?.runSeed && !state.currentRun.returnReason;
  const explorationState = ["explore", "combat", "chest", "trap_encounter"].includes(state.gameState);
  if (!activeRun || !explorationState) return;

  const floorMap = state.maps?.[state.floor - 1];
  const hadUsableFloorMap = isUsableFloorMap(floorMap, state.floor);
  ensureRunFloor(state, state.floor);
  if (hadUsableFloorMap) return;
  addLog("探索中のマップデータが欠落していたため、同じランの階層を再生成して復旧しました。");
  saveAutosave();
}

export function loadGame() {
  // 優先度順に読込元を試す。SAVE_KEYが破損してもBACKUP/旧キーから復旧する。
  const sources = [
    { key: SAVE_KEY, label: "オートセーブ" },
    { key: BACKUP_KEY, label: "バックアップ" },
    { key: OLD_SAVE_KEY, label: "旧セーブ" }
  ];

  let firstCorrupt = null;
  let recoveryFailure = null;
  let foundIncompatibleSave = false;
  for (const src of sources) {
    const raw = localStorage.getItem(src.key);
    if (!raw) continue;
    try {
      applyRawSave(raw);
      if (src.key !== SAVE_KEY) {
        addLog(`セーブデータが破損していたため、${src.label}から復旧しました。`);
      }
      // 復旧内容を正データとして確定(SAVE_KEYへ書き戻し)。
      saveAutosave();
      return;
    } catch (err) {
      if (err?.name === "RunFloorRecoveryError") {
        recoveryFailure ||= { raw, error: err };
        break;
      }
      if (err?.name === "IncompatibleSaveVersionError") {
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
      localStorage.setItem(CORRUPT_KEY, recoveryFailure.raw);
    } catch (err) {
      console.error("Failed to preserve unrecoverable active-run save", err);
    }
    state.gameState = "town";
    state.transitioning = false;
    state.logs = [...(state.logs || []), recoveryFailure.error.userMessage];
    return;
  }

  if (foundIncompatibleSave) {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(OLD_SAVE_KEY);
    initNewGame();
    state.logs = ["旧バージョンのセーブはソロ仕様と互換性がないため破棄しました。クラスを選んで新しく開始してください。"];
    saveAutosave();
    return;
  }

  // 全滅時のみ新規開始。破損データは上書きせずCORRUPT_KEYへ退避して残す。
  if (firstCorrupt !== null) {
    try {
      localStorage.setItem(CORRUPT_KEY, firstCorrupt);
    } catch (err) {
      console.error("Failed to preserve corrupt save", err);
    }
    console.error("All saves unreadable. Corrupt data preserved under", CORRUPT_KEY);
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
