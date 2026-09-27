import {
  clearSave as clearSaveFacade,
  initNewGame as initNewGameFacade,
  loadGame as loadGameFacade,
  saveAutosave as saveAutosaveFacade,
  saveGame as saveGameFacade
} from "../../../../src/state/save_storage.js";
import {
  clearSave,
  initNewGame,
  loadGame,
  saveAutosave,
  saveGame
} from "../../../../src/state/save_storage";

export function exerciseSaveStorageTypes(): void {
  const ownerFunctions: Array<() => void> = [initNewGame, saveGame, saveAutosave, clearSave, loadGame];
  const facadeFunctions: Array<() => void> = [
    initNewGameFacade,
    saveGameFacade,
    saveAutosaveFacade,
    clearSaveFacade,
    loadGameFacade
  ];
  initNewGame({ preserveSeed: true });
  ownerFunctions.forEach((run) => run());
  facadeFunctions.forEach((run) => run());
}
