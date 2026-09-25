import assert from "node:assert/strict";

import {
  ARMS,
  CONTEXTS,
  DEFAULT_RUNS,
  DEFAULT_SEED,
  deriveWorldSeed,
  distribution,
  RUNNER_PATH,
  runProgressionExpCombinedRunDiagnostic
} from "../../../scratch/measurements/progression_exp_combined_run_diagnostic.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";

assert.equal(DEFAULT_RUNS, 200);
assert.equal(DEFAULT_SEED, 1727);
assert.deepEqual(CONTEXTS.map(({ id, startFloor, targetDepth }) => [id, startFloor, targetDepth]), [
  ["continuous-B1", 1, 21],
  ["selected-B10", 10, 11],
  ["selected-B20", 20, 21]
]);
assert.deepEqual(Object.keys(ARMS), ["current-control", "combined-b+c"]);
assert.deepEqual(ARMS["current-control"], {
  tabletPolicy: "read-first-reached", tabletOutcomeCandidate: "current", expAwardCandidate: "production"
});
assert.deepEqual(ARMS["combined-b+c"], {
  tabletPolicy: "read-first-reached", tabletOutcomeCandidate: "fixed-c", expAwardCandidate: "phase4j-b"
});
assert.equal(deriveWorldSeed(1727, "continuous-B1", 0), "phase4j-e8:1727:continuous-B1:0");
assert.notEqual(deriveWorldSeed(1727, "continuous-B1", 0), deriveWorldSeed(1727, "continuous-B1", 1));
assert.deepEqual(distribution([1, 2, 3]), { n: 3, mean: 2, p10: 1.2, p50: 2, p90: 2.8 });
assert.ok(MEASUREMENT_IDS.includes("progression-exp-combined-run-diagnostic"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.equal(classifySimulationRunner(RUNNER_PATH)?.lifecycle, "reusable");
assert.equal(classifySimulationRunner(RUNNER_PATH)?.scope, "run");
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-combined-run-diagnostic",
  purpose: "N=1 regression smoke",
  output_dir: "/tmp/progression-exp-combined-run-test"
}).runner, RUNNER_PATH);

const report = await runProgressionExpCombinedRunDiagnostic({ runs: 1, seed: DEFAULT_SEED, allowSmallRunCount: true });
const repeated = await runProgressionExpCombinedRunDiagnostic({ runs: 1, seed: DEFAULT_SEED, allowSmallRunCount: true });
assert.deepEqual(report, repeated);
assert.equal(report.configuration.runsPerContextArm, 1);
assert.equal(report.validity.sampleCountValid, false);
assert.equal(report.validity.invalidRunCount, 0);
assert.deepEqual(Object.keys(report.groups), CONTEXTS.map(context => context.id));
assert.deepEqual(Object.keys(report.groups["continuous-B1"]), Object.keys(ARMS));
for (const context of CONTEXTS) {
  assert.equal(report.matchedSeed[context.id].n, 1);
  const [control, combined] = Object.values(ARMS).map((_, index) =>
    report.observations.filter(row => row.contextId === context.id)[index]);
  assert.equal(control.worldSeed, combined.worldSeed);
  assert.equal(control.rootSeed, DEFAULT_SEED);
  assert.equal(control.runIndex, combined.runIndex);
}

console.log("[PASS] Phase 4j-E8 matched-seed N=1 full-run regression and measurement wiring");
