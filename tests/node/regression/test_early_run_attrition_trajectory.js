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
assert.deepEqual(
  trajectory.rankBuildCompositions({ "main:z": 1, "main:a": 3, "main:b": 2 }),
  [["main:a", 3], ["main:b", 2], ["main:z", 1]]
);

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

const outcomeRecord = (runIndex, floorNumber, cohort, cost, hp, deathCause = null) => {
  const sourceCosts = {
    combat: 0,
    guardianBoss: 0,
    floorTrap: 0,
    chestTrap: 0,
    poisonStatus: 0,
    unattributed: 0,
    ...cost
  };
  const waterfall = Object.fromEntries(
    trajectory.OUTCOME_COHORT_IDS.map(id => [id, id === cohort])
  );
  const floorRow = {
    floor: floorNumber,
    entry: {
      hp,
      maxHp: 100,
      hpRatio: hp / 100,
      mp: 8,
      maxMp: 10,
      mpRatio: 0.8,
      recoveryRemaining: 2,
      cureItems: { HEAL_POTION: 2 },
      status: null,
      build: { identity: "test-build", weaponProfile: "light", mainCoreIds: [], auxiliaryCoreIds: [], supportAffixIds: [], level: 1, atk: 10, def: 5, maxHp: 100, maxMp: 10 }
    },
    exit: {
      hp: Math.max(0, hp - Object.values(cost).reduce((total, value) => total + value, 0)),
      maxHp: 100,
      hpRatio: Math.max(0, hp - Object.values(cost).reduce((total, value) => total + value, 0)) / 100,
      mp: 6,
      maxMp: 10,
      mpRatio: 0.6,
      recoveryRemaining: 1,
      status: null
    },
    incrementalCost: {
      ...sourceCosts,
      combatDamageHp: sourceCosts.combat + sourceCosts.guardianBoss,
      guardianBossDamageHp: sourceCosts.guardianBoss,
      chestTrapDamageHp: sourceCosts.chestTrap,
      floorTrapDamageHp: sourceCosts.floorTrap,
      poisonStatusDamageHp: sourceCosts.poisonStatus,
      fleePartingDamageHp: 0,
      mpSpent: 2,
      hpRecovered: 4,
      mpRecovered: 1,
      recoveryItemAcquired: { HEAL_POTION: 1 },
      recoveryItemUsed: { HEAL_POTION: 1 },
      combatCount: 2,
      combatRounds: 3,
      enemyActionCount: 5,
      fleeAttempts: 0,
      fleeExecutions: 0,
      steps: 8
    },
    recovery: { healingHp: 4, healingMp: 1, itemAcquired: { HEAL_POTION: 1 }, itemUsed: { HEAL_POTION: 1 } },
    cumulativeCostBySource: { ...sourceCosts },
    terminal: cohort,
    terminalReason: cohort === "voluntaryReturn" ? "town-portal" : null,
    waterfall
  };
  return {
    ...base(runIndex, `world:${runIndex}`, cohort === "died" ? "died" : "voluntaryReturn"),
    runIndex,
    worldSeed: `world:${runIndex}`,
    outcome: cohort === "died" ? "died" : cohort === "voluntaryReturn" ? "voluntaryReturn" : "syntheticCutoff",
    terminalFloor: floorNumber,
    terminalCause: deathCause,
    finalFloorIncrementalCost: sourceCosts,
    cumulativeCostBySource: sourceCosts,
    floors: { [floorNumber]: floorRow }
  };
};

