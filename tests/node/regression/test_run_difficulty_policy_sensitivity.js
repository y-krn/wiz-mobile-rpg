import assert from "node:assert/strict";

const {
  DEFAULT_PORTAL_POLICY_ID,
  PORTAL_POLICY_DEFINITIONS,
  STARTING_KIT_IDS,
  buildMatchedConversion,
  buildManifest,
  buildPolicySensitivityReport,
  buildPolicySensitivitySummary,
  runPolicySensitivityMeasurement,
  runMeasurement
} = await import("../../../scratch/measurements/run_difficulty_measurement.js");
const { STARTING_KITS } = await import("../../../src/state/initial_state.js");

assert.equal(DEFAULT_PORTAL_POLICY_ID, "p0");
assert.deepEqual(Object.keys(PORTAL_POLICY_DEFINITIONS), ["p0", "p1", "p2"]);
assert.equal(PORTAL_POLICY_DEFINITIONS.p0.portalHpThreshold, 0.35);
assert.equal(PORTAL_POLICY_DEFINITIONS.p1.portalHpThreshold, 0.20);
assert.equal(PORTAL_POLICY_DEFINITIONS.p2.portalHpThreshold, null);
assert.deepEqual(STARTING_KIT_IDS, STARTING_KITS.map(kit => kit.id));

const options = {
  runs: 2,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  targetDepths: [5],
  allowSmallRunCount: true
};
const forward = await runPolicySensitivityMeasurement({ ...options, portalPolicyIds: ["p0", "p1", "p2"] });
const reverse = await runPolicySensitivityMeasurement({ ...options, portalPolicyIds: ["p2", "p0", "p1"] });

assert.equal(forward.determinism.pass, true);
assert.deepEqual(forward.configuration.portalPolicies.map(policy => policy.portalHpThreshold), [0.35, 0.2, null]);
assert.equal(new Set(forward.configuration.portalPolicies.map(policy => policy.portalMinFloor)).size, 1);
assert.equal(new Set(forward.configuration.portalPolicies.map(policy => policy.portalMaxHealPotions)).size, 1);
assert.equal(process.env.PORTAL_HP_THRESHOLD, "0.35");

const policyById = report => Object.fromEntries(report.cases[0].policies.map(policy => [policy.policyId, policy]));
const forwardPolicies = policyById(forward);
const reversePolicies = policyById(reverse);
for (const policyId of ["p0", "p1", "p2"]) {
  assert.deepEqual(reversePolicies[policyId], forwardPolicies[policyId]);
}
assert.equal(forward.cases[0].comparisons.p1.conversion.transitions["death->death"], 2);

const conversion = buildMatchedConversion(
  [
    { runIndex: 0, worldSeed: "world:0", outcome: "voluntaryReturn", reachedFloor: 3, steps: 10, combatCount: 2 },
    { runIndex: 1, worldSeed: "world:1", outcome: "voluntaryReturn", reachedFloor: 4, steps: 12, combatCount: 3 },
    { runIndex: 2, worldSeed: "world:2", outcome: "death", reachedFloor: 3, steps: 10, combatCount: 2 }
  ],
  [
    { runIndex: 2, worldSeed: "world:2", outcome: "voluntaryReturn", reachedFloor: 4, steps: 13, combatCount: 3 },
    { runIndex: 0, worldSeed: "world:0", outcome: "voluntaryReturn", reachedFloor: 5, steps: 20, combatCount: 5, hpRate: 0.3, mpRate: 0.1, recoveryRemaining: 0 },
    { runIndex: 1, worldSeed: "world:1", outcome: "death", reachedFloor: 5, deathFloor: 5, deathCause: "normal_enemy", steps: 18, combatCount: 4 }
  ]
);
assert.deepEqual(conversion.transitions, {
  "voluntaryReturn->voluntaryReturn": 1,
  "voluntaryReturn->death": 1,
  "death->voluntaryReturn": 1
});
assert.equal(conversion.p0ReturnCohort.runs, 2);
assert.equal(conversion.p0ReturnCohort.deeperReach, 1);
assert.equal(conversion.p0ReturnCohort.death, 1);
assert.throws(
  () => buildMatchedConversion(
    [{ runIndex: 0, worldSeed: "world:0", outcome: "death", reachedFloor: 2 }],
    [{ runIndex: 0, worldSeed: "world:1", outcome: "death", reachedFloor: 2 }]
  ),
  /worldSeed mismatch/
);
assert.throws(
  () => buildMatchedConversion(
    [{ runIndex: 0, worldSeed: "world:0", outcome: "death", reachedFloor: 2 }],
    [
      { runIndex: 0, worldSeed: "world:0", outcome: "death", reachedFloor: 2 },
      { runIndex: 0, worldSeed: "world:0", outcome: "death", reachedFloor: 2 }
    ]
  ),
  /duplicate candidate key/
);

const diagnosticReport = buildPolicySensitivityReport(forward, {
  gameplaySourceCommit: "a".repeat(40),
  sourceCommit: "b".repeat(40),
  measurementRunnerCommit: "b".repeat(40),
  measurementRunnerPaths: ["scratch/measurements/run_difficulty_measurement.js"]
}, { purpose: "regression", requestedRef: "test" });
const diagnosticSummary = buildPolicySensitivitySummary(diagnosticReport);
const diagnosticManifest = buildManifest(diagnosticReport, { runType: "diagnostic" });
assert.equal(diagnosticReport.measurement.matchedComparisonIdentity, forward.configuration.matchedComparisonIdentity);
assert.match(diagnosticSummary, /P0 = 35% current canonical/);
assert.match(diagnosticSummary, /deeper/);
assert.equal(diagnosticManifest.baselineCandidate, false);
assert.equal(diagnosticManifest.source.runnerVersion, "run-difficulty-policy-sensitivity-v1");

const standard = await runMeasurement({ ...options, portalPolicyId: undefined });
assert.equal(standard.configuration.portalPolicyId, "p0");
assert.equal(standard.configuration.portalHpThreshold, 0.35);
const { policyId, label, portalHpThreshold, description, ...p0Aggregate } = forwardPolicies.p0;
void policyId;
void label;
void portalHpThreshold;
void description;
const { startingKitId: standardKitId, ...standardAggregate } = standard.cases[0].kits[0];
void standardKitId;
assert.deepEqual(p0Aggregate, standardAggregate);

console.log("run difficulty Portal policy sensitivity regression passed");
