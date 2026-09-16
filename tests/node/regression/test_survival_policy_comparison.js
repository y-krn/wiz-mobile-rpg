import assert from "node:assert/strict";

const comparison = await import("../../../scratch/measurements/survival_policy_comparison.js");
const trajectory = await import("../../../scratch/measurements/early_run_attrition_trajectory.js");
const fleeTelemetry = await import("../../../scratch/measurements/flee_telemetry.js");
const { STARTING_KITS } = await import("../../../src/state/initial_state.js");

assert.deepEqual(comparison.STARTING_KIT_IDS, STARTING_KITS.map(kit => kit.id));
assert.deepEqual(comparison.SCENARIO_IDS, ["workshop-empty", "workshop-complete"]);
assert.deepEqual(comparison.POLICY_DIFFERENCE_KEYS, [
  "fleePolicy", "fleeHpThreshold", "healPotionThreshold", "recoveryPolicy"
]);
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p0.fleePolicy, "ev");
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p0.fleeHpThreshold, 0.20);
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p0.healPotionThreshold, 0.55);
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p1.fleePolicy, "threshold");
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p1.fleeHpThreshold, 0.35);
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p1.healPotionThreshold, 0.35);
assert.equal(comparison.SURVIVAL_POLICY_DEFINITIONS.p1.recoveryPolicy, "retention-threshold");
assert.deepEqual(
  fleeTelemetry.summarizeFleeTelemetry({
    identity: { outcome: "death" },
    diagnostic: {
      result: "death",
      rounds: [{
        fleeSelected: true,
        fleeExecuted: true,
        fleePartingAttack: true,
        log: ["追撃！ 7のダメージ"]
      }]
    }
  }),
  {
    observed: true,
    fleeSelected: 1,
    fleeExecuted: 1,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 1,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 1,
    partingAttackDamage: [7],
    partingAttackDamageHp: 7
  }
);
assert.deepEqual(comparison.auditPolicyDifference().differingKeys, [
  "fleePolicy", "fleeHpThreshold", "healPotionThreshold", "recoveryPolicy"
]);
assert.equal(comparison.auditPolicyDifference().pass, true);
assert.deepEqual(
  comparison.validateCanonicalPolicy({
    FLEE_POLICY: "ev",
    FLEE_HP_THRESHOLD: "0.20",
    HEAL_POTION_THRESHOLD: "0.55"
  }),
  { pass: true, checked: ["fleePolicy", "fleeHpThreshold", "healPotionThreshold"] }
);
assert.throws(
  () => comparison.validateCanonicalPolicy({
    FLEE_POLICY: "threshold",
    FLEE_HP_THRESHOLD: "0.20",
    HEAL_POTION_THRESHOLD: "0.55"
  }),
  /P0 must match/
);

const record = (runIndex, worldSeed, outcome, reachedFloor, terminalFloor = reachedFloor) => ({
  runIndex,
  worldSeed,
  outcome,
  reachedFloor,
  terminalFloor
});
const p0 = [
  record(0, "world:0", "died", 2, 2),
  record(1, "world:1", "voluntaryReturn", 3, 3),
  record(2, "world:2", "voluntaryReturn", 2, 2)
];
const p1 = [
  record(2, "world:2", "syntheticCutoff", 6, 6),
  record(0, "world:0", "died", 4, 4),
  record(1, "world:1", "voluntaryReturn", 3, 3)
];
const conversion = comparison.buildMatchedOutcomeConversion(p0, p1);
assert.deepEqual(conversion.transitions, {
  "death->death": 1,
  "Return->Return": 1,
  "Return->B6 cutoff": 1
});
assert.equal(conversion.p0Return.runs, 2);
assert.equal(conversion.p0Return.deeper, 1);
assert.equal(conversion.p0Return.death, 0);
assert.equal(conversion.p0EarlyDeathToP1[2].runs, 1);
assert.equal(conversion.p0EarlyDeathToP1[2].toB4, 1);
assert.equal(conversion.p0EarlyDeathToP1[2].toB6, 0);
assert.throws(
  () => comparison.buildMatchedOutcomeConversion(
    [record(0, "world:0", "died", 2)],
    [record(0, "world:other", "died", 2)]
  ),
  /worldSeed mismatch/
);
assert.throws(
  () => comparison.buildMatchedOutcomeConversion(
    [record(0, "world:0", "died", 2)],
    [record(0, "world:0", "died", 2), record(0, "world:0", "died", 2)]
  ),
  /duplicate candidate/
);
assert.throws(
  () => comparison.buildMatchedOutcomeConversion(
    [record(0, "world:0", "died", 2), record(1, "world:1", "died", 2)],
    [record(0, "world:0", "died", 2)]
  ),
  /missing record/
);