const cohortRecords = [
  outcomeRecord(0, 3, "reachedNextFloor", { combat: 10 }, 40),
  outcomeRecord(1, 3, "reachedNextFloor", { combat: 20 }, 50),
  outcomeRecord(2, 3, "reachedNextFloor", { combat: 30 }, 60),
  outcomeRecord(3, 3, "died", { combat: 40 }, 15, "raw_damage"),
  outcomeRecord(4, 3, "voluntaryReturn", { chestTrap: 25 }, 25, null),
  outcomeRecord(5, 4, "died", { chestTrap: 90 }, 30, "trap_hazard")
];
const cohortAggregate = trajectory.aggregateCondition(cohortRecords);
const b3Cohorts = cohortAggregate.distributions[3].outcomeCohorts;
assert.deepEqual(
  Object.fromEntries(trajectory.OUTCOME_COHORT_IDS.map(id => [id, b3Cohorts[id].count])),
  { reachedNextFloor: 3, died: 1, voluntaryReturn: 1, otherTerminal: 0 }
);
assert.equal(
  Object.values(b3Cohorts).reduce((total, cohort) => total + cohort.count, 0),
  cohortAggregate.waterfall[3].entered,
  "outcome cohort counts must equal floor entrants"
);
assert.equal(b3Cohorts.reachedNextFloor.entry.hp.p50, 50);
assert.equal(b3Cohorts.reachedNextFloor.entry.hp.p10, 42);
assert.equal(b3Cohorts.reachedNextFloor.status, "insufficient");
assert.equal(b3Cohorts.otherTerminal.status, "observed", "zero cohort with entrants is observed zero");
assert.equal(b3Cohorts.otherTerminal.availability.entryHp, "unobserved");
assert.equal(cohortAggregate.distributions[2].outcomeCohorts.died.status, "unreachable");
assert.equal(cohortAggregate.distributions[3].outcomeCohorts.reachedNextFloor.incrementalCost.combatDamageHp.p50, 20);
assert.equal(cohortAggregate.distributions[3].outcomeCohorts.voluntaryReturn.incrementalCost.chestTrapDamageHp.p50, 25);
assert.equal(cohortAggregate.distributions[4].outcomeCohorts.died.incrementalCost.chestTrapDamageHp.p50, 90);
assert.equal(b3Cohorts.died.terminal.deathCauseCounts.raw_damage, 1);
assert.equal(b3Cohorts.died.terminal.cumulativeCostBySource.combat.p50, 40);
assert.equal(b3Cohorts.died.terminal.finalFloorIncrementalCost.combat.p50, 40);
assert.equal(trajectory.classifyTerminalOutcome({ outcome: "retreat", terminationReason: "target-depth" }), "syntheticCutoff");
assert.equal(trajectory.classifyTerminalOutcome({ outcome: "retreat", terminationReason: "town-portal" }), "voluntaryReturn");
assert.notEqual(
  trajectory.classifyTerminalOutcome({ outcome: "retreat", terminationReason: "target-depth" }),
  "voluntaryReturn",
  "B6 synthetic cutoff must not be a voluntary Return"
);

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
  runs: 4,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  collectEquipmentCandidateAudit: true,
  allowSmallRunCount: true
});
assert.equal(smoke.determinism.pass, true);
assert.equal(Object.values(smoke.observationInvariance).every(value => value.pass), true);
assert.equal(smoke.cases.length, 1);
assert.equal(smoke.cases[0].policies.t0.aggregate.runs, 4);
assert.equal(smoke.cases[0].policies.t0.aggregate.waterfall[1].invariant.pass, true);
assert.equal(smoke.cases[0].policies.t1.aggregate.waterfall[1].invariant.pass, true);
assert.equal(smoke.cases[0].returnContinuation.rows.every(row => row.worldSeed), true);
assert.equal(smoke.cases[0].policies.t0.aggregate.buildProgression.B2Entry.population.condition, "B2 entrants");
assert.equal(smoke.cases[0].policies.t0.aggregate.buildProgression.B2Entry.combatGrowth.atk.delta.n >= 0, true);
assert.equal(smoke.cases[0].policies.t0.aggregate.distributions[1].lootSupply.status, "observed");
assert.equal(smoke.cases[0].policies.t0.aggregate.distributions[1].equipmentDecisionActivity.status, "observed");
const safetyActivity = smoke.cases[0].policies.t0.aggregate.candidateEvaluationActivity;
assert.equal(safetyActivity.byFloor["1"].status, "observed");
assert.ok(Object.hasOwn(safetyActivity.byFloor["1"].categories, "positiveExplorationDelta"));
assert.ok(Object.hasOwn(safetyActivity.byFloor["1"].categories, "trapBonus"));
assert.ok(safetyActivity.byFloor["1"].categories.positiveExplorationDelta.candidateCount >= 0);
assert.equal(
  smoke.cases[0].policies.t0.aggregate.rejectedCandidates.crossTab.status,
  "observed"
);
assert.equal(
  smoke.cases[0].policies.t0.aggregate.rejectedCandidates.crossTab.byFloor["1"]
    .byRejectionReason["out-ranked-by-later-candidate"].strictUpgrade.rejectedCandidateCount >= 0,
  true
);
const safetyRejectionCell = smoke.cases[0].policies.t0.aggregate.rejectedCandidates.crossTab
  .byFloor["1"].byCategory.trapBonus["score-not-higher"];
