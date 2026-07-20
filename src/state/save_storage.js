import { state, addLog } from "./state_core.js";
import { Sentry } from "../sentry.js";
import { generateRandomSeed, createDefaultCodex } from "./initial_state.js";
import { createSavePayload, applySavePayload } from "./save_payload.js";
import { migrateSavePayload } from "./save_migrations.js";
import { START_X, START_Y, DIR_N, MAP_HEIGHT, MAP_WIDTH } from "../data.js";
import { generateRandomMap } from "../map_generator.js";
import { applyDungeonMemoryToMaps } from "./dungeon_state.js";
import { createDefaultRecords } from "./records_state.js";
import { findMapCellByType } from "./warden_gates.js";

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
  state.inventory = ["HEAL_POTION", "HEAL_POTION", "ANTIDOTE"];
  state.firstChestUnidentifiedGuaranteed = false;
  state.openedGates = [];
  
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
  state.visitedMap[state.y][state.x] = true;
  state.lightTurns = 0;
  state.lightPower = "";
  state.repelTurns = 0;
  state.dumapicTurns = 0;
  state.dumapicHint = "";
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
  state.dungeonMemory = { traps: {}, mapFragments: {}, visitedFloors: [1] };

  state.gameState = "town";
  state.combatState = null;
  state.chestState = null;
  state.transitioning = false;
  state.cleared = false;
  state.metaMaterials = {};
  state.workshop = { ranks: {} };
  state.logs = ["クラスを選び、ひとりで迷宮へ潜ろう。"];
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
    Sentry.captureException(err, {
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
  applyDungeonMemoryToMaps();
}

export function loadGame() {
  // 優先度順に読込元を試す。SAVE_KEYが破損してもBACKUP/旧キーから復旧する。
  const sources = [
    { key: SAVE_KEY, label: "オートセーブ" },
    { key: BACKUP_KEY, label: "バックアップ" },
    { key: OLD_SAVE_KEY, label: "旧セーブ" }
  ];

  let firstCorrupt = null;
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
      if (err?.name === "IncompatibleSaveVersionError") {
        foundIncompatibleSave = true;
        continue;
      }
      console.error(`Failed to load save from ${src.label}, trying fallback.`, err);
      // 破損検知(fallbackで復旧しても)。migration不具合の早期発見に有用。
      Sentry.captureException(err, {
        level: "warning",
        tags: { subsystem: "save", op: "load" },
        extra: { source: src.label },
      });
      if (firstCorrupt === null) firstCorrupt = raw;
    }
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
    Sentry.captureMessage("全セーブ読込不能。新規ゲーム開始(進行喪失)", {
      level: "error",
      tags: { subsystem: "save", op: "load-total-loss" },
    });
  }
  initNewGame();
}