const options = {
  runs: 2,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  allowSmallRunCount: true
};
const first = await comparison.runMeasurement(options);
const second = await comparison.runMeasurement(options);
assert.equal(first.determinism.pass, true);
assert.deepEqual(first, second, "same seed must reproduce the full compact comparison");
assert.equal(first.configuration.policyDifferenceAudit.pass, true);
assert.equal(first.configuration.productionPath, "scratch/simulations/sim_depth_material_ev.js simulateRun");
assert.equal(first.cases.length, 1);
assert.equal(first.cases[0].policies.p0.aggregate.runs, 2);
assert.equal(first.cases[0].policies.p1.aggregate.runs, 2);
assert.equal(first.cases[0].policies.p0.aggregate.waterfall[1].invariant.pass, true);
assert.equal(first.cases[0].policies.p1.aggregate.waterfall[1].invariant.pass, true);
assert.equal(first.cases[0].matchedConversion.runs, 2);
assert.ok(first.cases[0].policies.p0.aggregate.reachedByDepth[6]);
assert.ok(first.cases[0].policies.p0.aggregate.recoveryByFloor[2].exitRecoveryCount);
assert.ok(first.cases[0].policies.p0.aggregate.combat.combatCount);
assert.ok(first.cases[0].policies.p0.aggregate.lootBuild.endingBuildSnapshotDistribution);
assert.ok(Object.hasOwn(first.cases[0].policies.p0.aggregate.flee, "selectedButNotExecuted"));
assert.ok(Object.hasOwn(first.cases[0].policies.p0.aggregate.flee, "partingAttackCount"));
assert.ok(Object.hasOwn(first.cases[0].policies.p0.aggregate.flee, "diedFromPartingAttack"));
assert.notEqual(first.cases[0].policies.p0.aggregate.flee.partingDamageHp, "unobserved");

const canonicalTrajectory = await trajectory.runMeasurement({ ...options });
const survivalP0 = first.cases[0].policies.p0.records[0];
const canonicalP0 = canonicalTrajectory.cases[0].policies.t0.runEvidenceSample.runs[0];
const {
  flee: _flee,
  recoveryByFloor: _recoveryByFloor,
  policyId: _policyId,
  ...survivalP0Base
} = survivalP0;
const { policyId: _canonicalPolicyId, ...canonicalP0Base } = canonicalP0;
assert.deepEqual(survivalP0Base, canonicalP0Base, "P0 must reuse the current canonical trajectory policy");

const report = comparison.buildReport(first, {
  sourceCommit: "a".repeat(40),
  gameplaySourceCommit: "a".repeat(40),
  measurementRunnerCommit: "b".repeat(40),
  measurementRunnerPaths: ["scratch/measurements/survival_policy_comparison.js"],
  baseRef: "origin/main",
  baseCommit: "a".repeat(40),
  originMainAncestor: true,
  staleTreeAllowed: false,
  workingTreeClean: true
}, { runnerVersion: comparison.RUNNER_VERSION }, { purpose: "regression", requestedRef: "test" });
const summary = comparison.buildSummary(report);
assert.match(summary, /B3.*B4.*B5.*B6/);
assert.match(summary, /flee S\/E\/N/);
const deltaRow = summary.split("\n").find(line => line.includes("P1−P0"));
assert.equal(deltaRow.split("|").slice(1, -1).length, 10);
const manifest = comparison.buildManifest(report);
assert.equal(manifest.baselineCandidate, false);
assert.equal(manifest.matching.candidateOrderIndependent, true);
assert.equal(manifest.cutoff.semantics.includes("never voluntary Return"), true);
assert.equal(manifest.source.runnerVersion, comparison.RUNNER_VERSION);

console.log("survival policy comparison regression passed");