assert.equal(safetyRejectionCell.sidegradeClassificationCounts.strictUpgrade >= 0, true);
assert.equal(safetyRejectionCell.strictUpgradeCount >= 0, true);
assert.equal(safetyRejectionCell.affectedRunCount >= 0, true);
assert.equal(safetyRejectionCell.affectedRunRate >= 0, true);
assert.equal(smoke.cases[0].policies.t0.aggregate.selectedCandidateSwapConsistency.pass, true);
const auditedRecord = smoke.cases[0].policies.t0.runEvidenceSample.runs[0];
assert.equal(auditedRecord.buildCheckpoints.runStart.build.identity, auditedRecord.build.starting.identity);
assert.equal(auditedRecord.buildCheckpoints.terminal.build.identity, auditedRecord.build.ending.identity);
assert.equal(Object.hasOwn(auditedRecord, "equipmentCandidateAudit"), false);
assert.equal(Object.hasOwn(auditedRecord, "equipmentTelemetry"), false);
assert.equal(
  auditedRecord.equipmentCandidateAuditSummary.selectedCandidateSwapConsistency.pass,
  true
);
assert.equal(
  auditedRecord.equipmentCandidateAuditSummary.selectedCandidateSwapConsistency.selectedCandidateCount,
  auditedRecord.equipmentCandidateAuditSummary.selectedEvents
);
const qualifiedRejectedCandidateCount = smoke.cases[0].policies.t0.runEvidenceSample.runs
  .reduce((total, record) => total + record.equipmentCandidateAuditSummary.qualifiedRejectedCandidateCount, 0);
assert.ok(qualifiedRejectedCandidateCount >= 0);
assert.ok(
  smoke.cases[0].policies.t0.candidateAuditSample.totalCount > 0,
  "candidate audit remains populated when the stronger recovery changes the sampled rejection path"
);
const candidateSample = smoke.cases[0].policies.t0.candidateAuditSample;
assert.equal(candidateSample.policy, trajectory.CANDIDATE_AUDIT_SAMPLE_POLICY);
assert.equal(candidateSample.retainedCount, candidateSample.events.length);
assert.equal(candidateSample.retainedCount + candidateSample.droppedCount, candidateSample.totalCount);
assert.ok(candidateSample.retainedCount <= trajectory.CANDIDATE_AUDIT_SAMPLE_LIMIT);
assert.equal(smoke.cases[0].policies.t0.records, undefined);
assert.equal(smoke.cases[0].policies.t1.records, undefined);
assert.equal(smoke.cases[0].policies.t0.runEvidenceSample.policy, trajectory.RUN_EVIDENCE_SAMPLE_POLICY);
assert.equal(smoke.cases[0].policies.t0.runEvidenceSample.limit, trajectory.RUN_EVIDENCE_SAMPLE_LIMIT);
assert.equal(smoke.cases[0].policies.t0.runEvidenceSample.retainedCount, 4);
assert.equal(smoke.cases[0].policies.t0.runEvidenceSample.droppedCount, 0);
assert.equal(smoke.cases[0].returnContinuation.rowSample.policy, trajectory.RETURN_CONTINUATION_SAMPLE_POLICY);
assert.equal(smoke.cases[0].returnContinuation.rowSample.limit, trajectory.RETURN_CONTINUATION_SAMPLE_LIMIT);
assert.equal(
  smoke.cases[0].returnContinuation.rows.length,
  Math.min(smoke.cases[0].returnContinuation.runs, trajectory.RETURN_CONTINUATION_SAMPLE_LIMIT)
);

