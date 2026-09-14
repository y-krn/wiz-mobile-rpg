import assert from "node:assert/strict";

import {
  BALANCE_MEASUREMENT_ENTRY_VERSION,
  MEASUREMENT_IDS,
  MEASUREMENT_REGISTRY,
  createMeasurementArtifactName,
  createMeasurementOutputPaths,
  enrichManifest,
  getMeasurementDefinition,
  resolveMeasurementOptions,
  resolveRunnerInvocation
} from "../../../scratch/measurements/run_balance_measurement.js";

assert.deepEqual(MEASUREMENT_IDS, [
  "standard",
  "starting-kit-early-run",
  "early-b1f-composition",
  "fixed-combat-composition",
  "equipment-load",
  "run-difficulty",
  "run-difficulty-policy-sensitivity",
  "early-run-attrition",
  "survival-policy"
]);
assert.equal(Object.keys(MEASUREMENT_REGISTRY).length, 9);

assert.throws(
  () => getMeasurementDefinition("unknown-measurement"),
  /unknown measurement ID/
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "standard", purpose: "test", runs: 499 }),
  /runs must be an integer >= 500/
);

const standard = resolveMeasurementOptions({ measurement: "standard", purpose: "test" });
assert.deepEqual(
  { runs: standard.runs, seed: standard.seed, runType: standard.runType },
  { runs: 500, seed: 843, runType: "baseline-candidate" }
);
const attrition = resolveMeasurementOptions({ measurement: "early-run-attrition", purpose: "test" });
assert.deepEqual(
  { runs: attrition.runs, seed: attrition.seed, runType: attrition.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const earlyB1F = resolveMeasurementOptions({ measurement: "early-b1f-composition", purpose: "test" });
assert.deepEqual(
  {
    runs: earlyB1F.runs,
    selectionRuns: earlyB1F.selectionRuns,
    fixedRuns: earlyB1F.fixedRuns,
    seed: earlyB1F.seed,
    selectionSeed: earlyB1F.selectionSeed,
    fixedSeed: earlyB1F.fixedSeed
  },
  { runs: 1000, selectionRuns: 5000, fixedRuns: 1000, seed: 2192, selectionSeed: 1192, fixedSeed: 1151 }
);

const output = createMeasurementOutputPaths("/tmp/router-test");
assert.equal(output.measurement, "/tmp/router-test/measurement.json");
assert.equal(output.summary, "/tmp/router-test/measurement.md");
assert.equal(output.manifest, "/tmp/router-test/manifest.json");
assert.equal(
  createMeasurementArtifactName("early-run-attrition", "123/attempt"),
  "balance-measurement-early-run-attrition-123-attempt"
);

for (const measurement of ["standard", "early-run-attrition", "survival-policy"]) {
  const invocation = resolveRunnerInvocation({ measurement, purpose: "smoke" }, "/tmp/router-test");
  assert.equal(invocation.measurement, measurement);
  assert.match(invocation.runner, /scratch\/measurements\//);
  assert.ok(invocation.args.includes("--output"));
  assert.ok(invocation.args.includes("/tmp/router-test/measurement.json"));
}

const enriched = enrichManifest({
  invocation: resolveRunnerInvocation({ measurement: "survival-policy", purpose: "provenance test" }),
  runId: "456",
  runnerManifest: { schemaVersion: 1, status: "success", source: { runnerVersion: "survival-policy-comparison-v1" } },
  report: {
    runnerVersion: "survival-policy-comparison-v1",
    measurement: {
      sourceCommit: "a".repeat(40),
      gameplaySourceCommit: "b".repeat(40),
      measurementRunnerCommit: "c".repeat(40),
      originMainAncestor: true,
      staleTreeAllowed: false,
      workingTreeClean: true,
      environmentHash: "env-hash"
    }
  }
});
assert.equal(enriched.measurementId, "survival-policy");
assert.equal(enriched.runType, "diagnostic");
assert.equal(enriched.purpose, "provenance test");
assert.equal(enriched.provenance.sourceSha, "a".repeat(40));
assert.equal(enriched.provenance.gameplaySourceSha, "b".repeat(40));
assert.equal(enriched.provenance.measurementRunnerSha, "c".repeat(40));
assert.equal(enriched.provenance.originMainAncestry, true);
assert.equal(enriched.provenance.staleTree, false);
assert.equal(enriched.provenance.workingTreeClean, true);
assert.equal(enriched.provenance.environmentSignature, "env-hash");
assert.equal(enriched.router.version, BALANCE_MEASUREMENT_ENTRY_VERSION);
assert.deepEqual(enriched.artifact.files, ["measurement.json", "measurement.md", "manifest.json"]);

console.log("[PASS] balance measurement registry, routing, defaults, artifacts, and provenance");
