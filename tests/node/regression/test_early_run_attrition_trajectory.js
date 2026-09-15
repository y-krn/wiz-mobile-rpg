import assert from "node:assert/strict";

const trajectory = await import("../../../scratch/measurements/early_run_attrition_trajectory.js");
const { STARTING_KITS } = await import("../../../src/state/initial_state.js");

assert.deepEqual(trajectory.STARTING_KIT_IDS, STARTING_KITS.map(kit => kit.id));
assert.deepEqual(trajectory.TRAJECTORY_FLOORS, [1, 2, 3, 4, 5]);
assert.equal(trajectory.MEASUREMENT_CUTOFF_FLOOR, 6);
assert.equal(trajectory.TRAJECTORY_POLICIES.t0.portalHpThreshold, 0.35);
assert.equal(trajectory.TRAJECTORY_POLICIES.t1.portalHpThreshold, null);
assert.equal(trajectory.B2_CHEST_TRAP_POLICIES.t0.chestTrapCostSuppressionFloor, undefined);
assert.equal(trajectory.B2_CHEST_TRAP_POLICIES.t1.chestTrapCostSuppressionFloor, 2);
assert.equal(trajectory.MEASUREMENT_TREATMENTS["b2-chest-trap"].policies, trajectory.B2_CHEST_TRAP_POLICIES);

const base = (runIndex, worldSeed, outcome = "voluntaryReturn") => ({
  runIndex,
  worldSeed,
  outcome,
  returnFloor: 3,
  reachedFloor: 3,
  terminalFloor: 3,
  terminalCause: "portal_hp_threshold",
  terminalState: { hp: 7, mp: 2 },
  cumulativeCostBySource: {
    combat: 10,
    guardianBoss: 0,
    floorTrap: 1,
    chestTrap: 0,
    poisonStatus: 0,
    unattributed: 0
  },
  finalFloorIncrementalCost: {},
  lastCostEvents: [],
  floors: {},
  totalSteps: 10,
  totalCombatCount: 2,
  totalCombatRounds: 3,
  build: { shiftCount: 0 }
});

const left = [base(0, "world:0"), base(1, "world:1")];
const right = [
  { ...base(1, "world:1", "died"), outcome: "died", terminalFloor: 4, reachedFloor: 4, terminalCause: "trap_hazard" },
  { ...base(0, "world:0", "syntheticCutoff"), outcome: "syntheticCutoff", reachedFloor: 6, terminalFloor: 6 }
];
const joined = trajectory.buildMatchedTrajectory(left, right);
assert.deepEqual(joined.map(pair => pair.baseline.runIndex), [0, 1]);
assert.deepEqual(
  trajectory.buildMatchedTrajectory(left, [...right].reverse()).map(pair => pair.candidate.runIndex),
  [0, 1]
);
assert.throws(
  () => trajectory.buildMatchedTrajectory(
    [base(0, "world:0")],
    [base(0, "world:other")]
  ),
  /worldSeed mismatch/
);
assert.throws(
  () => trajectory.buildMatchedTrajectory(
    [base(0, "world:0")],
    [base(0, "world:0"), base(0, "world:0")]
  ),
  /duplicate candidate key/
);
assert.throws(
  () => trajectory.buildMatchedTrajectory(
    [base(0, "world:0"), base(1, "world:1")],
    [base(0, "world:0")]
  ),
  /missing record/
);

const floor = (terminal = "reachedNextFloor", cost = 10) => ({
  floor: 1,
  entry: { hpRatio: 1, mpRatio: 1, recoveryRemaining: 4 },
  exit: { hpRatio: 0.5, mpRatio: 1, recoveryRemaining: 3 },
  incrementalCost: {
    combat: cost,
    guardianBoss: 0,
    floorTrap: 0,
    chestTrap: 0,
    poisonStatus: 0,
    unattributed: 0,
    combatCount: 1,
    steps: 2
  },
  cumulativeCostBySource: { combat: cost, guardianBoss: 0, floorTrap: 0, chestTrap: 0, poisonStatus: 0, unattributed: 0 },
  waterfall: {
    reachedNextFloor: terminal === "reachedNextFloor",
    died: terminal === "died",
    voluntaryReturn: terminal === "voluntaryReturn",
    otherTerminal: terminal === "otherTerminal"
  }
});
const completeRecord = {
  ...base(0, "world:0"),
  outcome: "died",
  floors: Object.fromEntries([1, 2, 3, 4, 5].map(number => [number, floor(number === 2 ? "died" : "reachedNextFloor")])),
  cumulativeCostBySource: { combat: 50, guardianBoss: 0, floorTrap: 0, chestTrap: 0, poisonStatus: 0, unattributed: 0 },
  build: { shiftCount: 0 }
};
const aggregate = trajectory.aggregateCondition([completeRecord]);
assert.equal(aggregate.waterfall[1].entered, 1);
assert.equal(aggregate.waterfall[1].reachedNextFloor, 1);
assert.equal(aggregate.waterfall[2].died, 1);
assert.equal(aggregate.waterfall[2].invariant.pass, true);
assert.equal(aggregate.dominantIncrementalCostSource, "combat");

