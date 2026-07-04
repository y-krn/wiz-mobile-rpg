import { DIR_N, START_X, START_Y, setItemRulesStateRef, setTagsStateRef } from "../data.js";

// Main State Object
export const state = {
  // Exploration Coordinates
  x: START_X,
  y: START_Y,
  dir: DIR_N,
  prevX: START_X,
  prevY: START_Y,

  // Party, Roster & Inventory
  party: [],
  roster: [],
  gold: 150,
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

  // Tracking properties for return checkpointing
  lastReturnedFloor: null,
  sessionMaxFloor: 1,

  currentRun: null,
  runHistory: [],
  deathLogs: [],
  remains: [],
  codex: {
    monsters: {},
    equipment: {},
    events: {
      traps: {
        "poison needle": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "gas bomb": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "teleporter": { triggered: 0, disarmed: 0, firstFloor: 0 },
        "flash bomb": { triggered: 0, disarmed: 0, firstFloor: 0 }
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
  dungeonMemory: { traps: {} },

  // Current screen state: 'town', 'explore', 'combat', 'chest', 'gameover', 'victory'
  gameState: "town",

  // Context-specific substates
  combatState: null,
  chestState: null,

  // Message logs
  logs: [],
  transitioning: false,
  cleared: false,
  materials: {},

  // Dynamic getters for floor-specific maps to maintain backwards compatibility
  get map() {
    return this.maps[this.floor - 1];
  },
  get visitedMap() {
    return this.visitedMaps[this.floor - 1];
  }
};

// Log message helper
export function addLog(msg) {
  state.logs.push(msg);
  if (state.logs.length > 50) {
    state.logs.shift();
  }
}

// 詰み判定 (全員死亡かつ蘇生費不足)
export function isSoftlocked() {
  const hasAlive = state.roster.some(char => char.status !== "dead" && char.status !== "ash");
  if (hasAlive) return false;

  const deadOrAsh = state.roster.filter(char => char.status === "dead" || char.status === "ash");
  if (deadOrAsh.length === 0) {
    return true;
  }

  const minCost = Math.min(...deadOrAsh.map(char => {
    return char.status === "dead" ? char.level * 50 : char.level * 150;
  }));

  return state.gold < minCost;
}

// 詰み救済の新人を迎えられるか判定 (生存メンバー数2人未満かつ蘇生費不足)
export function canRecruitRescueNewcomer() {
  const aliveCount = state.roster.filter(char => char.status !== "dead" && char.status !== "ash").length;
  if (aliveCount >= 2) return false;

  const deadOrAsh = state.roster.filter(char => char.status === "dead" || char.status === "ash");
  if (deadOrAsh.length === 0) {
    return false;
  }

  const minCost = Math.min(...deadOrAsh.map(char => {
    return char.status === "dead" ? char.level * 50 : char.level * 150;
  }));

  return state.gold < minCost;
}

setItemRulesStateRef(state);
setTagsStateRef(state);
