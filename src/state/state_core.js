import { DIR_N, START_X, START_Y } from "../data.js";
import { createDefaultRecords } from "./records_state.js";
import { normalizeDeathSource } from "./death_logs.js";

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
  inventory: [],

  // Map & Light
  floor: 1,
  maps: [null, null, null, null, null],
  visitedMaps: [null, null, null, null, null],
  lightTurns: 0,
  lightPower: "",
  repelTurns: 0,
  silenceTurns: 0,
  forcedEncounterSteps: 0,
  mapRevision: 0,
  activeMerchantStock: [],

  // New tracking properties for short-term rewards
  floorChestsOpened: [0, 0, 0, 0, 0],
  floorChestsTotal: [0, 0, 0, 0, 0],
  firstKills: [],

  // Roaming monsters state
  roamingMonsters: [],
  roamingMovementStepCount: 0,
  noiseEvents: [],

  // Tracking properties for the current descent
  sessionMaxFloor: 1,

  currentRun: null,
  records: createDefaultRecords(),
  unlockedMilestones: [],
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

  // Warehouse System
  storage: [],
  storageMax: 30,
  identifyTickets: 0,
  dungeonMemory: { mapFragments: {}, visitedFloors: [1] },

  // Current screen state: 'town', 'explore', 'combat', 'chest', 'gameover', 'victory'
  gameState: "town",

  // Context-specific substates
  combatState: null,
  chestState: null,

  // Message logs
  logs: [],
  // Runtime-only display semantics; persisted logs remain string-compatible.
  logEntries: [],
  transitioning: false,
  controlsGuardUntil: 0,
  cleared: false,
  metaMaterials: {},
  workshop: { ranks: {}, lateralUnlocks: [] },
  keyItems: [],

  // Dynamic getters for floor-specific maps to maintain backwards compatibility
  get map() {
    return this.maps[this.floor - 1];
  },
  get visitedMap() {
    return this.visitedMaps[this.floor - 1];
  }
};

export function markMapChanged(stateLike = state) {
  stateLike.mapRevision = (stateLike.mapRevision ?? 0) + 1;
  return stateLike.mapRevision;
}

export function markMapCellVisited(x, y) {
  const row = state.visitedMap?.[y];
  if (!row || row[x]) return false;
  row[x] = true;
  markMapChanged();
  return true;
}

// Log message helper.
// Collapses consecutive identical messages into a single "… ×N" entry so
// repeated探索の気配 etc. don't spam the log panel.
const LOG_COUNT_RE = / ×(\d+)$/;
export const LOG_HISTORY_LIMIT = 500;
let logEntriesSource = null;

function getLogText(entry) {
  return typeof entry === "object" && entry !== null ? String(entry.text ?? "") : String(entry ?? "");
}

export function getLogEntries() {
  const logs = state.logs;
  if (logEntriesSource !== logs || !Array.isArray(state.logEntries) || state.logEntries.length !== logs.length
    || state.logEntries.some((entry, index) => getLogText(entry) !== getLogText(logs[index]))) {
    state.logEntries = logs.map(text => ({ text: getLogText(text), side: "neutral" }));
    logEntriesSource = logs;
  }
  return state.logEntries;
}

export function addLog(msg, { side = "neutral" } = {}) {
  const logs = state.logs;
  const logEntries = getLogEntries();
  const logEntry = { text: String(msg ?? ""), side };
  if (logs.length > 0) {
    const last = logs[logs.length - 1];
    const lastText = getLogText(last);
    const m = lastText.match(LOG_COUNT_RE);
    const lastBase = m ? lastText.slice(0, m.index) : lastText;
    if (lastBase === msg) {
      const n = m ? parseInt(m[1], 10) + 1 : 2;
      const previousSide = logEntries[logEntries.length - 1]?.side || "neutral";
      const mergedSide = previousSide === side || previousSide === "neutral"
        ? side
        : side === "neutral" ? previousSide : "neutral";
      logs[logs.length - 1] = `${msg} ×${n}`;
      logEntries[logEntries.length - 1] = {
        ...(logEntries[logEntries.length - 1] || logEntry),
        text: `${msg} ×${n}`,
        side: mergedSide
      };
      return;
    }
  }
  logs.push(msg);
  logEntries.push(logEntry);
  if (logs.length > LOG_HISTORY_LIMIT) {
    logs.shift();
    logEntries.shift();
  }
}

// Event Strip observations are a small, persisted lifecycle ledger separate
// from the human-readable log. This lets a signal be replaced or resolved
// without treating old log text as current fact.
export function addEventLog(msg, { key = null, scope = "run", kind = "unresolved", side = "neutral" } = {}) {
  addLog(msg, { side });
  if (!key || !state.currentRun) return;
  state.currentRun.eventObservations ||= {};
  state.currentRun.eventObservations[key] = {
    key,
    scope,
    text: String(msg ?? ""),
    side,
    kind: kind === "result" ? "result" : "unresolved",
    lifecycle: "active"
  };
}

export function resolveEventObservation(key) {
  const observations = state.currentRun?.eventObservations;
  if (!key || !observations?.[key]) return false;
  observations[key].lifecycle = "resolved";
  return true;
}

export function clearEventObservations({ scope = null, scopePrefix = null, keepKeys = [] } = {}) {
  const observations = state.currentRun?.eventObservations;
  if (!observations) return 0;
  const keep = new Set(keepKeys);
  let cleared = 0;
  Object.values(observations).forEach(observation => {
    const scopeMatches = (scope && observation.scope === scope)
      || (scopePrefix && observation.scope?.startsWith(scopePrefix));
    if (scopeMatches && !keep.has(observation.key) && observation.lifecycle === "active") {
      observation.lifecycle = "resolved";
      cleared++;
    }
  });
  return cleared;
}

export function recordCharDeath(stateObj, char, cause, details = null) {
  if (!stateObj.currentRun) return null;
  if (!stateObj.currentRun.deathLogs) {
    stateObj.currentRun.deathLogs = [];
  }
  const alreadyRecorded = stateObj.currentRun.deathLogs.some(log => log.charName === char.name);
  if (alreadyRecorded) return null;

  const turn = stateObj.combatState ? stateObj.combatState.roundNumber ?? null : null;
  const deathLog = {
    charName: char.name,
    cause: cause,
    floor: stateObj.floor,
    turn: turn
  };
  if (details?.type && details?.source) {
    deathLog.type = details.type;
    deathLog.source = normalizeDeathSource(details.source);
  }
  stateObj.currentRun.deathLogs.push(deathLog);
  return deathLog;
}

export function formatCharDeathLog(deathLog) {
  if (!deathLog) return "";
  const turnText = deathLog.turn != null ? ` (ターン ${deathLog.turn})` : "";
  return `☠️ [!] ${deathLog.charName}は B${deathLog.floor}F で${deathLog.cause}により倒れた。${turnText}`;
}

export function queueCharDeathLog(logQueue, deathLog) {
  if (!deathLog) return;
  logQueue.push({ msg: formatCharDeathLog(deathLog) });
}
