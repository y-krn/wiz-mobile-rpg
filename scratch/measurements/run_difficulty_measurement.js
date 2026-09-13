// sim-scope: run — production-backed starting-kit depth difficulty measurement library
/* global process */

import { STARTING_KITS } from "../../src/state/initial_state.js";
import {
  STANDARD_BALANCE_CONFIG,
  applyStandardSimulationEnv,
  getStandardSimulationEnv,
  hashConfiguration,
  rateMetric
} from "./balance_measurement.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "run-difficulty-v1";
export const SCHEMA_VERSION = 1;
export const POLICY_SENSITIVITY_RUNNER_VERSION = "run-difficulty-policy-sensitivity-v1";
export const POLICY_SENSITIVITY_SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const SCENARIO_IDS = Object.freeze(["workshop-empty", "workshop-complete"]);
export const TARGET_DEPTHS = Object.freeze([5, 10, 15, 20]);
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
export const PORTAL_POLICY_DEFINITIONS = Object.freeze({
  p0: Object.freeze({
    id: "p0",
    label: "current canonical",
    portalHpThreshold: 0.35,
    description: "current canonical HP-threshold Return policy"
  }),
  p1: Object.freeze({
    id: "p1",
    label: "lower threshold",
    portalHpThreshold: 0.20,
    description: "diagnostic lower-threshold sensitivity point"
  }),
  p2: Object.freeze({
    id: "p2",
    label: "threshold disabled",
    portalHpThreshold: null,
    description: "diagnostic upper-bound with HP-threshold Return disabled"
  })
});
export const DEFAULT_PORTAL_POLICY_ID = "p0";
export const MEASUREMENT_RUNNER_PATHS = Object.freeze([
  "scratch/measurements/measure_run_difficulty.js",
  "scratch/measurements/run_difficulty_measurement.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/balance_measurement.js",
  "src/state/initial_state.js",
  "src/rules/build_snapshot.js",
  "src/rules/chest_rules.js",
  "src/rules/trap_rules.js",
  "src/rules/trap_effect_rules.js",
  "src/run_map_generator.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/status_effects.js"
]);

export function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

export function resolvePortalPolicy(policyId = DEFAULT_PORTAL_POLICY_ID) {
  const policy = PORTAL_POLICY_DEFINITIONS[policyId];
  if (!policy) {
    throw new Error(`unknown portal policy ${policyId}; expected ${Object.keys(PORTAL_POLICY_DEFINITIONS).join("|")}`);
  }
  return policy;
}

