export { state, addLog, isSoftlocked, canRecruitRescueNewcomer, recordCharDeath } from "./state/state_core.js";

export {
  generateRandomSeed,
  createDefaultCodex,
  createDefaultCurrentRun,
  createDefaultRoster,
  createDefaultParty
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
  syncPartyToRoster
} from "./state/save_payload.js";

export {
  addInventoryItem
} from "./state/inventory_state.js";

export {
  recordEquipmentDiscovery
} from "./state/codex_state.js";

export {
  rebuildDungeonMaps,
  calculateSeedProperties,
  applyDungeonMemoryToMaps
} from "./state/dungeon_state.js";

// Re-exports from data.js originally in state.js
export { EXP_LEVELS, getCharWeaponAtk, getCharDef, checkCharLevelUp } from "./data.js";