const canonicalOnlySmoke = await trajectory.runMeasurement({
  runs: 8,
  seed: 1277,
  treatment: "b3plus-survival-decomposition",
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  allowSmallRunCount: true
});
assert.deepEqual(Object.keys(canonicalOnlySmoke.cases[0].policies), ["canonical"]);
assert.equal(canonicalOnlySmoke.configuration.policyExecution.startsWith("canonical-only"), true);
assert.equal(canonicalOnlySmoke.determinism.pass, true);
assert.equal(Object.values(canonicalOnlySmoke.observationInvariance).every(value => value.pass), true);
assert.equal(canonicalOnlySmoke.cases[0].policies.canonical.aggregate.distributions[3].outcomeCohorts.died.count >= 0, true);
assert.equal(canonicalOnlySmoke.cases[0].policies.canonical.aggregate.distributions[3].entrants, 6);
assert.deepEqual(
  Object.fromEntries(Object.entries(canonicalOnlySmoke.cases[0].policies.canonical.aggregate.distributions[3].outcomeCohorts)
    .map(([id, cohort]) => [id, cohort.count])),
  { reachedNextFloor: 3, died: 2, voluntaryReturn: 1, otherTerminal: 0 }
);
assert.equal(canonicalOnlySmoke.cases[0].policies.t0, undefined);
const canonicalOnlyReport = trajectory.buildReport(
  canonicalOnlySmoke,
  { sourceCommit: "a".repeat(40), measurementRunnerCommit: "b".repeat(40) },
  { SIM_SEED: "1293" },
  { measurementId: "b3plus-survival-decomposition", purpose: "regression" }
);
const canonicalOnlySummary = trajectory.buildSummary(canonicalOnlyReport);
assert.match(canonicalOnlySummary, /canonical-only/);
assert.match(canonicalOnlySummary, /schema: 5/);
assert.match(canonicalOnlySummary, /B3–B5 outcome cohorts/);
assert.match(canonicalOnlySummary, /entry HP · HP ratio · MP · MP ratio · recovery p10\/p50\/p90.*all cohorts/);
assert.match(canonicalOnlySummary, /p25\/p75 in JSON/);
assert.match(canonicalOnlySummary, /incremental Cost p50.*all cohorts/);
assert.match(canonicalOnlySummary, /recovery p50.*all cohorts/);
assert.match(canonicalOnlySummary, /exposure p50.*all cohorts/);
assert.match(canonicalOnlySummary, /availability:.*entry HP\/MP\/recovery/);
assert.match(canonicalOnlySummary, /Next causal probe/);
assert.doesNotMatch(canonicalOnlySummary, /T1 is a matched causal probe/);
assert.equal(canonicalOnlyReport.interpretation.nextAxis, "select at most one floor × one axis from measured evidence");
assert.ok(JSON.stringify(canonicalOnlyReport).length < 50 * 1024 * 1024);
const canonicalOnlyManifest = trajectory.buildManifest(canonicalOnlyReport);
assert.equal(canonicalOnlyManifest.cutoff.semantics.includes("never voluntary Return"), true);
assert.equal(canonicalOnlyManifest.artifactPolicy.fullRunRecords, "omitted");
assert.equal(canonicalOnlyManifest.artifactPolicy.rawCombatLog, "omitted");
assert.equal(canonicalOnlyManifest.artifactPolicy.runEvidenceSampleLimit, trajectory.RUN_EVIDENCE_SAMPLE_LIMIT);