const trajectoryRecord = (runIndex, worldSeed, costsByFloor) => {
  const cumulative = {
    combat: 0,
    guardianBoss: 0,
    floorTrap: 0,
    chestTrap: 0,
    poisonStatus: 0,
    unattributed: 0
  };
  const floors = Object.fromEntries([1, 2, 3, 4, 5].map(number => {
    const incremental = {
      combat: 0,
      guardianBoss: 0,
      floorTrap: 0,
      chestTrap: 0,
      poisonStatus: 0,
      unattributed: 0,
      ...(costsByFloor[number] || {})
    };
    Object.keys(cumulative).forEach(source => {
      cumulative[source] += incremental[source];
    });
    return [number, {
      ...floor("reachedNextFloor", 0),
      incrementalCost: {
        ...floor("reachedNextFloor", 0).incrementalCost,
        ...incremental
      },
      cumulativeCostBySource: { ...cumulative }
    }];
  }));
  return {
    ...base(runIndex, worldSeed, "died"),
    outcome: "died",
    floors,
    cumulativeCostBySource: { ...cumulative }
  };
};
const sourceAggregate = trajectory.aggregateCondition([
  trajectoryRecord(0, "world:0", { 1: { combat: 8 }, 2: { floorTrap: 15 } }),
  trajectoryRecord(1, "world:1", { 1: { combat: 4 }, 2: { floorTrap: 5 } })
]);
assert.equal(sourceAggregate.distributions[1].dominantIncrementalCostSource, "combat");
assert.equal(sourceAggregate.distributions[2].dominantIncrementalCostSource, "floorTrap");
assert.deepEqual(sourceAggregate.distributions[1].incrementalCostTotalBySource, {
  combat: 12,
  guardianBoss: 0,
  floorTrap: 0,
  chestTrap: 0,
  poisonStatus: 0,
  unattributed: 0
});
const summary = trajectory.buildSummary({
  measurement: { sourceCommit: null, measurementRunnerCommit: null, runnerVersion: trajectory.RUNNER_VERSION },
  runnerVersion: trajectory.RUNNER_VERSION,
  configuration: { runs: 2, seed: 1277, matchedIdentity: "identity" },
  determinism: { pass: true },
  cases: [{
    scenarioId: "workshop-empty",
    startingKitId: "vanguard",
    returnContinuation: null,
    policies: {
      t0: { id: "t0", aggregate: sourceAggregate },
      t1: { id: "t1", aggregate: sourceAggregate }
    }
  }]
});
assert.match(summary, /workshop-empty \/ vanguard \/ t0 \| B1 .* \| combat \|/);
assert.match(summary, /workshop-empty \/ vanguard \/ t0 \| B2 .* \| floorTrap \|/);

const t1B5Death = {
  ...base(0, "world:0", "died"),
  outcome: "died",
  reachedFloor: 5,
  terminalFloor: 5,
  terminalCause: "trap_hazard"
};
const detailedContinuation = trajectory.buildReturnContinuation(
  [base(0, "world:0")],
  [t1B5Death]
);
assert.equal(detailedContinuation.reach.b4, 1);
assert.equal(detailedContinuation.reach.b5, 1);
assert.equal(detailedContinuation.reach.b6, 0);
assert.equal(detailedContinuation.terminal.twoPlusFloorDeath, 1);
assert.equal(detailedContinuation.rows[0].reach.b5, true);
assert.equal(detailedContinuation.rows[0].terminalCategory, "+2 floors death");

const cutoff = {
  ...base(0, "world:0", "syntheticCutoff"),
  outcome: "syntheticCutoff",
  reachedFloor: 6,
  terminalFloor: 6
};
const continuation = trajectory.buildReturnContinuation([base(0, "world:0")], [cutoff]);
assert.equal(continuation.b6Cutoff, 1);
assert.equal(continuation.reach.b6, 1);
assert.equal(continuation.terminal.otherTerminal, 1);
assert.equal(continuation.sameFloorDeath, 0, "B6 cutoff is not a Return");

