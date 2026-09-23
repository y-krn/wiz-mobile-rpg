// Diagnostic adapter to the production Leveling contract; called before the measured combat.

import { checkCharLevelUp, EXP_LEVELS } from "../../src/data.js";

export function applyProductionDiagnosticLevelDelta(character) {
  if (!character || character.level !== 1) return false;
  character.exp = EXP_LEVELS[2];
  return checkCharLevelUp(character) && character.level === 2;
}