const largeCandidateSample = trajectory.createCandidateAuditSampleCollector(4);
largeCandidateSample.addAll(
  Array.from({ length: 10000 }, (_, index) => ({ id: `candidate:${index}`, payload: "x".repeat(2048) })),
  0
);
const boundedSample = largeCandidateSample.finalize();
assert.equal(boundedSample.retainedCount, 4);
assert.equal(boundedSample.droppedCount, 9996);
assert.ok(
  JSON.stringify({ candidateAuditSample: boundedSample }).length < 20000,
  "candidate report detail must stay bounded when candidate event count grows"
);
const auditedReport = trajectory.buildReport(
  smoke,
  { sourceCommit: "a".repeat(40), measurementRunnerCommit: "b".repeat(40) },
  { SIM_SEED: "1277" },
  { measurementId: "build-progression-audit", purpose: "regression" }
);
assert.equal(
  auditedReport.measurement.candidateAuditSampleLimit,
  trajectory.CANDIDATE_AUDIT_SAMPLE_LIMIT
);
assert.equal(auditedReport.cases[0].policies.t0.records, undefined);
assert.equal(auditedReport.determinism.byPolicy.t0.first, undefined);
assert.equal(auditedReport.determinism.byPolicy.t0.second, undefined);
assert.equal(auditedReport.determinism.byPolicy.t1.first, undefined);
assert.equal(auditedReport.determinism.byPolicy.t1.second, undefined);
assert.equal(JSON.stringify(auditedReport).includes('"records"'), false);
assert.equal(JSON.stringify(auditedReport).includes('"first"'), false);
assert.equal(JSON.stringify(auditedReport).includes('"second"'), false);
Object.values(auditedReport.cases[0].policies).forEach(policy => {
  assert.equal(policy.records, undefined);
});
const auditedManifest = trajectory.buildManifest(auditedReport);
const auditedSummary = trajectory.buildSummary(auditedReport);
assert.match(auditedSummary, /Exploration Support candidate evaluation activity/);
assert.match(auditedSummary, /Exploration Safety candidate rejection reason cross-tab/);
assert.match(auditedSummary, /category \| rejection reason \| rejected candidate count/);
assert.match(auditedSummary, /strictUpgrade rejected reason cross-tab:/);
assert.ok(JSON.stringify(auditedReport).length < 50 * 1024 * 1024);
assert.equal(
  auditedManifest.provenance.candidateAuditSampling[0].retainedCount,
  candidateSample.retainedCount
);
assert.equal(
  auditedManifest.provenance.candidateAuditSampling[0].droppedCount,
  candidateSample.droppedCount
);
assert.equal(
  auditedManifest.provenance.runEvidenceSampling[0].droppedCount,
  smoke.cases[0].policies.t0.runEvidenceSample.droppedCount
);

const largerSmoke = await trajectory.runMeasurement({
  runs: 16,
  seed: 1293,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  collectEquipmentCandidateAudit: true,
  allowSmallRunCount: true
});
const largerReport = trajectory.buildReport(
  largerSmoke,
  { sourceCommit: "a".repeat(40), measurementRunnerCommit: "b".repeat(40) },
  { SIM_SEED: "1293" },
  { measurementId: "build-progression-audit", purpose: "regression" }
);
const largestSmoke = await trajectory.runMeasurement({
  runs: 32,
  seed: 1277,
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  collectEquipmentCandidateAudit: true,
  allowSmallRunCount: true
});
const largestReport = trajectory.buildReport(
  largestSmoke,
  { sourceCommit: "a".repeat(40), measurementRunnerCommit: "b".repeat(40) },
  { SIM_SEED: "1277" },
  { measurementId: "build-progression-audit", purpose: "regression" }
);
const largerReportSize = JSON.stringify(largerReport).length;
const largestReportSize = JSON.stringify(largestReport).length;
assert.ok(
  largestReportSize < largerReportSize * 1.5,
  `bounded report size must not track full run count: N16=${largerReportSize} -> N32=${largestReportSize}`
);
assert.ok(largerReportSize < 5_000_000, `synthetic heavy report unexpectedly large: ${largerReportSize}`);
assert.ok(
  largestReportSize < 3_000_000,
  `synthetic heavy report unexpectedly large after bounded cohort aggregates: ${largestReportSize}`
);
assert.equal(largerReport.cases[0].policies.t0.runEvidenceSample.totalCount, 16);
assert.equal(largerReport.cases[0].policies.t0.runEvidenceSample.retainedCount, trajectory.RUN_EVIDENCE_SAMPLE_LIMIT);
assert.equal(largerReport.cases[0].policies.t0.runEvidenceSample.droppedCount, 8);
assert.equal(largerReport.cases[0].returnContinuation.rows.length <= trajectory.RETURN_CONTINUATION_SAMPLE_LIMIT, true);
assert.ok(
  largerSmoke.cases[0].policies.t0.aggregate.rejectedCandidates.crossTab.byFloor["1"]
    .byRejectionReason["out-ranked-by-later-candidate"].strictUpgrade.rejectedCandidateCount > 0,
  "aggregate must retain strictUpgrade out-ranked-by-later-candidate reasons"
);
assert.ok(
  largerSmoke.cases[0].policies.t0.aggregate.rejectedCandidates.crossTab.byFloor["1"]
    .byRejectionReason["not-best-selection-score"].strictUpgrade.rejectedCandidateCount > 0,
  "aggregate must retain strictUpgrade not-best-selection-score reasons"
);

