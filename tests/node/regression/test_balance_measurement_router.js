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
  "b3plus-survival-decomposition",
  "build-progression-audit",
  "build-progression-pareto-safe",
  "b2-chest-trap",
  "survival-policy",
  "preparation-power-factorial",
  "first-band-build-formation",
  "first-band-transition-recovery",
  "first-band-levelup-recovery"
]);
assert.equal(Object.keys(MEASUREMENT_REGISTRY).length, 17);
assert.deepEqual(MEASUREMENT_REGISTRY.standard.allowedRunTypes, [
  "baseline-candidate", "diagnostic", "temporary"
]);
assert.deepEqual(MEASUREMENT_REGISTRY["run-difficulty"].allowedRunTypes, [
  "baseline-candidate", "diagnostic", "temporary"
]);
for (const measurement of [
  "starting-kit-early-run",
  "early-b1f-composition",
  "fixed-combat-composition",
  "equipment-load",
  "run-difficulty-policy-sensitivity",
  "early-run-attrition",
  "b3plus-survival-decomposition",
  "build-progression-audit",
  "build-progression-pareto-safe",
  "b2-chest-trap",
  "survival-policy",
  "preparation-power-factorial",
  "first-band-build-formation",
  "first-band-transition-recovery",
  "first-band-levelup-recovery"
]) {
  assert.deepEqual(MEASUREMENT_REGISTRY[measurement].allowedRunTypes, ["diagnostic"]);
  assert.throws(
    () => resolveMeasurementOptions({ measurement, purpose: "test", run_type: "baseline-candidate" }),
    new RegExp(`run_type for ${measurement} must be diagnostic`)
  );
}
assert.equal(resolveMeasurementOptions({
  measurement: "standard",
  purpose: "test",
  run_type: "temporary"
}).runType, "temporary");

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
const firstBand = resolveMeasurementOptions({ measurement: "first-band-build-formation", purpose: "test" });
assert.deepEqual(
  { runs: firstBand.runs, seed: firstBand.seed, runType: firstBand.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const survivalDecomposition = resolveMeasurementOptions({
  measurement: "b3plus-survival-decomposition",
  purpose: "test"
});
const transitionRecovery = resolveMeasurementOptions({ measurement: "first-band-transition-recovery", purpose: "test" });
assert.deepEqual(
  { runs: transitionRecovery.runs, seed: transitionRecovery.seed, runType: transitionRecovery.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const levelUpRecovery = resolveMeasurementOptions({ measurement: "first-band-levelup-recovery", purpose: "test" });
assert.deepEqual(
  { runs: levelUpRecovery.runs, seed: levelUpRecovery.seed, runType: levelUpRecovery.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
assert.deepEqual(
  {
    runs: survivalDecomposition.runs,
    seed: survivalDecomposition.seed,
    runType: survivalDecomposition.runType,
    treatment: survivalDecomposition.treatment
  },
  {
    runs: 1000,
    seed: 1277,
    runType: "diagnostic",
    treatment: "b3plus-survival-decomposition"
  }
);
assert.throws(
  () => resolveMeasurementOptions({
    measurement: "b3plus-survival-decomposition",
    purpose: "test",
    treatment: "portal-policy"
  }),
  /treatment must be b3plus-survival-decomposition/
);
const buildProgression = resolveMeasurementOptions({ measurement: "build-progression-audit", purpose: "test" });
assert.deepEqual(
  { runs: buildProgression.runs, seed: buildProgression.seed, runType: buildProgression.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const paretoSafe = resolveMeasurementOptions({ measurement: "build-progression-pareto-safe", purpose: "test" });
assert.deepEqual(
  { runs: paretoSafe.runs, seed: paretoSafe.seed, runType: paretoSafe.runType, treatment: paretoSafe.treatment },
  { runs: 1000, seed: 1277, runType: "diagnostic", treatment: "equipment-pareto-safe" }
);
const b2ChestTrap = resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test" });
assert.deepEqual(
  { runs: b2ChestTrap.runs, seed: b2ChestTrap.seed, runType: b2ChestTrap.runType, treatment: b2ChestTrap.treatment },
  { runs: 1000, seed: 1277, runType: "diagnostic", treatment: "b2-chest-trap" }
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", run_type: "temporary" }),
  /run_type for b2-chest-trap must be diagnostic/
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", treatment: "portal-policy" }),
  /treatment must be b2-chest-trap/
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", runs: 999 }),
  /runs must be an integer >= 1000/
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

for (const measurement of ["standard", "early-run-attrition", "b3plus-survival-decomposition", "build-progression-audit", "build-progression-pareto-safe", "b2-chest-trap", "survival-policy", "preparation-power-factorial", "first-band-build-formation", "first-band-transition-recovery", "first-band-levelup-recovery"]) {
  const invocation = resolveRunnerInvocation({ measurement, purpose: "smoke" }, "/tmp/router-test");
  assert.equal(invocation.measurement, measurement);
  assert.match(invocation.runner, /scratch\/measurements\//);
  assert.ok(invocation.args.includes("--output"));
  assert.ok(invocation.args.includes("/tmp/router-test/measurement.json"));
}

const enriched = enrichManifest({
  invocation: resolveRunnerInvocation({ measurement: "survival-policy", purpose: "provenance test" }),
  runId: "456",
  runnerManifest: {
    schemaVersion: 1,
    status: "success",
    source: { runnerVersion: "survival-policy-comparison-v1" },
    provenance: {
      baseRef: "origin/main",
      baseCommit: "d".repeat(40),
      originMainAncestor: true,
      staleTreeAllowed: false,
      workingTreeClean: true,
      measurementRunnerDiffSha256: "e".repeat(64)
    }
  },
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
assert.equal(enriched.routerProvenance.sourceSha, "a".repeat(40));
assert.equal(enriched.routerProvenance.gameplaySourceSha, "b".repeat(40));
assert.equal(enriched.routerProvenance.measurementRunnerSha, "c".repeat(40));
assert.equal(enriched.routerProvenance.originMainAncestry, true);
assert.equal(enriched.routerProvenance.staleTree, false);
assert.equal(enriched.routerProvenance.workingTreeClean, true);
assert.equal(enriched.routerProvenance.environmentSignature, "env-hash");
assert.deepEqual(enriched.provenance, {
  baseRef: "origin/main",
  baseCommit: "d".repeat(40),
  originMainAncestor: true,
  staleTreeAllowed: false,
  workingTreeClean: true,
  measurementRunnerDiffSha256: "e".repeat(64)
});
assert.equal(enriched.routerProvenance.sourceSha, "a".repeat(40));
assert.equal(enriched.routerProvenance.measurementRunnerSha, "c".repeat(40));
assert.equal(enriched.router.version, BALANCE_MEASUREMENT_ENTRY_VERSION);
assert.deepEqual(enriched.artifact.files, ["measurement.json", "measurement.md", "manifest.json"]);

console.log("[PASS] balance measurement registry, routing, defaults, artifacts, and provenance");
