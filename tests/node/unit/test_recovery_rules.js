/* global console, process */

import assert from "node:assert/strict";

import {
  getStartingHealPotionCount,
  RECOVERY_BALANCE
} from "../../../src/rules/recovery_rules.js";
import {
  calculateCombatRecoveryAction,
  evaluateCombatRecoveryAction
} from "../../../scratch/simulations/sim_recovery_policy.js";

const failures = [];

assert.equal(RECOVERY_BALANCE.startingHealPotions, 0);
assert.equal(getStartingHealPotionCount(), 0);

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(
  calculateCombatRecoveryAction({
    currentHp: 6,
    maxHp: 20,
    enemyHp: [5],
    enemyAttack: [2],
    playerDamagePerRound: 10
  }) === "fight",
  "weak enemy should remain fightable"
);
check(
  calculateCombatRecoveryAction({
    currentHp: 18,
    maxHp: 20,
    enemyHp: [100],
    enemyAttack: [5],
    playerDamagePerRound: 10
  }) === "flee",
  "strong enemy should trigger enemy-aware flee"
);
check(
  calculateCombatRecoveryAction({
    currentHp: 5,
    maxHp: 20,
    enemyHp: [15],
    enemyAttack: [5],
    playerDamagePerRound: 5,
    potionHeal: 15,
    potionAvailable: true,
    healThreshold: 0.35
  }) === "recover",
  "available recovery should extend a winnable fight"
);
check(
  calculateCombatRecoveryAction({
    currentHp: 8,
    maxHp: 20,
    enemyHp: [20],
    enemyAttack: [2],
    playerDamagePerRound: 5,
    potionHeal: 15,
    potionAvailable: true
  }) === "recover",
  "adopted default heal threshold should use recovery before fleeing"
);

const reasonCases = [
  {
    expectedDecision: "fight",
    expectedReason: "fight-current-survival",
    args: { currentHp: 6, maxHp: 20, enemyHp: [5], enemyAttack: [2], playerDamagePerRound: 10 }
  },
  {
    expectedDecision: "recover",
    expectedReason: "recover-then-survive",
    args: {
      currentHp: 5,
      maxHp: 20,
      enemyHp: [15],
      enemyAttack: [5],
      playerDamagePerRound: 5,
      potionHeal: 15,
      potionAvailable: true,
      healThreshold: 0.35
    }
  },
  {
    expectedDecision: "flee",
    expectedReason: "flee-low-hp-recovery-insufficient",
    args: {
      currentHp: 3,
      maxHp: 20,
      enemyHp: [100],
      enemyAttack: [5],
      playerDamagePerRound: 5,
      potionHeal: 5,
      potionAvailable: true,
      fleeThreshold: 0.20
    }
  },
  {
    expectedDecision: "flee",
    expectedReason: "flee-survival-deficit",
    args: {
      currentHp: 18,
      maxHp: 20,
      enemyHp: [100],
      enemyAttack: [5],
      playerDamagePerRound: 1,
      fleeThreshold: 0.20
    }
  }
];
reasonCases.forEach(({ expectedDecision, expectedReason, args }) => {
  const evaluation = evaluateCombatRecoveryAction(args);
  check(evaluation.decision === expectedDecision, `${expectedReason}: decision`);
  check(evaluation.reason === expectedReason, `${expectedReason}: reason`);
  check([
    "currentHp", "maxHp", "hpRate", "totalEnemyHp", "enemyAttack", "playerDefense",
    "incomingDamagePerRound", "playerDamagePerRound", "expectedTurnsToWin", "survivalTurns",
    "maxRecovery", "recoveryHp", "recoverySurvivalTurns", "healThreshold", "fleeThreshold",
    "hpBelowHealThreshold", "hpBelowFleeThreshold", "turnDeficit"
  ].every(key => Object.hasOwn(evaluation.terms, key)), `${expectedReason}: terms`);
  check(evaluation.terms.turnDeficit ===
    evaluation.terms.expectedTurnsToWin - evaluation.terms.survivalTurns,
  `${expectedReason}: turn deficit`);
  check(calculateCombatRecoveryAction(args) === evaluation.decision, `${expectedReason}: compat`);
});

process.env.SIM_SEED = "489";
process.env.SIM_RUNS = "2";
process.env.SIM_CALIBRATION_RUNS = "2";
process.env.HEAL_POTION_THRESHOLD = "0.70";
process.env.FLEE_POLICY = "threshold";
process.env.FLEE_HP_THRESHOLD = "0.15";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");

const scenario = {
  ...getScenarioById("workshop-complete"),
  healPotionThreshold: 0.70,
  fleeHpThreshold: 0.15,
  fleePolicy: "threshold",
  simDiagnosticLevel: "off"
};
resetSimulationRandom(489);
const scoringProfile = calibrateCoreScoringProfile(
  2,
  scenario,
  "powder",
  scenario.workshop
);
resetSimulationRandom(489);
const result = simulateRun({
  className: "Priest",
  startFloor: 1,
  targetDepth: 5,
  runIndex: 0,
  seriesId: "issue489-recovery-rule-test",
  scoringProfile,
  scenario,
  workshop: scenario.workshop
});

check(result.healPotionThreshold === 0.70, "heal threshold override did not reach simulateRun");
check(result.fleeHpThreshold === 0.15, "flee threshold override did not reach simulateRun");
check(result.fleePolicy === "threshold", "flee policy did not reach simulateRun");
check(
  result.combatRecoveryPotionsUsed + result.outsideRecoveryPotionsUsed === result.recoveryPotionsUsed,
  "combat/outside recovery potion counts do not sum to total"
);

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] recovery rule EV and threshold wiring");