const b2Smoke = await trajectory.runMeasurement({
  runs: 4,
  seed: 1277,
  treatment: "b2-chest-trap",
  startingKitIds: ["vanguard"],
  scenarioIds: ["workshop-empty"],
  collectEquipmentCandidateAudit: true,
  allowSmallRunCount: true
});
const b2Case = b2Smoke.cases[0];
const b2T0Records = b2Case.policies.t0.runEvidenceSample.runs;
const b2T1Records = b2Case.policies.t1.runEvidenceSample.runs;
assert.equal(b2Smoke.configuration.treatment, "b2-chest-trap");
assert.equal(b2Smoke.determinism.pass, true);
assert.ok(b2Case.policies.t0.aggregate.b2ChestTrapCostAudit.events > 0);
assert.equal(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.allSuppressed, true);
assert.equal(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.appliedCostZero, true);
assert.ok(b2Case.policies.t1.aggregate.b2ChestTrapCostAudit.generatedDamageHp > 0);
assert.equal(b2Case.matchedConversions.all.runs, 4);
assert.ok(b2Case.matchedConversions.t0B2DeathToT1.runs >= 0);
assert.equal(b2Case.matchedChestComparison.matchedRuns, 4);
assert.equal(b2Case.matchedChestComparison.pass, true);
assert.equal(b2Case.matchedChestComparison.exogenous.stateMismatches, 0);
assert.equal(b2Case.matchedChestComparison.exogenous.mismatches, 0);
assert.equal(b2Case.matchedChestComparison.exogenous.missingCandidateEvents, 0);
assert.ok(b2Case.matchedChestComparison.endogenous.postTreatmentIdentityMismatches > 0);
assert.ok(b2Case.matchedChestComparison.endogenous.mismatches >= 0);
assert.deepEqual(
  b2T0Records,
  smoke.cases[0].policies.t0.runEvidenceSample.runs,
  "B2 diagnostic T0 preserves canonical runner output"
);
const exogenousMismatchRecords = structuredClone(b2T1Records);
exogenousMismatchRecords[0].chestLootEvents[0].trap = "exogenous-mismatch";
const exogenousComparison = trajectory.buildMatchedChestComparison(
  b2T0Records,
  exogenousMismatchRecords
);
assert.equal(exogenousComparison.pass, false);
assert.ok(exogenousComparison.exogenousMismatch > 0);
const exposureOnlyRecords = structuredClone(b2T1Records);
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
  b2T0Records,
  exposureOnlyRecords
);
assert.equal(exposureOnlyComparison.pass, true, "post-treatment exposure-only divergence is allowed");
assert.equal(exposureOnlyComparison.endogenous.postTreatmentIdentityMismatches, 0);
assert.equal(b2Case.policies.t1.aggregate.distributions[2].lootOpportunities >= 0, true);

console.log("early run attrition trajectory regression passed");
