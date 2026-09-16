import assert from "node:assert/strict";

import {
  diffBuildObservations,
  isParetoSafeDelta
} from "../../../scratch/measurements/build_progression_audit.js";
import {
  buildManifest,
  buildReport,
  buildSummary,
  compareEquipmentDecisionPrefix,
  summarizeFirstPolicyDivergence,
  runMeasurement
} from "../../../scratch/measurements/early_run_attrition_trajectory.js";
import { shouldApplyParetoSafeOverride } from "../../../scratch/simulations/sim_depth_material_ev.js";

const observation = ({ atk = 10, explorationSupportValues = {} } = {}) => ({
  atk,
  def: 10,
  maxHp: 100,
  maxMp: 20,
  explorationSupportValues,
  mainCoreIds: [],
  auxiliaryCoreIds: [],
  supportValues: {},
  activeRuneSpellIds: [],
  spellIds: []
});

const delta = (before, after) => diffBuildObservations(
  observation(before),
  observation(after)
);

const safeDelta = delta({ atk: 10 }, { atk: 10, explorationSupportValues: { trapBonus: 1 } });
assert.equal(
  shouldApplyParetoSafeOverride({
    policyId: "deterministic_greedy_pareto_safe",
    delta: safeDelta,
    greedyQualifies: false
  }),
  true
);
assert.equal(
  shouldApplyParetoSafeOverride({
    policyId: "deterministic_greedy_pareto_safe",
    delta: safeDelta,
    greedyQualifies: true
  }),
  false,
  "Pareto-safe path only overrides the scalar gate"
);
assert.equal(
  shouldApplyParetoSafeOverride({
    policyId: "deterministic_greedy_pareto_safe",
    delta: safeDelta,
    greedyQualifies: false,
    eligible: false
  }),
  false,
  "non-score eligibility cannot be bypassed"
);
assert.equal(isParetoSafeDelta(safeDelta), true);

const run = (trace, runIndex) => ({
  runIndex,
  worldSeed: `seed:${runIndex}`,
  equipmentDecisionTrace: trace
});
const sameDecision = {
  floor: 1,
  step: 3,
  decisionOrdinal: 0,
  slot: "weapon",
  candidateId: "SHORT_SWORD",
  candidateInstanceId: "same",
  paretoSafeOverride: false
};
const noDivergence = compareEquipmentDecisionPrefix(run([sameDecision], 0), run([sameDecision], 0));
assert.equal(noDivergence.diverged, false);
const b1Divergence = compareEquipmentDecisionPrefix(run([], 1), run([{ ...sameDecision, paretoSafeOverride: true }], 1));
assert.equal(b1Divergence.firstDivergenceFloor, 1);
assert.equal(b1Divergence.paretoSafeOverride, true);
const laterDivergence = compareEquipmentDecisionPrefix(
  run([sameDecision], 2),
  run([sameDecision, { ...sameDecision, floor: 3, step: 2, decisionOrdinal: 1, candidateId: "DAGGER" }], 2)
);
assert.equal(laterDivergence.firstDivergenceFloor, 3);

const divergenceSummary = summarizeFirstPolicyDivergence([
  run([sameDecision], 0),
  run([], 1),
  run([sameDecision], 2)
], [
  run([sameDecision], 0),
  run([{ ...sameDecision, paretoSafeOverride: true }], 1),
  run([sameDecision, { ...sameDecision, floor: 3, step: 2, decisionOrdinal: 1, candidateId: "DAGGER" }], 2)
]);
assert.equal(divergenceSummary.comparedRunCount, 3);
assert.equal(divergenceSummary.affectedRunCount, 2);
assert.equal(divergenceSummary.evidenceSample.totalCount, 2);
assert.deepEqual(divergenceSummary.evidenceSample.runs.map(row => row.runIndex), [1, 2]);
assert.ok(divergenceSummary.evidenceSample.runs.every(row => row.diverged));

const result = await runMeasurement({
  runs: 1,
  seed: 1322,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  treatment: "equipment-pareto-safe",
  allowSmallRunCount: true,
  collectEquipmentCandidateAudit: true
});
assert.equal(result.determinism.pass, true, "both policy determinism probes pass");
assert.ok(Object.values(result.observationInvariance).every(value => value.pass), "audit observation invariance passes");
const testCase = result.cases[0];
const report = buildReport(result, null, null, {
  measurementId: "build-progression-pareto-safe",
  purpose: "small policy contract smoke"
});
report.cases[0].policies.t0.aggregate.outcomeCounts.died = 1;
report.cases[0].policies.t1.aggregate.outcomeCounts.died = 2;
const summary = buildSummary(report);
const manifest = buildManifest(report);
assert.equal(JSON.stringify(report).includes("equipmentDecisionTrace"), false);
assert.match(summary, /same-seed loot, encounter, chest exposure, path, and event correspondence are not claimed/);
assert.match(summary, /terminal death T0\/T1: 1\/2/);
const expectedReach = [2, 3, 4, 5]
  .map(floor => `${testCase.policies.t0.aggregate.waterfall[floor].entered}/${testCase.policies.t1.aggregate.waterfall[floor].entered}`)
  .join(" / ");
assert.match(summary, new RegExp(`B2/B3/B4/B5 reach T0/T1: ${expectedReach.replaceAll("/", "\\/")}`));
assert.equal(manifest.artifactPolicy.runEvidenceSampleLimit, 8);
assert.equal(manifest.artifactPolicy.firstDivergenceEvidenceSampleLimit, 8);
assert.equal(testCase.matchedChestComparison, null, "equipment comparison does not claim chest parity");
assert.equal(testCase.matchedConversions, null, "equipment comparison does not reuse matched outcome conversion");
assert.equal(testCase.returnContinuation, null, "equipment comparison does not reuse Return continuation");
assert.equal(testCase.firstPolicyDivergence.evidenceSample.limit, 8);
for (const policy of Object.values(testCase.policies)) {
  assert.equal(policy.candidateAuditSample.limit, 128);
  assert.equal(policy.runEvidenceSample.limit, 8);
  assert.equal(policy.aggregate.selectedCandidateSwapConsistency.pass, true);
  assert.ok(Object.hasOwn(policy.aggregate.lootBuild, "paretoSafeOverrideCount"));
}

console.log("[PASS] Pareto-safe policy gate, eligibility boundary, divergence semantics, invariance, and bounded samples");