function increment(target, key, amount = 1) {
  const normalized = key ?? "unknown";
  target[normalized] = (target[normalized] || 0) + amount;
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, mean: null, p25: null, p50: null, p75: null, p95: null, min: null, max: null };
  }
  const percentile = rate => {
    const position = (sorted.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p25: percentile(0.25),
    p50: percentile(0.50),
    p75: percentile(0.75),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function matchedWorldSeed(seed, runIndex) {
  return `run-difficulty:${seed}:${runIndex}`;
}

function compactDiagnosticRun(result, targetDepth, { runIndex, worldSeed } = {}) {
  const reachedMeasurementTarget = Number(result.reachedFloor) >= targetDepth;
  const outcome = result.outcome === "death"
    ? "death"
    : result.outcome === "retreat" && !reachedMeasurementTarget
      ? "voluntaryReturn"
      : result.outcome === "retreat" && reachedMeasurementTarget
        ? "measurementTargetReached"
        : result.outcome === "abandon"
          ? "abandon"
          : "other";
  const diagnostics = result.runDiagnostics || {};
  return {
    runIndex,
    worldSeed,
    outcome,
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor ?? null,
    returnFloor: outcome === "voluntaryReturn" ? Number(result.reachedFloor) : null,
    returnReason: outcome === "voluntaryReturn" ? diagnostics.retreatReason || "unknown" : null,
    deathCause: outcome === "death" ? diagnostics.deathCauseCategory || "unknown" : null,
    deathEncounterType: outcome === "death" ? result.deathEncounterType || "unknown" : null,
    hpRate: Number.isFinite(result.finalHpRate) ? result.finalHpRate : null,
    mpRate: Number.isFinite(result.finalMpRate) ? result.finalMpRate : null,
    recoveryRemaining: Number.isFinite(diagnostics.recoveryPotionsRemaining)
      ? diagnostics.recoveryPotionsRemaining
      : null,
    steps: Number(result.steps) || 0,
    combatCount: Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog.length : 0,
    combatRounds: Number(result.combatRounds) || 0,
    combatDamageHp: Number(result.combatDamageHp) || 0,
    floorTrapDamageHp: Number(result.trapDamageHpBySource?.floor) || 0,
    chestTrapDamageHp: Number(result.trapDamageHpBySource?.chest) || 0,
    fleeAttempts: Number(diagnostics.fleeAttempts) || 0
  };
}

function addConversionCount(target, from, to) {
  const key = `${from}->${to}`;
  target[key] = (target[key] || 0) + 1;
}

function finalizeConversionMetric(values) {
  return summarize(values);
}

export function buildMatchedConversion(baselineRecords, candidateRecords) {
  const indexRecords = (records, label) => {
    const byKey = new Map();
    const byRunIndex = new Map();
    records.forEach(record => {
      if (!Number.isInteger(record.runIndex) || typeof record.worldSeed !== "string" || !record.worldSeed) {
        throw new Error(`matched conversion ${label} record is missing runIndex/worldSeed`);
      }
      const key = JSON.stringify([record.runIndex, record.worldSeed]);
      if (byKey.has(key)) throw new Error(`matched conversion duplicate ${label} key: ${key}`);
      byKey.set(key, record);
      byRunIndex.set(record.runIndex, [...(byRunIndex.get(record.runIndex) || []), record.worldSeed]);
    });
    return { byKey, byRunIndex };
  };
  const baselineIndex = indexRecords(baselineRecords, "baseline");
  const candidateIndex = indexRecords(candidateRecords, "candidate");
  const joined = baselineRecords.map(baseline => {
    const key = JSON.stringify([baseline.runIndex, baseline.worldSeed]);
    const candidate = candidateIndex.byKey.get(key);
    if (!candidate) {
      const sameRunIndex = candidateIndex.byRunIndex.get(baseline.runIndex);
      if (sameRunIndex) {
        throw new Error(`matched conversion worldSeed mismatch for runIndex ${baseline.runIndex}`);
      }
      throw new Error(`matched conversion missing candidate key: ${key}`);
    }
    return { baseline, candidate };
  });
  candidateRecords.forEach(candidate => {
    const key = JSON.stringify([candidate.runIndex, candidate.worldSeed]);
    if (!baselineIndex.byKey.has(key)) {
      if (baselineIndex.byRunIndex.has(candidate.runIndex)) {
        throw new Error(`matched conversion worldSeed mismatch for runIndex ${candidate.runIndex}`);
      }
      throw new Error(`matched conversion missing baseline key: ${key}`);
    }
  });
  const transitions = {};
  const deeperReachTransitions = {};
  const p0ReturnCohort = {
    runs: 0,
    deeperReach: 0,
    death: 0,
    sameOrShallower: 0,
    finalReachedFloorDelta: [],
    deathFloors: {},
    deathCauses: {},
    additionalCombats: [],
    additionalSteps: [],
    recoveryRemaining: [],
    terminalHpRate: [],
    terminalMpRate: []
  };
  joined.forEach(({ baseline, candidate }) => {
    addConversionCount(transitions, baseline.outcome, candidate.outcome);
    if (candidate.outcome !== "death" && candidate.reachedFloor > baseline.reachedFloor) {
      addConversionCount(deeperReachTransitions, baseline.outcome, "deeperReach");
    }
    if (baseline.outcome !== "voluntaryReturn") return;
    p0ReturnCohort.runs++;
    p0ReturnCohort.finalReachedFloorDelta.push(candidate.reachedFloor - baseline.reachedFloor);
    p0ReturnCohort.additionalCombats.push(candidate.combatCount - baseline.combatCount);
    p0ReturnCohort.additionalSteps.push(candidate.steps - baseline.steps);
    if (candidate.outcome === "death") {
      p0ReturnCohort.death++;
      const deathFloor = candidate.deathFloor ?? candidate.reachedFloor ?? "unknown";
      const cause = candidate.deathCause || "unknown";
      increment(p0ReturnCohort.deathFloors, deathFloor);
      increment(p0ReturnCohort.deathCauses, cause);
    } else if (candidate.reachedFloor > baseline.reachedFloor) {
      p0ReturnCohort.deeperReach++;
    } else {
      p0ReturnCohort.sameOrShallower++;
    }
    if (candidate.recoveryRemaining !== null) p0ReturnCohort.recoveryRemaining.push(candidate.recoveryRemaining);
    if (candidate.hpRate !== null) p0ReturnCohort.terminalHpRate.push(candidate.hpRate);
    if (candidate.mpRate !== null) p0ReturnCohort.terminalMpRate.push(candidate.mpRate);
  });
  return {
    transitions,
    deeperReachTransitions,
    p0ReturnCohort: {
      ...p0ReturnCohort,
      deeperReachRate: rateMetric(p0ReturnCohort.deeperReach, p0ReturnCohort.runs),
      deathRate: rateMetric(p0ReturnCohort.death, p0ReturnCohort.runs),
      finalReachedFloorDelta: finalizeConversionMetric(p0ReturnCohort.finalReachedFloorDelta),
      additionalCombats: finalizeConversionMetric(p0ReturnCohort.additionalCombats),
      additionalSteps: finalizeConversionMetric(p0ReturnCohort.additionalSteps),
      recoveryRemaining: finalizeConversionMetric(p0ReturnCohort.recoveryRemaining),
      terminalHpRate: finalizeConversionMetric(p0ReturnCohort.terminalHpRate),
      terminalMpRate: finalizeConversionMetric(p0ReturnCohort.terminalMpRate)
    }
  };
}

function buildRateDelta(candidate, baseline) {
  return {
    estimate: (candidate?.estimate ?? 0) - (baseline?.estimate ?? 0),
    candidate,
    baseline
  };
}

function buildPolicyDelta(candidate, baseline) {
  const candidateDepths = new Map(candidate.depths.map(row => [row.depth, row]));
  const baselineDepths = new Map(baseline.depths.map(row => [row.depth, row]));
  return {
    b5Reach: buildRateDelta(candidateDepths.get(5)?.reachedRate, baselineDepths.get(5)?.reachedRate),
    b10Reach: buildRateDelta(candidateDepths.get(10)?.reachedRate, baselineDepths.get(10)?.reachedRate),
    b15Reach: buildRateDelta(candidateDepths.get(15)?.reachedRate, baselineDepths.get(15)?.reachedRate),
    b20Reach: buildRateDelta(candidateDepths.get(20)?.reachedRate, baselineDepths.get(20)?.reachedRate),
    death: buildRateDelta(candidate.outcomeRates.death, baseline.outcomeRates.death),
    voluntaryReturn: buildRateDelta(candidate.outcomeRates.voluntaryReturn, baseline.outcomeRates.voluntaryReturn),
    deathCauseShift: { candidate: candidate.deathCauses, baseline: baseline.deathCauses },
    resourcePressureShift: {
      recoveryPotionsRemaining: {
        candidate: candidate.distributions.recoveryPotionsRemaining,
        baseline: baseline.distributions.recoveryPotionsRemaining
      },
      combatDamageHp: {
        candidate: candidate.distributions.combatDamageHp,
        baseline: baseline.distributions.combatDamageHp
      },
      floorTrapDamageHp: {
        candidate: candidate.distributions.floorTrapDamageHp,
        baseline: baseline.distributions.floorTrapDamageHp
      },
      chestTrapDamageHp: {
        candidate: candidate.distributions.chestTrapDamageHp,
        baseline: baseline.distributions.chestTrapDamageHp
      }
    }
  };
}

export async function runPolicySensitivityMeasurement({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  startingKitIds = STARTING_KIT_IDS,
  scenarioIds = SCENARIO_IDS,
  targetDepths = TARGET_DEPTHS,
  allowSmallRunCount = false,
  portalPolicyIds = Object.keys(PORTAL_POLICY_DEFINITIONS)
} = {}) {
  const minimumRuns = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimumRuns);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedKitIds = [...startingKitIds];
  const normalizedScenarioIds = [...scenarioIds];
  const normalizedTargetDepths = [...targetDepths].map(depth => positiveInteger(depth, "targetDepth"));
  const normalizedPolicyIds = [...portalPolicyIds];
  if (normalizedPolicyIds.length < 2) throw new Error("policy sensitivity requires at least two portal policies");
  const policies = normalizedPolicyIds.map(resolvePortalPolicy);
  if (normalizedKitIds.length === 0 || normalizedKitIds.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`startingKitIds must be non-empty and drawn from ${STARTING_KIT_IDS.join("|")}`);
  }
  if (normalizedScenarioIds.length === 0 || normalizedScenarioIds.some(id => !SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be non-empty and drawn from ${SCENARIO_IDS.join("|")}`);
  }
  if (normalizedTargetDepths.length === 0) throw new Error("targetDepths must be non-empty");

  const envConfig = { ...STANDARD_BALANCE_CONFIG, seed: normalizedSeed, runs: normalizedRuns };
  applyStandardSimulationEnv(envConfig);
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("../simulations/sim_depth_material_ev.js");
  const simulationTargetDepth = Math.max(...normalizedTargetDepths) + 1;
  const runOne = ({ scenarioId, startingKitId, runIndex, policy }) => {
    const baseScenario = getScenarioById(scenarioId);
    return simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: simulationTargetDepth,
      runIndex,
      seriesId: `run-difficulty:${scenarioId}:${startingKitId}`,
      scoringProfile: null,
      scenario: {
        ...baseScenario,
        startingKit: startingKitId,
        portalPolicyId: policy.id,
        portalHpThreshold: policy.portalHpThreshold,
        collectEncounterIdentities: true,
        simDiagnosticLevel: "full"
      },
      workshop: baseScenario.workshop,
      worldSeed: `run-difficulty:${normalizedSeed}:${runIndex}`,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true
    });
  };

  const determinismByPolicy = {};
  const probeArgs = { scenarioId: normalizedScenarioIds[0], startingKitId: normalizedKitIds[0], runIndex: 0 };
  for (const policy of policies) {
    resetSimulationRandom(normalizedSeed);
    const first = compactDiagnosticRun(runOne({ ...probeArgs, policy }), simulationTargetDepth, {
      runIndex: probeArgs.runIndex,
      worldSeed: matchedWorldSeed(normalizedSeed, probeArgs.runIndex)
    });
    resetSimulationRandom(normalizedSeed);
    const second = compactDiagnosticRun(runOne({ ...probeArgs, policy }), simulationTargetDepth, {
      runIndex: probeArgs.runIndex,
      worldSeed: matchedWorldSeed(normalizedSeed, probeArgs.runIndex)
    });
    determinismByPolicy[policy.id] = { pass: JSON.stringify(first) === JSON.stringify(second), first, second };
    if (!determinismByPolicy[policy.id].pass) throw new Error(`policy sensitivity determinism probe failed: ${policy.id}`);
  }

  const cases = [];
  for (const scenarioId of normalizedScenarioIds) {
    for (const startingKitId of normalizedKitIds) {
      const policyRuns = {};
      const policyReports = [];
      for (const policy of policies) {
        resetSimulationRandom(normalizedSeed);
        const accumulator = createAccumulator(normalizedRuns, normalizedTargetDepths);
        const records = [];
        for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
          const result = runOne({ scenarioId, startingKitId, runIndex, policy });
          observeRun(accumulator, result, normalizedTargetDepths);
          records.push(compactDiagnosticRun(result, simulationTargetDepth, {
            runIndex,
            worldSeed: matchedWorldSeed(normalizedSeed, runIndex)
          }));
        }
        policyRuns[policy.id] = records;
        policyReports.push({
          policyId: policy.id,
          label: policy.label,
          portalHpThreshold: policy.portalHpThreshold,
          description: policy.description,
          ...finalizeAccumulator(accumulator, normalizedTargetDepths)
        });
      }
      const baselineRecords = policyRuns.p0;
      const baselineReport = policyReports.find(report => report.policyId === "p0");
      const comparisons = Object.fromEntries(
        policyReports
          .filter(report => report.policyId !== "p0")
          .map(report => [report.policyId, {
            delta: buildPolicyDelta(report, baselineReport),
            conversion: buildMatchedConversion(baselineRecords, policyRuns[report.policyId])
          }])
      );
      cases.push({ scenarioId, startingKitId, policies: policyReports, comparisons });
    }
  }

  const configuration = {
    runs: normalizedRuns,
    seed: normalizedSeed,
    startingKitIds: normalizedKitIds,
    scenarioIds: normalizedScenarioIds,
    targetDepths: normalizedTargetDepths,
    simulationTargetDepth,
    portalPolicies: policies.map(policy => ({
      portalPolicyId: policy.id,
      portalHpThreshold: policy.portalHpThreshold,
      portalMinFloor: Number(process.env.PORTAL_MIN_FLOOR),
      portalMaxHealPotions: Number(process.env.PORTAL_MAX_HEAL_POTIONS)
    })),
    sharedSimulationEnv: getStandardSimulationEnv(envConfig),
    matchedComparisonIdentity: hashConfiguration({
      source: "production-simulateRun",
      seed: normalizedSeed,
      startingKitIds: normalizedKitIds,
      scenarioIds: normalizedScenarioIds,
      targetDepths: normalizedTargetDepths,
      portalMinFloor: Number(process.env.PORTAL_MIN_FLOOR),
      portalMaxHealPotions: Number(process.env.PORTAL_MAX_HEAL_POTIONS),
      seedPolicy: "same worldSeed runIndex across P0/P1/P2"
    }),
    seedPolicy: "Each policy/starting-kit/workshop condition resets simulator RNG to seed; worldSeed is matched by runIndex.",
    policy: "matched production balance simulation with Portal HP threshold sensitivity only",
    classNameBridge: "Fighter is a scratch-only simulator axis shim; scenario.startingKit creates the production starting-kit character."
  };
  return {
    schemaVersion: POLICY_SENSITIVITY_SCHEMA_VERSION,
    runnerVersion: POLICY_SENSITIVITY_RUNNER_VERSION,
    configuration,
    comparisonKey: hashConfiguration(configuration),
    determinism: {
      pass: Object.values(determinismByPolicy).every(value => value.pass),
      byPolicy: determinismByPolicy
    },
    cases
  };
}

function createAccumulator(runs, targetDepths) {
  return {
    runs,
    outcomeCounts: {},
    voluntaryReturnRuns: 0,
    measurementTargetReachedRuns: 0,
    reachedByDepth: Object.fromEntries(targetDepths.map(depth => [depth, 0])),
    breakthroughByDepth: Object.fromEntries(targetDepths.map(depth => [depth, 0])),
    deathsByFloor: {},
    retreatsByFloor: {},
    deathCauses: {},
    retreatReasons: {},
    deepestFloor: [],
    steps: [],
    combatCount: [],
    combatRounds: [],
    combatDamageHp: [],
    floorTrapDamageHp: [],
    chestTrapDamageHp: [],
    endingHpRate: [],
    endingMpRate: [],
    recoveryPotionsRemaining: [],
    fleeAttempts: [],
    returnHpRate: [],
    returnMpRate: [],
    returnRecoveryPotions: [],
    returnHp: [],
    returnMaxHp: [],
    returnMp: [],
    returnMaxMp: [],
    deathTerminalHp: [],
    deathTerminalMp: [],
    deathEncounterTypes: {},
    combatDamageHpByType: {},
    meaningfulLootRuns: 0,
    equipmentOpportunityRuns: 0,
    buildChangeRuns: 0,
    buildShiftCount: [],
    endingBuildSnapshots: {}
  };
}

function observeRun(accumulator, result, targetDepths) {
  increment(accumulator.outcomeCounts, result.outcome);
  const measurementTargetDepth = Math.max(...targetDepths) + 1;
  const reachedMeasurementTarget = Number(result.reachedFloor) >= measurementTargetDepth;
  accumulator.measurementTargetReachedRuns += Number(reachedMeasurementTarget);
  accumulator.voluntaryReturnRuns += Number(result.outcome === "retreat" && !reachedMeasurementTarget);
  const diagnostics = result.runDiagnostics || {};

  targetDepths.forEach(depth => {
    accumulator.reachedByDepth[depth] += Number(result.reachedFloor >= depth);
    accumulator.breakthroughByDepth[depth] += Number(result.reachedFloor > depth);
  });

  if (result.outcome === "death") {
    increment(accumulator.deathsByFloor, result.deathFloor ?? result.reachedFloor ?? "unknown");
    increment(accumulator.deathCauses, result.runDiagnostics?.deathCauseCategory || "unknown");
    increment(accumulator.deathEncounterTypes, result.deathEncounterType || "unknown");
    if (Number.isFinite(result.finalHp)) accumulator.deathTerminalHp.push(result.finalHp);
    if (Number.isFinite(result.finalMp)) accumulator.deathTerminalMp.push(result.finalMp);
  }
  if (result.outcome === "retreat" && !reachedMeasurementTarget) {
    increment(accumulator.retreatsByFloor, result.reachedFloor ?? "unknown");
    increment(accumulator.retreatReasons, result.runDiagnostics?.retreatReason || "unknown");
    const returnEvent = result.portalUseEvents?.at(-1);
    accumulator.returnHpRate.push(Number(returnEvent?.hpRate ?? diagnostics.endingHpRate));
    accumulator.returnMpRate.push(Number(returnEvent?.mpRate ?? diagnostics.endingMpRate));
    accumulator.returnRecoveryPotions.push(Number(
      returnEvent?.recoveryPotions ?? diagnostics.recoveryPotionsRemaining
    ));
    accumulator.returnHp.push(Number(diagnostics.endingHp));
    accumulator.returnMaxHp.push(Number(diagnostics.endingMaxHp));
    accumulator.returnMp.push(Number(diagnostics.endingMp));
    accumulator.returnMaxMp.push(Number(diagnostics.endingMaxMp));
  }

  if (Number.isFinite(result.reachedFloor)) accumulator.deepestFloor.push(result.reachedFloor);
  if (Number.isFinite(result.steps)) accumulator.steps.push(result.steps);
  const encounters = Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog : [];
  accumulator.combatCount.push(encounters.length);
  if (Number.isFinite(result.combatRounds)) accumulator.combatRounds.push(result.combatRounds);
  if (Number.isFinite(result.combatDamageHp)) accumulator.combatDamageHp.push(result.combatDamageHp);
  accumulator.floorTrapDamageHp.push(Number(result.trapDamageHpBySource?.floor) || 0);
  accumulator.chestTrapDamageHp.push(Number(result.trapDamageHpBySource?.chest) || 0);

  if (Number.isFinite(diagnostics.endingHpRate)) accumulator.endingHpRate.push(diagnostics.endingHpRate);
  if (Number.isFinite(diagnostics.endingMpRate)) accumulator.endingMpRate.push(diagnostics.endingMpRate);
  if (Number.isFinite(diagnostics.recoveryPotionsRemaining)) {
    accumulator.recoveryPotionsRemaining.push(diagnostics.recoveryPotionsRemaining);
  }
  if (Number.isFinite(diagnostics.fleeAttempts)) accumulator.fleeAttempts.push(diagnostics.fleeAttempts);
  Object.entries(result.combatDamageHpByType || {}).forEach(([type, amount]) => {
    accumulator.combatDamageHpByType[type] = (accumulator.combatDamageHpByType[type] || 0) + (Number(amount) || 0);
  });

  const rewardEvents = result.diagnostics?.rewardEvents || result.rewardEvents || [];
  accumulator.meaningfulLootRuns += Number(rewardEvents.some(event => event.meaningful === true));
  accumulator.equipmentOpportunityRuns += Number(rewardEvents.some(event => event.category === "equipment"));
  const shifts = (result.equipmentTelemetry || []).filter(event => event.type === "swap");
  accumulator.buildChangeRuns += Number(shifts.length > 0);
  accumulator.buildShiftCount.push(shifts.length);

  const identity = result.endingBuildSnapshot?.identity || "unobserved";
  increment(accumulator.endingBuildSnapshots, identity);
}

function finalizeAccumulator(accumulator, targetDepths) {
  const runs = accumulator.runs;
  return {
    runs,
    outcomeCounts: { ...accumulator.outcomeCounts },
    outcomeRates: {
      death: rateMetric(accumulator.outcomeCounts.death || 0, runs),
      voluntaryReturn: rateMetric(accumulator.voluntaryReturnRuns, runs),
      measurementTargetReached: rateMetric(accumulator.measurementTargetReachedRuns, runs),
      abandon: rateMetric(accumulator.outcomeCounts.abandon || 0, runs),
      other: rateMetric(
        Math.max(
          0,
          runs -
            (accumulator.outcomeCounts.death || 0) -
            accumulator.voluntaryReturnRuns -
            accumulator.measurementTargetReachedRuns -
            (accumulator.outcomeCounts.abandon || 0)
        ),
        runs
      )
    },
    depths: targetDepths.map(depth => ({
      depth,
      reachedRate: rateMetric(accumulator.reachedByDepth[depth], runs),
      breakthroughRate: rateMetric(accumulator.breakthroughByDepth[depth], runs),
      deathsOnFloor: accumulator.deathsByFloor[depth] || 0,
      deathOnFloorRateAmongReached: rateMetric(
        accumulator.deathsByFloor[depth] || 0,
        accumulator.reachedByDepth[depth]
      ),
      voluntaryReturnsOnFloor: accumulator.retreatsByFloor[depth] || 0
    })),
    distributions: {
      deepestFloor: summarize(accumulator.deepestFloor),
      steps: summarize(accumulator.steps),
      combatCount: summarize(accumulator.combatCount),
      combatRounds: summarize(accumulator.combatRounds),
      combatDamageHp: summarize(accumulator.combatDamageHp),
      floorTrapDamageHp: summarize(accumulator.floorTrapDamageHp),
      chestTrapDamageHp: summarize(accumulator.chestTrapDamageHp),
      endingHpRate: summarize(accumulator.endingHpRate),
      endingMpRate: summarize(accumulator.endingMpRate),
      recoveryPotionsRemaining: summarize(accumulator.recoveryPotionsRemaining),
      fleeAttempts: summarize(accumulator.fleeAttempts),
      returnHpRate: summarize(accumulator.returnHpRate),
      returnMpRate: summarize(accumulator.returnMpRate),
      returnRecoveryPotions: summarize(accumulator.returnRecoveryPotions),
      returnHp: summarize(accumulator.returnHp),
      returnMaxHp: summarize(accumulator.returnMaxHp),
      returnMp: summarize(accumulator.returnMp),
      returnMaxMp: summarize(accumulator.returnMaxMp),
      deathTerminalHp: summarize(accumulator.deathTerminalHp),
      deathTerminalMp: summarize(accumulator.deathTerminalMp),
      buildShiftCount: summarize(accumulator.buildShiftCount)
    },
    deathFloors: { ...accumulator.deathsByFloor },
    voluntaryReturnFloors: { ...accumulator.retreatsByFloor },
    deathCauses: { ...accumulator.deathCauses },
    deathEncounterTypes: { ...accumulator.deathEncounterTypes },
    combatDamageHpByType: { ...accumulator.combatDamageHpByType },
    voluntaryReturnReasons: { ...accumulator.retreatReasons },
    opportunityRates: {
      meaningfulLoot: rateMetric(accumulator.meaningfulLootRuns, runs),
      equipment: rateMetric(accumulator.equipmentOpportunityRuns, runs),
      buildChange: rateMetric(accumulator.buildChangeRuns, runs)
    },
    endingBuildSnapshotDistribution: { ...accumulator.endingBuildSnapshots }
  };
}

function compactProbe(result) {
  return {
    outcome: result.outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor ?? null,
    terminationReason: result.terminationReason ?? null,
    finalHp: result.finalHp,
    finalMp: result.finalMp,
    endingBuildIdentity: result.endingBuildSnapshot?.identity || null
  };
}

export async function runMeasurement({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  startingKitIds = STARTING_KIT_IDS,
  scenarioIds = SCENARIO_IDS,
  targetDepths = TARGET_DEPTHS,
  allowSmallRunCount = false,
  portalPolicyId = DEFAULT_PORTAL_POLICY_ID
} = {}) {
  const minimumRuns = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimumRuns);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedKitIds = [...startingKitIds];
  const normalizedScenarioIds = [...scenarioIds];
  const normalizedTargetDepths = [...targetDepths].map(depth => positiveInteger(depth, "targetDepth"));
  if (normalizedKitIds.length === 0 || normalizedKitIds.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`startingKitIds must be non-empty and drawn from ${STARTING_KIT_IDS.join("|")}`);
  }
  if (normalizedScenarioIds.length === 0 || normalizedScenarioIds.some(id => !SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be non-empty and drawn from ${SCENARIO_IDS.join("|")}`);
  }
  if (normalizedTargetDepths.length === 0) throw new Error("targetDepths must be non-empty");
  const portalPolicy = resolvePortalPolicy(portalPolicyId);

  const envConfig = {
    ...STANDARD_BALANCE_CONFIG,
    seed: normalizedSeed,
    runs: normalizedRuns
  };
  applyStandardSimulationEnv(envConfig);
  const {
    getScenarioById,
    resetSimulationRandom,
    simulateRun
  } = await import("../simulations/sim_depth_material_ev.js");

  const simulationTargetDepth = Math.max(...normalizedTargetDepths) + 1;
  const runOne = ({ scenarioId, startingKitId, runIndex }) => {
    const baseScenario = getScenarioById(scenarioId);
    const scenario = {
      ...baseScenario,
      startingKit: startingKitId,
      portalPolicyId: portalPolicy.id,
      portalHpThreshold: portalPolicy.portalHpThreshold,
      collectEncounterIdentities: true,
      simDiagnosticLevel: "full"
    };
    return simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: simulationTargetDepth,
      runIndex,
      seriesId: `run-difficulty:${scenarioId}:${startingKitId}`,
      scoringProfile: null,
      scenario,
      workshop: scenario.workshop,
      worldSeed: `run-difficulty:${normalizedSeed}:${runIndex}`,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true
    });
  };

  const probeArgs = {
    scenarioId: normalizedScenarioIds[0],
    startingKitId: normalizedKitIds[0],
    runIndex: 0
  };
  resetSimulationRandom(normalizedSeed);
  const firstProbe = compactProbe(runOne(probeArgs));
  resetSimulationRandom(normalizedSeed);
  const secondProbe = compactProbe(runOne(probeArgs));
  const determinism = {
    pass: JSON.stringify(firstProbe) === JSON.stringify(secondProbe),
    first: firstProbe,
    second: secondProbe
  };
  if (!determinism.pass) throw new Error("run difficulty determinism probe failed");

  const cases = [];
  for (const scenarioId of normalizedScenarioIds) {
    const kits = [];
    for (const startingKitId of normalizedKitIds) {
      resetSimulationRandom(normalizedSeed);
      const accumulator = createAccumulator(normalizedRuns, normalizedTargetDepths);
      for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
        observeRun(
          accumulator,
          runOne({ scenarioId, startingKitId, runIndex }),
          normalizedTargetDepths
        );
      }
      kits.push({
        startingKitId,
        ...finalizeAccumulator(accumulator, normalizedTargetDepths)
      });
    }
    cases.push({ scenarioId, kits });
  }

  const configuration = {
    runs: normalizedRuns,
    seed: normalizedSeed,
    startingKitIds: normalizedKitIds,
    scenarioIds: normalizedScenarioIds,
    targetDepths: normalizedTargetDepths,
    simulationTargetDepth,
    seedPolicy: "Each scenario/starting-kit condition resets simulator RNG to seed; worldSeed is matched by runIndex across conditions.",
    policy: "standard balance simulation environment with production run mechanics",
    classNameBridge: "Fighter is a scratch-only simulator axis shim; scenario.startingKit creates the production starting-kit character and current reports contain no class comparison axis.",
    portalPolicyId: portalPolicy.id,
    portalHpThreshold: portalPolicy.portalHpThreshold,
    portalMinFloor: Number(process.env.PORTAL_MIN_FLOOR),
    portalMaxHealPotions: Number(process.env.PORTAL_MAX_HEAL_POTIONS)
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    configuration,
    comparisonKey: hashConfiguration(configuration),
    determinism,
    cases
  };
}

