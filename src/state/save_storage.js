import { state } from "./state_core.js";
import { generateRandomSeed, createDefaultRoster, createDefaultCodex, findSuitableRoamingMonsterStart } from "./initial_state.js";
import { createSavePayload, applySavePayload, linkPartyToRoster } from "./save_payload.js";
import { migrateSavePayload } from "./save_migrations.js";
import { START_X, START_Y, DIR_N, MAP_HEIGHT, MAP_WIDTH, registerState } from "../data.js";
import { generateRandomMap } from "../map_generator.js";
import { applyDungeonMemoryToMaps } from "./dungeon_state.js";

const SAVE_KEY = "mobile_wiz_rpg_autosave";
const OLD_SAVE_KEY = "mobile_wiz_rpg_save";


export function initNewGame() {
  state.x = START_X;
  state.y = START_Y;
  state.dir = DIR_N;
  state.prevX = START_X;
  state.prevY = START_Y;
  state.roster = createDefaultRoster();
  state.party = []; // Start with empty party
  state.gold = 150;
  state.inventory = ["HEAL_POTION", "HEAL_POTION"];
  state.firstChestUnidentifiedGuaranteed = false;
  
  if (!state.seed) {
    state.seed = generateRandomSeed();
  }
  
  state.floor = 1;
  const b1 = generateRandomMap(1, null, state.seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, state.seed);
  const b3 = generateRandomMap(3, b2.stairsDownCoord, state.seed);
  const b4 = generateRandomMap(4, b3.stairsDownCoord, state.seed);
  const b5 = generateRandomMap(5, b4.stairsDownCoord, state.seed);
  state.maps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
  applyDungeonMemoryToMaps();

  state.roamingMovementStepCount = 0;
  state.roamingMonsters = [];
  const f4Start = findSuitableRoamingMonsterStart(b4, 4);
  if (f4Start) {
    state.roamingMonsters.push({ floor: 4, x: f4Start.x, y: f4Start.y, name: "フラック" });
  }
  const f5Start = findSuitableRoamingMonsterStart(b5, 5);
  if (f5Start) {
    state.roamingMonsters.push({ floor: 5, x: f5Start.x, y: f5Start.y, name: "フラック" });
  }
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
  state.eventCooldownTurns = 0;
  state.activeMerchantStock = [];

  state.floorChestsOpened = [0, 0, 0, 0, 0];
  registerState(state);
  state.floorChestsTotal = state.maps.map(grid => {
    let count = 0;
    if (grid) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (grid[y] && grid[y][x] && grid[y][x].event === "chest") {
            count++;
          }
        }
      }
    }
    return count;
  });
  state.firstKills = [];
  state.lastReturnedFloor = null;
  state.sessionMaxFloor = 1;
  state.currentRun = null;
  state.runHistory = [];
  state.deathLogs = [];
  state.codex = createDefaultCodex();

  // Contracts & Storage initialization
  state.contracts = [];
  state.activeContract = null;
  state.completedContracts = [];
  state.storage = [];
  state.storageMax = 30;
  state.identifyTickets = 0;
  state.dungeonMemory = { traps: {} };

  state.gameState = "town";
  state.combatState = null;
  state.chestState = null;
  state.transitioning = false;
  state.cleared = false;
  state.materials = {};
  state.remains = []; // 遺留品の初期化
  state.logs = ["リルガミンの街へようこそ。準備を整えて迷宮に入りましょう！"];
  saveAutosave();
}

export function saveGame() {
  saveAutosave();
}

export function saveAutosave() {
  try {
    const data = createSavePayload();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Save autosave failed", err);
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(OLD_SAVE_KEY);
  initNewGame();
}

export function loadGame(forceSaveOnly = false) {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      // 統一キーがない場合、旧手動セーブキーからの移行を試みる
      raw = localStorage.getItem(OLD_SAVE_KEY);
    }
    if (!raw) {
      initNewGame();
      return;
    }
    const data = JSON.parse(raw);
    const migrated = migrateSavePayload(data);
    applySavePayload(migrated);
    applyDungeonMemoryToMaps();
    registerState(state);
    
    // ロード直後に参照の再リンクを念押し
    linkPartyToRoster();

    saveAutosave();
  } catch (err) {
    console.error("Failed to load save, resetting.", err);
    initNewGame();
  }
}

