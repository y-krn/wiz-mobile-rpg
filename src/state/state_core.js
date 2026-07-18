import { DIR_N, START_X, START_Y } from "../data.js";

// Main State Object
export const state = {
  // Exploration Coordinates
  x: START_X,
  y: START_Y,
  dir: DIR_N,
  prevX: START_X,
  prevY: START_Y,

  // Solo character (kept as a one-element array for combat compatibility) & Inventory
  party: [],
  inventory: ["HEAL_POTION", "HEAL_POTION"],

  // Map & Light
  floor: 1,
  maps: [null, null, null, null, null],
  visitedMaps: [null, null, null, null, null],
  lightTurns: 0,
  lightPower: "",
  repelTurns: 0,
  dumapicTurns: 0,
  dumapicHint: "",
  eventCooldownTurns: 0,
  activeMerchantStock: [],

  // New tracking properties for short-term rewards
  floorChestsOpened: [0, 0, 0, 0, 0],
  floorChestsTotal: [0, 0, 0, 0, 0],
  firstKills: [],

  // Roaming monsters state
  roamingMonsters: [],
  roamingMovementStepCount: 0,
  noiseEvents: [],
  openedGates: [],

  // Tracking properties for the current descent
  sessionMaxFloor: 1,

  currentRun: null,
  runHistory: [],
  deathLogs: [],
  codex: {
    monsters: {},
    equipment: {},
    events: {
      traps: {
        "poison needle": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "gas bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "teleporter": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "flash bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "pitfall": { triggered: 0, disarmed: 0, firstFloor: 0 }
      },
      facilities: {
        spring: { found: 0, used: 0 },
        merchant: { found: 0, purchased: 0 },
        tablet: { found: 0, read: 0 },
        chest: { found: 0, opened: 0 }
      }
    },
    stats: {
      totalRuns: 0,
      totalDeaths: 0,
      deepestFloor: 1,
      totalKills: 0,
      totalChests: 0
    }
  },
  seed: "",

  // Castle Contracts & Warehouse System
  contracts: [],
  activeContract: null,
  completedContracts: [],
  storage: [],
  storageMax: 30,
  identifyTickets: 0,
  dungeonMemory: { traps: {}, mapFragments: {}, visitedFloors: [1] },

  // Current screen state: 'town', 'explore', 'combat', 'chest', 'gameover', 'victory'
  gameState: "town",

  // Context-specific substates
  combatState: null,
  chestState: null,

  // Message logs
  logs: [],
  transitioning: false,
  controlsGuardUntil: 0,
  cleared: false,
  metaMaterials: {},
  workshop: { ranks: {} },

  // Dynamic getters for floor-specific maps to maintain backwards compatibility
  get map() {
    return this.maps[this.floor - 1];
  },
  get visitedMap() {
    return this.visitedMaps[this.floor - 1];
  }
};

// Log message helper.
// Collapses consecutive identical messages into a single "… ×N" entry so
// repeated探索の気配 etc. don't spam the log panel.
const LOG_COUNT_RE = / ×(\d+)$/;
export const LOG_HISTORY_LIMIT = 500;
export function addLog(msg) {
  const logs = state.logs;
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    const m = last.match(LOG_COUNT_RE);
    const lastBase = m ? last.slice(0, m.index) : last;
    if (lastBase === msg) {
      const n = m ? parseInt(m[1], 10) + 1 : 2;
      logs[logs.length - 1] = `${msg} ×${n}`;
      return;
    }
  }
  logs.push(msg);
  if (logs.length > LOG_HISTORY_LIMIT) {
    logs.shift();
  }
}

export function recordCharDeath(stateObj, char, cause) {
  if (!stateObj.currentRun) return;
  if (!stateObj.currentRun.deathLogs) {
    stateObj.currentRun.deathLogs = [];
  }
  const alreadyRecorded = stateObj.currentRun.deathLogs.some(log => log.charName === char.name);
  if (alreadyRecorded) return;

  const turn = stateObj.combatState ? stateObj.combatState.turn : null;
  stateObj.currentRun.deathLogs.push({
    charName: char.name,
    cause: cause,
    floor: stateObj.floor,
    turn: turn
  });

  const turnText = turn !== null ? ` (ターン ${turn})` : "";
  addLog(`☠️ [!] ${char.name}は B${stateObj.floor}F で${cause}により倒れた。${turnText}`);
}