export function buildReport(result, provenance, { purpose = null, requestedRef = null } = {}) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const runnerVersion = result.runnerVersion || RUNNER_VERSION;
  const schemaVersion = result.schemaVersion || SCHEMA_VERSION;
  const environmentHash = printEnvSignatureBanner({
    scope,
    runnerVersion,
    schemaVersion,
    ...result.configuration
  }, { label: "run-difficulty" });
  return {
    ...result,
    measurement: {
      scope,
      schemaVersion,
      runnerVersion,
      profile: runnerVersion,
      purpose,
      requestedRef,
      comparisonKey: result.comparisonKey,
      productionBaselineSha: provenance?.gameplaySourceCommit || null,
      sourceCommit: provenance?.sourceCommit || null,
      simulatorRunnerCommit: provenance?.measurementRunnerCommit || provenance?.sourceCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...MEASUREMENT_RUNNER_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      environmentHash,
      configuration: result.configuration
    }
  };
}

export function buildPolicySensitivityReport(result, provenance, { purpose = null, requestedRef = null } = {}) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    scope,
    runnerVersion: result.runnerVersion,
    schemaVersion: result.schemaVersion,
    ...result.configuration
  }, { label: "run-difficulty-policy-sensitivity" });
  return {
    ...result,
    measurement: {
      scope,
      schemaVersion: result.schemaVersion,
      runnerVersion: result.runnerVersion,
      profile: result.runnerVersion,
      purpose,
      requestedRef,
      comparisonKey: result.comparisonKey,
      matchedComparisonIdentity: result.configuration.matchedComparisonIdentity,
      productionBaselineSha: provenance?.gameplaySourceCommit || null,
      sourceCommit: provenance?.sourceCommit || null,
      simulatorRunnerCommit: provenance?.measurementRunnerCommit || provenance?.sourceCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...MEASUREMENT_RUNNER_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      environmentHash,
      configuration: result.configuration
    }
  };
}

