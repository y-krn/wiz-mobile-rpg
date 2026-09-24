// Diagnostic-only Phase 4g contract; preserves Phase 4c combat coefficients.

import {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  PROGRESSION_ENEMY_CANDIDATE as PHASE4C_V1,
  resolveProgressionEnemyDiagnosticContext
} from "./progression_enemy_candidate_contract.js";

export const PROGRESSION_ENEMY_HP_BUFFER_ARMS = Object.freeze([
  Object.freeze({ id: "v1", hpBuffer: () => 0, rawDefenseBonus: () => 0 }),
  Object.freeze({ id: "hp-plus-one-capped", hpBuffer: baseline => baseline > 0 ? 1 : 0, rawDefenseBonus: () => 0 })
]);

export const PROGRESSION_ENEMY_HP_BUFFER_CANDIDATE = Object.freeze({
  ...PHASE4C_V1,
  id: "phase-4g-milestone-hp-buffer-plus-one-capped-v1"
});

export {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  resolveProgressionEnemyDiagnosticContext
};
