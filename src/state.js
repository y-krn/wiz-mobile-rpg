export {
  state,
  addLog,
  recordCharDeath,
  formatCharDeathLog,
  queueCharDeathLog,
  markMapChanged,
  markMapCellVisited
} from "./state/state_core.js";
export { DEATH_TYPES, DEATH_TYPE_LABELS, normalizeDeathSource, summarizeDeathLogs } from "./state/death_logs.js";

export {
  generateRandomSeed,
  createDefaultCodex,
  createDefaultCurrentRun,
  SOLO_CLASSES,
  createSoloCharacter
} from "./state/initial_state.js";

export {
  initNewGame,
  loadGame,
  saveGame,
  saveAutosave,
  clearSave
} from "./state/save_storage.js";

export {
  createSavePayload,
  applySavePayload
} from "./state/save_payload.js";

export {
  createDefaultRecords,
  normalizeRecords,
  finalizeRunRecords,
  HISTORY_LIMIT
} from "./state/records_state.js";

export {
  addInventoryItem
} from "./state/inventory_state.js";

export {
  RETURN_WING_SALVAGE_COUNT,
  recordDungeonObjectLoot,
  consumeRunObjectLoot,
  settleRunObjectLoot
} from "./state/run_loot.js";

export {
  recordEquipmentDiscovery,
  recordEquipmentAffixDiscovery,
  getMonsterCodexKey,
  createMonsterCodexRecord,
  recordMonsterResistanceDiscovery,
  recordMonsterEncounter,
  recordMonsterAction,
  recordMonsterCondition,
  recordMonsterLoot
} from "./state/codex_state.js";

export {
  calculateSeedProperties,
  applyDungeonMemoryToMaps
} from "./state/dungeon_state.js";

// Re-exports from data.js originally in state.js
export { EXP_LEVELS, getCharWeaponAtk, getCharDef, checkCharLevelUp } from "./data.js";
