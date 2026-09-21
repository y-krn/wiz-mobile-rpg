import assert from "node:assert/strict";

const {
  CONVERGENCE_TARGET_DEPTHS,
  buildConvergenceSummary,
  runConvergenceAuditMeasurement
} = await import("../../../scratch/measurements/run_difficulty_measurement.js");

const options = {
  runs: 1,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  targetDepths: [5],
  routePolicyIds: ["balanced"],
  elitePolicies: ["avoid", "engage"],
  portalPolicyIds: ["canonical"],
  equipmentPolicyIds: ["canonical-adaptive"],
  allowSmallRunCount: true
};

const first = await runConvergenceAuditMeasurement(options);
const second = await runConvergenceAuditMeasurement(options);

assert.deepEqual(first.conditions, second.conditions);
assert.deepEqual(first.comparisons, second.comparisons);
assert.deepEqual(first.configuration.targetDepths, [5]);
assert.equal(first.configuration.population, "natural B1-start");
assert.equal(first.configuration.syntheticDeepPopulation, false);
assert.equal(first.configuration.sameStateCounterfactual.status, "not_run");
assert.equal(first.conditions.length, 2);
assert.equal(first.conditions[0].runs, 1);
assert.equal(first.conditions[0].population, "natural B1-start");
assert.equal(first.conditions[0].elitePolicyValidation.status, "unvalidated");
assert.equal(first.conditions[1].elitePolicyValidation.comparison, "not_run");
assert.equal(first.comparisons.length, 1);
assert.equal(first.comparisons[0].comparison.status, "not_run");
assert.equal(first.comparisons[0].comparison.elitePolicyComparison, "unvalidated");
assert.equal(first.conditions[0].reach[0].depth, 5);
assert.ok(first.conditions[0].reach[0].checkpoint.populationStatus);
assert.equal(first.conditions[0].interpretation.scalarStrategyScore, "forbidden");
assert.deepEqual(CONVERGENCE_TARGET_DEPTHS, [5, 10, 15, 20, 25, 30]);

const summary = buildConvergenceSummary({
  ...first,
  measurement: {
    sourceCommit: "source",
    productionBaselineSha: "base"
  }
});
assert.match(summary, /Natural B1-start only/);
assert.match(summary, /N>=30/);
assert.match(summary, /same-state Portal counterfactual/);
assert.match(summary, /elite engage\/avoid comparison: not_run/);

console.log("run difficulty convergence audit regression passed");