const report = trajectory.buildReport(
  {
    schemaVersion: trajectory.SCHEMA_VERSION,
    runnerVersion: trajectory.RUNNER_VERSION,
    configuration: { runs: 1, seed: 1277, matchedIdentity: "identity" },
    comparisonKey: "comparison",
    determinism: { pass: true },
    cases: []
  },
  {
    sourceCommit: "a".repeat(40),
    gameplaySourceCommit: "a".repeat(40),
    measurementRunnerCommit: "b".repeat(40),
    baseRef: "origin/main",
    baseCommit: "a".repeat(40),
    originMainAncestor: true,
    staleTreeAllowed: false,
    workingTreeClean: true,
    measurementRunnerPaths: []
  },
  { SIM_SEED: "1277" },
  { purpose: "regression", requestedRef: "test" }
);
const manifest = trajectory.buildManifest(report);
assert.equal(manifest.matching.candidateOrderIndependent, true);
assert.equal(manifest.cutoff.semantics.includes("never voluntary Return"), true);
assert.equal(manifest.source.runnerVersion, trajectory.RUNNER_VERSION);

const smoke = await trajectory.runMeasurement({
  runs: 2,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  allowSmallRunCount: true
});
assert.equal(smoke.determinism.pass, true);
assert.equal(smoke.cases.length, 1);
assert.equal(smoke.cases[0].policies.t0.aggregate.runs, 2);
assert.equal(smoke.cases[0].policies.t0.aggregate.waterfall[1].invariant.pass, true);
assert.equal(smoke.cases[0].policies.t1.aggregate.waterfall[1].invariant.pass, true);
assert.equal(smoke.cases[0].returnContinuation.rows.every(row => row.worldSeed), true);

const b2Smoke = await trajectory.runMeasurement({
  runs: 2,
  seed: 1277,
  treatment: "b2-chest-trap",
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  allowSmallRunCount: true
});
const b2Case = b2Smoke.cases[0];
assert.equal(b2Smoke.configuration.treatment, "b2-chest-trap");
assert.equal(b2Smoke.determinism.pass, true);
assert.ok(b2Case.policies.t0.aggregate.b2ChestTrapCostAudit.events > 0);
assert.equal(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.allSuppressed, true);
assert.equal(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.appliedCostZero, true);
assert.ok(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.generatedDamageHp > 0);
assert.equal(b2Case.matchedConversions.all.runs, 2);
assert.ok(b2Case.matchedConversions.t0B2DeathToT1.runs >= 0);
assert.equal(b2Case.matchedChestComparison.matchedRuns, 2);
assert.equal(b2Case.matchedChestComparison.pass, true);
assert.equal(b2Case.matchedChestComparison.exogenous.stateMismatches, 0);
assert.equal(b2Case.matchedChestComparison.exogenous.mismatches, 0);
assert.equal(b2Case.matchedChestComparison.exogenous.missingCandidateEvents, 0);
assert.ok(b2Case.matchedChestComparison.endogenous.postTreatmentIdentityMismatches > 0);
assert.ok(b2Case.matchedChestComparison.endogenous.mismatches >= 0);
assert.deepEqual(
  b2Case.policies.t0.records,
  smoke.cases[0].policies.t0.records,
  "B2 diagnostic T0 preserves canonical runner output"
);
const exogenousMismatchRecords = structuredClone(b2Case.policies.t1.records);
exogenousMismatchRecords[0].chestLootEvents[0].trap = "exogenous-mismatch";
const exogenousComparison = trajectory.buildMatchedChestComparison(
  b2Case.policies.t0.records,
  exogenousMismatchRecords
);
assert.equal(exogenousComparison.pass, false);
assert.ok(exogenousComparison.exogenousMismatch > 0);
const exposureOnlyRecords = structuredClone(b2Case.policies.t1.records);
exposureOnlyRecords.forEach(record => {
  const firstTreatmentOrdinal = record.chestTrapCostAudit
    .filter(event => event.floor === 2)
    .map(event => event.ordinal)
    .sort((left, right) => left - right)[0];
  record.chestLootEvents
    .filter(event => firstTreatmentOrdinal !== undefined && event.ordinal > firstTreatmentOrdinal)
    .forEach(event => {
      event.x += 1000;
    });
});
const exposureOnlyComparison = trajectory.buildMatchedChestComparison(
  b2Case.policies.t0.records,
  exposureOnlyRecords
);
assert.equal(exposureOnlyComparison.pass, true, "post-treatment exposure-only divergence is allowed");
assert.equal(exposureOnlyComparison.endogenous.postTreatmentIdentityMismatches, 0);
assert.equal(b2Case.policies.t1.aggregate.distributions[2].lootOpportunities >= 0, true);

console.log("early run attrition trajectory regression passed");
