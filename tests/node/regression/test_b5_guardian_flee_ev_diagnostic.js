import assert from "node:assert/strict";

import {
  B5_GUARDIAN_FLEE_EV_MODE,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const result = await runMeasurement({
  runs: 1,
  seed: 1277,
  mode: B5_GUARDIAN_FLEE_EV_MODE
});

assert.deepEqual(result.configuration.arms, ["C"]);
assert.equal(result.configuration.runs, 1);
assert.equal(result.configuration.seed, 1277);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

for (const kitId of result.configuration.startingKits) {
  const row = result.arms.C.byKit[kitId];
  const diagnostic = row.aggregate.b5.guardianFleeEv;
  assert.ok(diagnostic.firstDecisionN >= 0);
  if (diagnostic.firstDecisionN > 0) {
    assert.ok(Object.keys(diagnostic.reasons).length > 0);
    assert.ok(Object.keys(diagnostic.crossTabs.fleeReasonByAttempt).length >= 0);
  }
}

const {
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");
const focusedScenario = {
  ...getScenarioById("workshop-complete"),
  startingKit: "vanguard",
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "ev",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue",
  b5GuardianFleeEvObservation: true,
  simDiagnosticLevel: "full"
};
resetSimulationRandom(123);
const focused = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue1378-focused-b5-guardian-flee-ev",
  scenario: focusedScenario,
  workshop: focusedScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
assert.equal(focused.b5GuardianFleeEvDiagnostic.enabled, true);
assert.ok(focused.b5GuardianFleeEvDiagnostic.observations.length > 0);
assert.deepEqual(focused.b5GuardianFleeEvDiagnostic.observations[0].productionBossRule, {
  breakHpRate: 0.80,
  exposureTurns: 4,
  exposureDamageMultiplier: 1.50
});
assert.ok(focused.b5GuardianFleeEvDiagnostic.observations[0].terms);

console.log("[PASS] B5 Guardian first-decision EV observation, invariance, and N=1");