function percent(metric) {
  return metric?.estimate === null || metric?.estimate === undefined
    ? "—"
    : `${(metric.estimate * 100).toFixed(1)}%`;
}

function topCount(counts) {
  const entry = Object.entries(counts || {}).sort((left, right) => right[1] - left[1])[0];
  return entry ? `${entry[0]} (${entry[1]})` : "none";
}

export function buildSummary(report) {
  const lines = [
    "# Run difficulty measurement",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source: \`${report.measurement.sourceCommit || "not recorded"}\` / production baseline: \`${report.measurement.productionBaselineSha || "not recorded"}\``,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; kits=${report.configuration.startingKitIds.join(", ")}`,
    `- scenarios: ${report.configuration.scenarioIds.join(", ")}; observed depths: ${report.configuration.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    `- determinism probe: ${report.determinism.pass ? "PASS" : "FAIL"}`,
    "",
    "B5/B10/B15/B20 are read from the same B1-start cohort. `reached` means the run entered that floor; `breakthrough` means it reached a deeper floor.",
    "Runs that reach the synthetic B21 measurement target are reported separately and are not counted as voluntary Return.",
    "",
    "| scenario | starting kit | death | voluntary return | B21 cutoff | B5 reach / through | B10 reach / through | B15 reach / through | B20 reach / through | deepest p50 | top death cause |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  report.cases.forEach(testCase => {
    testCase.kits.forEach(kit => {
      const byDepth = new Map(kit.depths.map(depth => [depth.depth, depth]));
      const depthCell = depth => {
        const row = byDepth.get(depth);
        return `${percent(row?.reachedRate)} / ${percent(row?.breakthroughRate)}`;
      };
      lines.push(
        `| ${testCase.scenarioId} | ${kit.startingKitId} | ${percent(kit.outcomeRates.death)} | ${percent(kit.outcomeRates.voluntaryReturn)} | ${percent(kit.outcomeRates.measurementTargetReached)} | ${depthCell(5)} | ${depthCell(10)} | ${depthCell(15)} | ${depthCell(20)} | ${kit.distributions.deepestFloor.p50 ?? "—"} | ${topCount(kit.deathCauses)} |`
      );
    });
  });
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    "- This is an absolute run-progression observation under the declared canonical simulation policy, not a fixture win-rate equalization target.",
    "- A low reach rate does not authorize a nerf by itself; inspect death/return causes, resource pressure, and Build progression before opening a tuning Issue.",
    "- Starting kit is an input condition only. Ending Build Snapshot distribution is reported separately and starting kit is not a persistent class identity.",
    "- The simulator still uses a legacy `className: Fighter` scratch bridge to enter `simulateRun`; `scenario.startingKit` creates the production vNext character and combat path.",
    ""
  );
  return lines.join("\n");
}

