// Diagnostic-only action policy comparison; Phase 4c v1 combat values stay fixed.

import {
  deriveProgressionEnemyRunSeed,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS,
  PROGRESSION_ENEMY_CANDIDATE as PHASE4C_V1
} from "./progression_enemy_candidate_contract.js";

export const PROGRESSION_ENEMY_GUARD_POLICY_ARMS = Object.freeze([
  Object.freeze({ id: "attack-defend", measurementCombatPlan: "attack-defend" }),
  Object.freeze({ id: "attack-only", measurementCombatPlan: "attack-only" })
]);

export const PROGRESSION_ENEMY_GUARD_POLICY_CANDIDATE = Object.freeze({
  ...PHASE4C_V1,
  id: "phase-4c-v1-guard-policy-diagnostic"
});

export { deriveProgressionEnemyRunSeed, PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS };
