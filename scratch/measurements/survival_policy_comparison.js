// sim-scope: run — production-backed matched survival-policy comparison
/* global process */

import { STARTING_KITS } from "../../src/state/initial_state.js";
import {
  STANDARD_BALANCE_CONFIG,
  applyStandardSimulationEnv,
  getStandardSimulationEnv,
  hashConfiguration,
  rateMetric
} from "./balance_measurement.js";
import {
  TRAJECTORY_FLOORS,
  MEASUREMENT_CUTOFF_FLOOR,
  compactRun,
  aggregateCondition,
  buildMatchedTrajectory
} from "./early_run_attrition_trajectory.js";

export const RUNNER_VERSION = "survival-policy-comparison-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
export const SCENARIO_IDS = Object.freeze(["workshop-empty", "workshop-complete"]);
export const POLICY_DIFFERENCE_KEYS = Object.freeze([
  "fleePolicy",
  "fleeHpThreshold",
  "healPotionThreshold",
  "recoveryPolicy"
]);

// P0 is the current standard simulation policy from balance_measurement.js.
// P1 deliberately composes existing production policy inputs; it is not a
// new combat AI and is never used by player-facing code. Its lower recovery
// threshold is a retention/hold diagnostic, not the existing early-use mode.
export const SURVIVAL_POLICY_DEFINITIONS = Object.freeze({
  p0: Object.freeze({
    id: "p0",
    label: "current standard",
    description: "current canonical EV flee and production recovery policy",
    fleePolicy: "ev",
    fleeHpThreshold: 0.20,
    healPotionThreshold: 0.55,
    healPriorityPolicy: "potion-first",
    bloodWandHealPolicy: "reserve-potion",
    recoveryPolicy: "production"
  }),
  p1: Object.freeze({
    id: "p1",
    label: "survival-oriented diagnostic",
    description: "existing threshold flee at 35% plus recovery retained until 35% HP",
    fleePolicy: "threshold",
    fleeHpThreshold: 0.35,
    healPotionThreshold: 0.35,
    healPriorityPolicy: "potion-first",
    bloodWandHealPolicy: "reserve-potion",
    recoveryPolicy: "retention-threshold"
  })
});
export const MEASUREMENT_RUNNER_PATHS = Object.freeze([
  "scratch/measurements/survival_policy_comparison.js",
  "scratch/measurements/measure_survival_policy_comparison.js",
  "scratch/measurements/early_run_attrition_trajectory.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/balance_measurement.js",
  "scratch/measurements/measurement_provenance.js",
  "scratch/measurements/measurement_env_signature.js",
  "scratch/measurements/flee_telemetry.js",
  "src/state/initial_state.js",
  "src/state/run_loot.js",
  "src/rules/build_snapshot.js",
  "src/rules/chest_rules.js",
  "src/rules/trap_rules.js",
  "src/rules/trap_effect_rules.js",
  "src/run_map_generator.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/status_effects.js"
]);

const RECOVERY_ITEM_IDS = Object.freeze([
  "HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "HOLY_WATER", "ETHER"
]);

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { n: 0, p25: null, p50: null, p75: null, p95: null };
  }
  const at = probability => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    n: sorted.length,
    p25: at(0.25),
    p50: at(0.50),
    p75: at(0.75),
    p95: at(0.95)
  };
}

function countItems(rows, field) {
  return RECOVERY_ITEM_IDS.reduce((counts, itemId) => {
    counts[itemId] = sum(rows.map(row => Number(row[field]?.[itemId]) || 0));
    return counts;
  }, {});
}

function floorRows(records, floor) {
  return records.map(record => record.floors[floor]).filter(Boolean);
}

function aggregateRecovery(records) {
  return Object.fromEntries(TRAJECTORY_FLOORS.map(floor => {
    const rows = floorRows(records, floor);
    return [floor, {
      entrants: rows.length,
      entryRecoveryCount: quantiles(rows.map(row => row.entry.recoveryRemaining)),
      exitRecoveryCount: quantiles(rows.map(row => row.exit.recoveryRemaining)),
      acquired: countItems(rows.map(row => row.recovery), "itemAcquired"),
      used: countItems(rows.map(row => row.recovery), "itemUsed"),
      hpRecovered: quantiles(rows.map(row => row.recovery.healingHp)),
      mpRecovered: quantiles(rows.map(row => row.recovery.healingMp))
    }];
  }));
}

function aggregateFlee(records) {
  const byFloor = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => {
    const rows = floorRows(records, floor);
    const attempts = sum(rows.map(row => Number(row.incrementalCost.fleeAttempts) || 0));
    const executions = sum(rows.map(row => Number(row.incrementalCost.fleeExecutions) || 0));
    const selectedButNotExecuted = sum(rows.map(row =>
      Number(row.incrementalCost.fleeSelectedButNotExecuted) || 0
    ));
    const partingAttackCount = sum(rows.map(row =>
      Number(row.incrementalCost.fleePartingAttackCount) || 0
    ));
    const survived = sum(rows.map(row => Number(row.incrementalCost.fleeSurvived) || 0));
    const diedFromPartingAttack = sum(rows.map(row =>
      Number(row.incrementalCost.fleeDiedFromPartingAttack) || 0
    ));
    const partingDamageHp = rows.some(row => row.incrementalCost.fleePartingDamageHp !== null)
      ? sum(rows.map(row => Number(row.incrementalCost.fleePartingDamageHp) || 0))
      : null;
    return [floor, {
      attempts,
      selected: attempts,
      executions,
      selectedButNotExecuted,
      failures: selectedButNotExecuted,
      partingAttackCount,
      survived,
      diedFromPartingAttack,
      partingDamageHp
    }];
  }));
  const totals = Object.values(byFloor).reduce((total, row) => ({
    attempts: total.attempts + row.attempts,
    selected: total.selected + row.selected,
    executions: total.executions + row.executions,
    selectedButNotExecuted: total.selectedButNotExecuted + row.selectedButNotExecuted,
    failures: total.failures + row.failures,
    partingAttackCount: total.partingAttackCount + row.partingAttackCount,
    survived: total.survived + row.survived,
    diedFromPartingAttack: total.diedFromPartingAttack + row.diedFromPartingAttack,
    partingDamageHp: total.partingDamageHp === null || row.partingDamageHp === null
      ? null
      : total.partingDamageHp + row.partingDamageHp
  }), {
    attempts: 0,
    selected: 0,
    executions: 0,
    selectedButNotExecuted: 0,
    failures: 0,
    partingAttackCount: 0,
    survived: 0,
    diedFromPartingAttack: 0,
    partingDamageHp: 0
  });
  return { ...totals, byFloor };
}

function aggregateCombat(records) {
  const byFloor = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => {
    const rows = floorRows(records, floor);
    return [floor, {
      combatCount: sum(rows.map(row => Number(row.incrementalCost.combatCount) || 0)),
      combatDamageHp: sum(rows.map(row => Number(row.incrementalCost.combatDamageHp) || 0)),
      enemyActions: sum(rows.map(row => Number(row.incrementalCost.enemyActionCount) || 0)),
      rounds: sum(rows.map(row => Number(row.incrementalCost.combatRounds) || 0))
    }];
  }));
  const runTotals = records.map(record => TRAJECTORY_FLOORS.reduce((total, floor) => {
    const cost = record.floors[floor]?.incrementalCost || {};
    return {
      combatCount: total.combatCount + (Number(cost.combatCount) || 0),
      combatDamageHp: total.combatDamageHp + (Number(cost.combatDamageHp) || 0),
      enemyActions: total.enemyActions + (Number(cost.enemyActionCount) || 0),
      rounds: total.rounds + (Number(cost.combatRounds) || 0)
    };
  }, { combatCount: 0, combatDamageHp: 0, enemyActions: 0, rounds: 0 }));
  return {
    byFloor,
    combatCount: quantiles(runTotals.map(row => row.combatCount)),
    combatDamageHp: quantiles(runTotals.map(row => row.combatDamageHp)),
    enemyActions: quantiles(runTotals.map(row => row.enemyActions)),
    rounds: quantiles(runTotals.map(row => row.rounds))
  };
}

function aggregateLootBuild(records) {
  const meaningful = records.filter(record =>
    TRAJECTORY_FLOORS.some(floor => record.floors[floor]?.build.meaningfulLootOpportunity)
  ).length;
  const equipment = records.filter(record =>
    TRAJECTORY_FLOORS.some(floor => record.floors[floor]?.build.equipmentOpportunity)
  ).length;
  const buildChange = records.filter(record => record.build.shiftCount > 0).length;
  const endingBuildSnapshotDistribution = {};
  records.forEach(record => {
    const identity = record.build.ending?.identity || "unobserved";
    endingBuildSnapshotDistribution[identity] =
      (endingBuildSnapshotDistribution[identity] || 0) + 1;
  });
  return {
    meaningfulLootOpportunity: rateMetric(meaningful, records.length),
    equipmentOpportunity: rateMetric(equipment, records.length),
    buildChange: rateMetric(buildChange, records.length),
    buildShiftCount: quantiles(records.map(record => record.build.shiftCount)),
    endingBuildSnapshotDistribution,
    combatRewardOpportunitiesLost: "unobserved"
  };
}

export function aggregateSurvivalCondition(records) {
  const trajectory = aggregateCondition(records);
  const reachedByDepth = Object.fromEntries([2, 3, 4, 5, 6].map(floor => [
    floor,
    rateMetric(records.filter(record => Number(record.reachedFloor) >= floor).length, records.length)
  ]));
  const totalCombatDamage = sum(records.map(record => record.cumulativeCombatDamageHp));
  return {
    ...trajectory,
    reachedByDepth,
    death: rateMetric(records.filter(record => record.outcome === "died").length, records.length),
    voluntaryReturn: rateMetric(records.filter(record => record.outcome === "voluntaryReturn").length, records.length),
    b6Cutoff: rateMetric(records.filter(record => record.outcome === "syntheticCutoff").length, records.length),
    flee: aggregateFlee(records),
    recoveryByFloor: aggregateRecovery(records),
    combat: { ...aggregateCombat(records), totalDamageHp: totalCombatDamage },
    lootBuild: aggregateLootBuild(records)
  };
}

function outcomeLabel(record) {
  if (record.outcome === "died") return "death";
  if (record.outcome === "voluntaryReturn") return "Return";
  if (record.outcome === "syntheticCutoff") return "B6 cutoff";
  return "other";
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function conversionRate(count, total) {
  return rateMetric(count, total);
}

export function buildMatchedOutcomeConversion(baselineRecords, candidateRecords) {
  const joined = buildMatchedTrajectory(baselineRecords, candidateRecords);
  const transitions = {};
  const p0Return = { runs: 0, deeper: 0, death: 0, sameOrShallower: 0 };
  const p0Death = { runs: 0, deeper: 0, returned: 0, death: 0, sameOrShallower: 0 };
  const earlyDeathByFloor = Object.fromEntries([2, 3].map(floor => [floor, {
    runs: 0,
    toB4: 0,
    toB5: 0,
    toB6: 0,
    toDeath: 0,
    toReturn: 0
  }]));
  const rows = joined.map(({ baseline, candidate }) => {
    const baselineOutcome = outcomeLabel(baseline);
    const candidateOutcome = outcomeLabel(candidate);
    increment(transitions, `${baselineOutcome}->${candidateOutcome}`);
    const deeper = Number(candidate.reachedFloor) > Number(baseline.reachedFloor);
    if (baselineOutcome === "Return") {
      p0Return.runs++;
      if (candidateOutcome === "death") p0Return.death++;
      else if (deeper) p0Return.deeper++;
      else p0Return.sameOrShallower++;
    }
    if (baselineOutcome === "death") {
      p0Death.runs++;
      if (candidateOutcome === "death") p0Death.death++;
      else if (candidateOutcome === "Return") p0Death.returned++;
      else if (deeper) p0Death.deeper++;
      else p0Death.sameOrShallower++;
      const floor = Number(baseline.terminalFloor);
      const cohort = earlyDeathByFloor[floor];
      if (cohort) {
        cohort.runs++;
        cohort.toB4 += Number(Number(candidate.reachedFloor) >= 4);
        cohort.toB5 += Number(Number(candidate.reachedFloor) >= 5);
        cohort.toB6 += Number(Number(candidate.reachedFloor) >= 6);
        cohort.toDeath += Number(candidateOutcome === "death");
        cohort.toReturn += Number(candidateOutcome === "Return");
      }
    }
    return {
      runIndex: baseline.runIndex,
      worldSeed: baseline.worldSeed,
      p0Outcome: baselineOutcome,
      p1Outcome: candidateOutcome,
      p0ReachedFloor: baseline.reachedFloor,
      p1ReachedFloor: candidate.reachedFloor,
      deeper,
      p0TerminalFloor: baseline.terminalFloor,
      p1TerminalFloor: candidate.terminalFloor
    };
  });
  const finalizeCohort = cohort => ({
    ...cohort,
    deeperRate: conversionRate(cohort.deeper, cohort.runs),
    deathRate: conversionRate(cohort.death, cohort.runs),
    returnRate: conversionRate(cohort.returned || 0, cohort.runs)
  });
  return {
    runs: joined.length,
    transitions,
    p0Return: finalizeCohort(p0Return),
    p0Death: finalizeCohort(p0Death),
    p0EarlyDeathToP1: Object.fromEntries(Object.entries(earlyDeathByFloor).map(([floor, cohort]) => [
      floor,
      {
        ...cohort,
        toB4Rate: conversionRate(cohort.toB4, cohort.runs),
        toB5Rate: conversionRate(cohort.toB5, cohort.runs),
        toB6Rate: conversionRate(cohort.toB6, cohort.runs),
        toDeathRate: conversionRate(cohort.toDeath, cohort.runs),
        toReturnRate: conversionRate(cohort.toReturn, cohort.runs)
      }
    ])),
    rows
  };
}

export function auditPolicyDifference() {
  const p0 = SURVIVAL_POLICY_DEFINITIONS.p0;
  const p1 = SURVIVAL_POLICY_DEFINITIONS.p1;
  const allKeys = [...new Set([...Object.keys(p0), ...Object.keys(p1)])]
    .filter(key => !["id", "label", "description"].includes(key));
  const differingKeys = allKeys.filter(key => p0[key] !== p1[key]);
  const unexpectedKeys = differingKeys.filter(key => !POLICY_DIFFERENCE_KEYS.includes(key));
  return {
    pass: unexpectedKeys.length === 0 && differingKeys.length > 0,
    differingKeys,
    unexpectedKeys,
    allowedKeys: [...POLICY_DIFFERENCE_KEYS]
  };
}

export function validateCanonicalPolicy(environment) {
  const expected = {
    fleePolicy: environment.FLEE_POLICY,
    fleeHpThreshold: Number(environment.FLEE_HP_THRESHOLD),
    healPotionThreshold: Number(environment.HEAL_POTION_THRESHOLD)
  };
  const actual = SURVIVAL_POLICY_DEFINITIONS.p0;
  const mismatches = Object.keys(expected).filter(key => actual[key] !== expected[key]);
  if (mismatches.length > 0) {
    throw new Error(`P0 must match standard simulation environment: ${mismatches.join(", ")}`);
  }
  return { pass: true, checked: Object.keys(expected) };
}

function worldSeedFor(seed, runIndex) {
  return `run-difficulty:${seed}:${runIndex}`;
}

function normalizeOptions({ runs, seed, startingKitIds, scenarioIds, allowSmallRunCount = false } = {}) {
  const minimum = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = Number(runs ?? DEFAULT_RUNS);
  const normalizedSeed = Number(seed ?? DEFAULT_SEED);
  if (!Number.isInteger(normalizedRuns) || normalizedRuns < minimum) {
    throw new Error(`runs must be an integer >= ${minimum}: ${runs}`);
  }
  if (!Number.isInteger(normalizedSeed) || normalizedSeed < 1) {
    throw new Error(`seed must be a positive integer: ${seed}`);
  }
  const kits = [...(startingKitIds || STARTING_KIT_IDS)];
  const scenarios = [...(scenarioIds || SCENARIO_IDS)];
  if (!kits.length || kits.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`startingKitIds must be drawn from ${STARTING_KIT_IDS.join("|")}`);
  }
  if (!scenarios.length || scenarios.some(id => !SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be drawn from ${SCENARIO_IDS.join("|")}`);
  }
  return { runs: normalizedRuns, seed: normalizedSeed, startingKitIds: kits, scenarioIds: scenarios };
}

function compactProbe(record) {
  return {
    runIndex: record.runIndex,
    worldSeed: record.worldSeed,
    outcome: record.outcome,
    reachedFloor: record.reachedFloor,
    flee: record.flee,
    recoveryByFloor: record.recoveryByFloor
  };
}

export async function runMeasurement(options = {}) {
  const config = normalizeOptions(options);
  applyStandardSimulationEnv({
    ...STANDARD_BALANCE_CONFIG,
    seed: config.seed,
    runs: config.runs
  });
  validateCanonicalPolicy(getStandardSimulationEnv({
    ...STANDARD_BALANCE_CONFIG,
    seed: config.seed,
    runs: config.runs
  }));
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("../simulations/sim_depth_material_ev.js");
  const policies = Object.values(SURVIVAL_POLICY_DEFINITIONS);
  const runOne = ({ scenarioId, startingKitId, policy, runIndex }) => {
    const baseScenario = getScenarioById(scenarioId);
    const worldSeed = worldSeedFor(config.seed, runIndex);
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: MEASUREMENT_CUTOFF_FLOOR,
      runIndex,
      seriesId: `survival-policy:${scenarioId}:${startingKitId}`,
      scoringProfile: null,
      scenario: {
        ...baseScenario,
        startingKit: startingKitId,
        fleePolicy: policy.fleePolicy,
        fleeHpThreshold: policy.fleeHpThreshold,
        healPotionThreshold: policy.healPotionThreshold,
        healPriorityPolicy: policy.healPriorityPolicy,
        bloodWandHealPolicy: policy.bloodWandHealPolicy,
        collectEncounterIdentities: true,
        collectStage15Diagnostics: true,
        simDiagnosticLevel: "full"
      },
      workshop: baseScenario.workshop,
      worldSeed,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true
    });
    const record = compactRun(result, {
      scenarioId,
      startingKitId,
      policyId: policy.id,
      runIndex,
      worldSeed
    });
    return {
      ...record,
      flee: {
        attempts: sum(TRAJECTORY_FLOORS.map(floor => record.floors[floor]?.incrementalCost.fleeAttempts || 0)),
        executions: sum(TRAJECTORY_FLOORS.map(floor => record.floors[floor]?.incrementalCost.fleeExecutions || 0))
      },
      recoveryByFloor: Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [
        floor,
        record.floors[floor]?.recovery || null
      ]))
    };
  };

  const probe = { scenarioId: config.scenarioIds[0], startingKitId: config.startingKitIds[0], runIndex: 0 };
  const determinismByPolicy = {};
  for (const policy of policies) {
    resetSimulationRandom(config.seed);
    const first = compactProbe(runOne({ ...probe, policy }));
    resetSimulationRandom(config.seed);
    const second = compactProbe(runOne({ ...probe, policy }));
    determinismByPolicy[policy.id] = {
      pass: JSON.stringify(first) === JSON.stringify(second),
      first: { runIndex: first.runIndex, worldSeed: first.worldSeed, outcome: first.outcome, reachedFloor: first.reachedFloor },
      second: { runIndex: second.runIndex, worldSeed: second.worldSeed, outcome: second.outcome, reachedFloor: second.reachedFloor }
    };
    if (!determinismByPolicy[policy.id].pass) {
      throw new Error(`survival policy determinism probe failed: ${policy.id}`);
    }
  }

  const cases = [];
  for (const scenarioId of config.scenarioIds) {
    for (const startingKitId of config.startingKitIds) {
      const records = {};
      for (const policy of policies) {
        resetSimulationRandom(config.seed);
        records[policy.id] = [];
        for (let runIndex = 0; runIndex < config.runs; runIndex++) {
          records[policy.id].push(runOne({ scenarioId, startingKitId, policy, runIndex }));
        }
      }
      const p0 = records.p0;
      const p1 = records.p1;
      cases.push({
        scenarioId,
        startingKitId,
        policies: {
          p0: { ...SURVIVAL_POLICY_DEFINITIONS.p0, aggregate: aggregateSurvivalCondition(p0), records: p0 },
          p1: { ...SURVIVAL_POLICY_DEFINITIONS.p1, aggregate: aggregateSurvivalCondition(p1), records: p1 }
        },
        matchedConversion: buildMatchedOutcomeConversion(p0, p1)
      });
    }
  }

  const sharedMatching = {
    source: "production-simulateRun",
    seed: config.seed,
    runs: config.runs,
    startingKitIds: config.startingKitIds,
    scenarioIds: config.scenarioIds,
    observedFloors: TRAJECTORY_FLOORS,
    measurementCutoff: MEASUREMENT_CUTOFF_FLOOR,
    worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
    matchedKey: "runIndex + worldSeed"
  };
  const configuration = {
    runs: config.runs,
    seed: config.seed,
    startFloor: 1,
    observedFloors: [...TRAJECTORY_FLOORS],
    measurementCutoff: "B6",
    startingKitIds: config.startingKitIds,
    scenarioIds: config.scenarioIds,
    policies,
    policyDifferenceAudit: auditPolicyDifference(),
    sharedSimulationEnv: getStandardSimulationEnv({
      ...STANDARD_BALANCE_CONFIG,
      seed: config.seed,
      runs: config.runs
    }),
    matchedIdentity: hashConfiguration(sharedMatching),
    seedPolicy: "same production worldSeed per runIndex across P0/P1; simulator RNG reset per condition",
    sourceOfTruth: "src/state/initial_state.js STARTING_KITS",
    productionPath: "scratch/simulations/sim_depth_material_ev.js simulateRun",
    recoveryAcquisitionBoundary: "production diagnostics.rewardEvents; merchant acquisition unobserved",
    fleeFailureDefinition: "selected-but-not-executed; execution, parting attack, parting death, and observed parting HP damage are separate",
    classNameBridge: "Fighter is a scratch-only simulator entry shim; scenario.startingKit creates production kit state"
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    configuration,
    comparisonKey: hashConfiguration({ ...sharedMatching, policies }),
    determinism: {
      pass: Object.values(determinismByPolicy).every(value => value.pass),
      byPolicy: determinismByPolicy
    },
    cases
  };
}

function pct(metric) {
  return metric?.estimate === null || metric?.estimate === undefined
    ? "—"
    : `${(metric.estimate * 100).toFixed(1)}%`;
}

function median(metric) {
  return metric?.p50 === null || metric?.p50 === undefined ? "—" : Number(metric.p50).toFixed(1);
}

function deltaPp(candidate, baseline) {
  if (candidate?.estimate === null || candidate?.estimate === undefined ||
      baseline?.estimate === null || baseline?.estimate === undefined) return "—";
  const delta = (candidate.estimate - baseline.estimate) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`;
}

function deltaMedian(candidate, baseline) {
  if (candidate?.p50 === null || candidate?.p50 === undefined ||
      baseline?.p50 === null || baseline?.p50 === undefined) return "—";
  const delta = Number(candidate.p50) - Number(baseline.p50);
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
}

function policyRow(testCase, policyId) {
  const policy = testCase.policies[policyId];
  const aggregate = policy.aggregate;
  const reached = [3, 4, 5, 6].map(floor => pct(aggregate.reachedByDepth[floor])).join("/");
  return [
    `${testCase.scenarioId}/${testCase.startingKitId}/${policyId}`,
    reached,
    pct(aggregate.death),
    pct(aggregate.voluntaryReturn),
    `${aggregate.flee.attempts}/${aggregate.flee.executions}/${aggregate.flee.failures}`,
    median(aggregate.recoveryByFloor[2].exitRecoveryCount),
    median(aggregate.recoveryByFloor[3].entryRecoveryCount),
    median(aggregate.combat.combatCount),
    pct(aggregate.lootBuild.meaningfulLootOpportunity),
    pct(aggregate.lootBuild.buildChange)
  ];
}

export function buildSummary(report) {
  const lines = [
    "# Survival policy comparison",
    "",
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\`; runner: \`${report.measurement.measurementRunnerCommit || "not recorded"}\`; schema: ${report.measurement.schemaVersion}`,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; B1–B5 observed; B6 is a synthetic cutoff, never Return`,
    "- P0 = current standard: EV flee, 20% flee threshold, production recovery at 55% HP",
    "- P1 = diagnostic: existing threshold flee at 35%; recovery potion threshold held to 35% HP",
    `- policy difference audit: ${report.configuration.policyDifferenceAudit.pass ? "PASS" : "FAIL"}; keys = \`${report.configuration.policyDifferenceAudit.differingKeys.join(", ")}\``,
    `- matched key: \`(runIndex, worldSeed)\`; identity: \`${report.configuration.matchedIdentity}\`; determinism: ${report.determinism.pass ? "PASS" : "FAIL"}`,
    "",
    "Reach columns are B3 / B4 / B5 / B6. Flee columns are selected / executed / selected-but-not-executed; parting attacks, deaths, and HP damage are in the full artifact.",
    "",
    "| kit × Workshop × policy | reach | death | Return | flee S/E/N | B2 exit rec p50 | B3 entry rec p50 | combat p50 | loot opp | Build change |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  report.cases.forEach(testCase => {
    lines.push(`| ${policyRow(testCase, "p0").join(" | ")} |`);
    lines.push(`| ${policyRow(testCase, "p1").join(" | ")} |`);
    const conversion = testCase.matchedConversion;
    lines.push(
      `| ${testCase.scenarioId}/${testCase.startingKitId}/P1−P0 | ${deltaPp(testCase.policies.p1.aggregate.reachedByDepth[3], testCase.policies.p0.aggregate.reachedByDepth[3])}/${deltaPp(testCase.policies.p1.aggregate.reachedByDepth[4], testCase.policies.p0.aggregate.reachedByDepth[4])}/${deltaPp(testCase.policies.p1.aggregate.reachedByDepth[5], testCase.policies.p0.aggregate.reachedByDepth[5])}/${deltaPp(testCase.policies.p1.aggregate.reachedByDepth[6], testCase.policies.p0.aggregate.reachedByDepth[6])} | ${deltaPp(testCase.policies.p1.aggregate.death, testCase.policies.p0.aggregate.death)} | ${deltaPp(testCase.policies.p1.aggregate.voluntaryReturn, testCase.policies.p0.aggregate.voluntaryReturn)} | ${testCase.policies.p1.aggregate.flee.attempts - testCase.policies.p0.aggregate.flee.attempts}/${testCase.policies.p1.aggregate.flee.executions - testCase.policies.p0.aggregate.flee.executions}/${testCase.policies.p1.aggregate.flee.failures - testCase.policies.p0.aggregate.flee.failures} | ${deltaMedian(testCase.policies.p1.aggregate.combat.combatCount, testCase.policies.p0.aggregate.combat.combatCount)} | ${deltaPp(testCase.policies.p1.aggregate.lootBuild.meaningfulLootOpportunity, testCase.policies.p0.aggregate.lootBuild.meaningfulLootOpportunity)} | ${deltaPp(testCase.policies.p1.aggregate.lootBuild.buildChange, testCase.policies.p0.aggregate.lootBuild.buildChange)} |`
    );
  });
  lines.push(
    "",
    "## Matched conversion",
    "",
    "| case | P0 Return → P1 deeper/death | P0 death → P1 death/Return | P0 B2 death → P1 B4/B5/B6 | P0 B3 death → P1 B4/B5/B6 |",
    "| --- | --- | --- | --- | --- |"
  );
  report.cases.forEach(testCase => {
    const conversion = testCase.matchedConversion;
    lines.push(
      `| ${testCase.scenarioId}/${testCase.startingKitId} | ${conversion.p0Return.runs}: ${pct(conversion.p0Return.deeperRate)}/${pct(conversion.p0Return.deathRate)} | ${conversion.p0Death.runs}: ${pct(conversion.p0Death.deathRate)}/${pct(conversion.p0Death.returnRate)} | ${conversion.p0EarlyDeathToP1[2].runs}: ${pct(conversion.p0EarlyDeathToP1[2].toB4Rate)}/${pct(conversion.p0EarlyDeathToP1[2].toB5Rate)}/${pct(conversion.p0EarlyDeathToP1[2].toB6Rate)} | ${conversion.p0EarlyDeathToP1[3].runs}: ${pct(conversion.p0EarlyDeathToP1[3].toB4Rate)}/${pct(conversion.p0EarlyDeathToP1[3].toB5Rate)}/${pct(conversion.p0EarlyDeathToP1[3].toB6Rate)} |`
    );
  });
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    "- This is production-backed diagnostic evidence, not a balance change or a claim about human optimal play.",
    "- Flee selection, execution, parting attacks, parting deaths, and observed parting HP damage use the existing round-level diagnostic; combat-inseparable status damage and merchant recovery acquisition remain unobserved.",
    "- Loot/build opportunity rates are measured from production reward and equipment telemetry; combat reward opportunities lost are unobserved.",
    "- Use the matched conversions and tradeoffs for human classification: Strategy-dominant, Survival-only tradeoff, Weak/neutral, Harmful, or Instrumentation-limited.",
    "- P1 is a diagnostic policy and is not a production recommendation."
  );
  return lines.join("\n");
}

export function buildReport(result, provenance = null, environmentSignature = null, { purpose = null, requestedRef = null } = {}) {
  return {
    measurement: {
      schemaVersion: result.schemaVersion,
      runnerVersion: result.runnerVersion,
      purpose,
      requestedRef,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...MEASUREMENT_RUNNER_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      baseRef: provenance?.baseRef || null,
      baseCommit: provenance?.baseCommit || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      environmentSignature,
      environmentSignatureHash: environmentSignature ? hashConfiguration(environmentSignature) : null,
      productionMechanism: "simulateRun",
      rawTracePolicy: "compact floor snapshots and bounded last-three cost events only",
      unobserved: [
        "enemy-inflicted poison/status damage can be inseparable from combat damage",
        "merchant recovery acquisition is not present in diagnostic rewardEvents",
        "combat reward opportunities lost are not separately identified"
      ]
    },
    configuration: result.configuration,
    comparisonKey: result.comparisonKey,
    determinism: result.determinism,
    cases: result.cases,
    interpretation: {
      candidates: [
        "Strategy-dominant",
        "Survival-only tradeoff",
        "Weak / neutral",
        "Harmful",
        "Instrumentation-limited"
      ],
      decision: "human review after durable N>=1000 measurement; no automatic balance classification",
      productionRecommendation: "none; P1 is a diagnostic policy, not a production candidate"
    }
  };
}

export function buildManifest(report, { runType = "diagnostic" } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "success",
    baselineCandidate: false,
    runType,
    purpose: report.measurement.purpose,
    source: {
      sourceSha: report.measurement.sourceCommit,
      gameplaySourceSha: report.measurement.gameplaySourceCommit,
      runnerSha: report.measurement.measurementRunnerCommit,
      runnerVersion: report.measurement.runnerVersion,
      schemaVersion: report.measurement.schemaVersion,
      paths: report.measurement.measurementRunnerPaths
    },
    provenance: {
      baseRef: report.measurement.baseRef,
      baseCommit: report.measurement.baseCommit,
      originMainAncestor: report.measurement.originMainAncestor,
      staleTreeAllowed: report.measurement.staleTreeAllowed,
      workingTreeClean: report.measurement.workingTreeClean,
      measurementRunnerDiffSha256: report.measurement.measurementRunnerDiffSha256
    },
    configuration: report.configuration,
    environment: {
      signature: report.measurement.environmentSignature,
      signatureHash: report.measurement.environmentSignatureHash
    },
    matching: {
      identity: report.configuration.matchedIdentity,
      keyFields: ["runIndex", "worldSeed"],
      duplicateMissingMismatch: "fail-fast",
      candidateOrderIndependent: true,
      sameWorldInputs: ["starting kit", "Workshop", "enemy", "trap", "chest", "loot", "Portal"]
    },
    cutoff: {
      floor: MEASUREMENT_CUTOFF_FLOOR,
      semantics: "synthetic measurement cutoff; never voluntary Return"
    },
    artifactPolicy: {
      rawCombatLog: "omitted",
      boundedTerminalCostEvents: 3
    },
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      url: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: report.measurement.requestedRef || null
    }
  };
}
