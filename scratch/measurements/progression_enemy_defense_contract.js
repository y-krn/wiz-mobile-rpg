// Diagnostic-only Phase 4e contract; preserves the Phase 4c candidate values.

import {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  PROGRESSION_ENEMY_CANDIDATE as PHASE4C_V1,
  resolveProgressionEnemyDiagnosticContext
} from "./progression_enemy_candidate_contract.js";

export const PROGRESSION_ENEMY_DEFENSE_ARMS = Object.freeze([
  Object.freeze({ id: "v1", rawDefenseBonus: () => 0 }),
  Object.freeze({ id: "def-plus-half-capped", rawDefenseBonus: baseline => baseline > 0 ? 0.5 : 0 })
]);

export const PROGRESSION_ENEMY_DEFENSE_CANDIDATE = Object.freeze({
  ...PHASE4C_V1,
  id: "phase-4f-milestone-defensive-baseline-half-capped-v1"
});

export {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  resolveProgressionEnemyDiagnosticContext
};
