import assert from "node:assert/strict";

const {
  RUNNER_VERSION,
  STARTING_KIT_IDS,
  runMeasurement
} = await import("../../../scratch/measurements/run_difficulty_measurement.js");

assert.equal(RUNNER_VERSION, "run-difficulty-v1");
assert.ok(STARTING_KIT_IDS.includes("vanguard"));
assert.ok(STARTING_KIT_IDS.includes("arcana"));

const report = await runMeasurement({
  runs: 2,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  targetDepths: [5],
  allowSmallRunCount: true
});

assert.equal(report.determinism.pass, true);
assert.deepEqual(report.configuration.startingKitIds, ["vanguard"]);
assert.deepEqual(report.configuration.scenarioIds, ["workshop-empty"]);
assert.deepEqual(report.configuration.targetDepths, [5]);
assert.equal(report.configuration.simulationTargetDepth, 6);
assert.equal(report.cases.length, 1);
assert.equal(report.cases[0].scenarioId, "workshop-empty");
assert.equal(report.cases[0].kits.length, 1);

const kit = report.cases[0].kits[0];
assert.equal(kit.startingKitId, "vanguard");
assert.equal(kit.runs, 2);
assert.equal(kit.depths.length, 1);
assert.equal(kit.depths[0].depth, 5);
assert.equal(kit.depths[0].reachedRate.trials, 2);
assert.equal(kit.depths[0].breakthroughRate.trials, 2);
assert.equal(kit.outcomeRates.death.trials, 2);
assert.equal(kit.outcomeRates.retreat.trials, 2);
assert.equal(
  Object.values(kit.endingBuildSnapshotDistribution).reduce((sum, count) => sum + count, 0),
  2
);

console.log("run difficulty measurement regression passed");