function policySummaryRate(policy, field) {
  return percent(policy.outcomeRates[field]);
}

export function buildPolicySensitivitySummary(report) {
  const lines = [
    "# Run difficulty policy sensitivity diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source: \`${report.measurement.sourceCommit || "not recorded"}\``,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; matched identity=\`${report.configuration.matchedComparisonIdentity}\``,
    "- P0 = 35% current canonical; P1 = 20% diagnostic sensitivity; P2 = null / HP-threshold Return disabled (Portal mechanic retained)",
    `- determinism probe: ${report.determinism.pass ? "PASS" : "FAIL"}`,
    "",
    "The same B1-start cohort semantics and synthetic B21 cutoff are used for every policy. B21 cutoff is not voluntary Return.",
    "",
    "| Workshop | Starting kit | Policy | death | Return | B5 reach | B10 reach | B15 reach | B20 reach | top Return reason |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  report.cases.forEach(testCase => {
    testCase.policies.forEach(policy => {
      const depths = new Map(policy.depths.map(depth => [depth.depth, depth]));
      lines.push(
        `| ${testCase.scenarioId} | ${testCase.startingKitId} | ${policy.policyId} (${policy.portalHpThreshold === null ? "disabled" : `${policy.portalHpThreshold * 100}%`}) | ${policySummaryRate(policy, "death")} | ${policySummaryRate(policy, "voluntaryReturn")} | ${percent(depths.get(5)?.reachedRate)} | ${percent(depths.get(10)?.reachedRate)} | ${percent(depths.get(15)?.reachedRate)} | ${percent(depths.get(20)?.reachedRate)} | ${topCount(policy.voluntaryReturnReasons)} |`
      );
    });
    Object.entries(testCase.comparisons).forEach(([policyId, comparison]) => {
      const cohort = comparison.conversion.p0ReturnCohort;
      lines.push(
        `| ${testCase.scenarioId} | ${testCase.startingKitId} | ${policyId} vs P0 conversion | deeper ${percent(cohort.deeperReachRate)} | death ${percent(cohort.deathRate)} | — | — | — | — | P0 Return cohort=${cohort.runs} |`
      );
    });
  });
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    "- This diagnostic measures the canonical simulation policy, not human-player behavior.",
    "- P1/P2 are not production Portal recommendations and do not remove the Portal mechanic.",
    "- Classification remains an evidence-based human decision: policy-dominated, difficulty-dominated, mixed, or inconclusive."
  );
  return lines.join("\n");
}

export function buildManifest(report, { runType = "baseline-candidate" } = {}) {
  return {
    schemaVersion: 1,
    status: "success",
    baselineCandidate: runType === "baseline-candidate",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    purpose: report.measurement.purpose,
    runType,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: report.measurement.requestedRef,
      generatedAt: new Date().toISOString()
    }
  };
}
