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
export const CONVERGENCE_RUNNER_VERSION = "run-difficulty-convergence-v1";
export const CONVERGENCE_SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const SCENARIO_IDS = Object.freeze(["workshop-empty", "workshop-complete"]);
export const TARGET_DEPTHS = Object.freeze([5, 10, 15, 20]);
export const CONVERGENCE_TARGET_DEPTHS = Object.freeze([5, 10, 15, 20, 25, 30]);
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
export const CONVERGENCE_ROUTE_POLICIES = Object.freeze({
  stairsFirst: Object.freeze({
    id: "stairs-first",
    routePolicy: "partial_information_exploration",
    personaPolicy: Object.freeze({
      exploration: Object.freeze({ budgetMultiplier: 1, budgetExtraSteps: 0, afterStairsSteps: 0 })
    })
  }),
  balanced: Object.freeze({
    id: "balanced",
    routePolicy: "partial_information_exploration",
    personaPolicy: Object.freeze({
      exploration: Object.freeze({ budgetMultiplier: 1.15, budgetExtraSteps: 8, afterStairsSteps: 4 })
    })
  }),
  greedier: Object.freeze({
    id: "greedier",
    routePolicy: "partial_information_exploration",
    personaPolicy: Object.freeze({
      exploration: Object.freeze({ budgetMultiplier: 1.5, budgetExtraSteps: 16, afterStairsSteps: 10 })
    })
  })
});
export const CONVERGENCE_ELITE_POLICIES = Object.freeze(["avoid", "engage"]);
export const CONVERGENCE_PORTAL_POLICIES = Object.freeze({
  canonical: Object.freeze({ id: "canonical", portalHpThreshold: 0.35 }),
  morePushOriented: Object.freeze({ id: "more-push-oriented", portalHpThreshold: null })
});
export const CONVERGENCE_EQUIPMENT_POLICIES = Object.freeze({
  canonicalAdaptive: Object.freeze({ id: "canonical-adaptive", equipmentUpdatePolicy: "deterministic_greedy" })
});
export const MINIMUM_INTERPRETIVE_COHORT = 30;
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
    terminationReason: result.terminationReason || null,
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

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));
}

function loadoutObservation(checkpoint) {
  const equippedBaseIds = [...(checkpoint?.equippedBaseIds || [])].filter(Boolean).sort();
  const activeCoreIds = [...(checkpoint?.activeCoreIds || [])].filter(Boolean).sort();
  const supportAffixes = sortedObject(checkpoint?.supportAffixes);
  const inventoryBaseIds = [...(checkpoint?.inventoryBaseIds || [])].filter(Boolean);
  const has = id => equippedBaseIds.includes(id) || inventoryBaseIds.includes(id);
  const dragonCharmEquipped = equippedBaseIds.includes("DRAGON_CHARM");
  const dragonRingEquipped = equippedBaseIds.includes("DRAGON_RING");
  const dragonCharmOwned = has("DRAGON_CHARM");
  const dragonRingOwned = has("DRAGON_RING");
  const countermeasureCount = Number(dragonCharmOwned) + Number(dragonRingOwned);
  const weaponIds = equippedBaseIds.filter(id => ![
    "DRAGON_CHARM",
    "SMALL_SHIELD",
    "BUCKLER",
    "LARGE_SHIELD",
    "KNIGHT_SHIELD",
    "MAGIC_SHIELD",
    "LEGENDARY_SHIELD"
  ].includes(id));
  const twoHandWeaponIds = new Set([
    "SAGE_STAFF",
    "ARCH_WAND",
    "CLAYMORE",
    "KATANA",
    "LEGENDARY_SWORD",
    "SEALED_EXCALIBUR"
  ]);
  const weaponMode = weaponIds.some(id => twoHandWeaponIds.has(id)) ? "2H" : "1H-or-none";
  const signature = JSON.stringify({
    equippedBaseIds,
    activeCoreIds,
    supportAffixes,
    weaponMode
  });
  return {
    signature,
    equippedBaseIds,
    activeCoreIds,
    supportAffixes,
    inventoryBaseIds,
    weaponMode,
    dragonCharmOwned,
    dragonRingOwned,
    dragonCharmEquipped,
    dragonRingEquipped,
    antiDragonSupport: Number(supportAffixes.antiDragon || 0),
    countermeasureClass: countermeasureCount === 0 ? "none" : countermeasureCount === 1 ? "one" : "both"
  };
}

function readLootLifecycle(result) {
  const settlement = result?.objectLootSettlement;
  if (settlement && (Array.isArray(settlement.banked) || Array.isArray(settlement.lost))) {
    const banked = Array.isArray(settlement.banked) ? settlement.banked.length : 0;
    const lost = Array.isArray(settlement.lost) ? settlement.lost.length : 0;
    return {
      status: "measured_terminal_settlement",
      counts: {
        found: banked + lost,
        bagged: null,
        consumed: null,
        banked,
        salvaged: null,
        lost,
        discarded: null,
        left: null
      }
    };
  }
  const candidates = [
    result?.objectLootSettlement?.lifecycle?.counts,
    result?.buildPayment?.stake?.lifecycle?.counts,
    result?.runDiagnostics?.objectLootLifecycle
  ];
  const lifecycle = candidates.find(value => value && typeof value === "object");
  if (!lifecycle) return { status: "unobserved", counts: null };
  return {
    status: "measured",
    counts: Object.fromEntries([
      "found", "bagged", "consumed", "banked", "salvaged", "lost", "discarded", "left"
    ].map(key => [key, Number(lifecycle[key]) || 0]))
  };
}

function compactConvergenceRun(result, {
  runIndex,
  worldSeed,
  condition
} = {}) {
  const diagnostics = result.runDiagnostics || {};
  const checkpoints = Object.fromEntries(
    (result.checkpointSnapshots || [])
      .filter(snapshot => CONVERGENCE_TARGET_DEPTHS.includes(Number(snapshot.floor)))
      .map(snapshot => [String(snapshot.floor), loadoutObservation(snapshot)])
  );
  const equipmentChanges = (result.equipmentTelemetry || [])
    .filter(event => event.type === "swap").length;
  const loot = readLootLifecycle(result);
  const consumables = Object.fromEntries(
    Object.entries(result.consumableUsageByItem || {}).map(([itemId, usage]) => [itemId, {
      acquired: Number(usage?.acquired) || 0,
      consumed: Number(usage?.consumed) || 0
    }])
  );
  const milestoneDecisions = Array.isArray(result.milestoneDecisions)
    ? result.milestoneDecisions.length
    : 0;
  const portalUseEvents = Array.isArray(result.portalUseEvents) ? result.portalUseEvents : [];
  return {
    runIndex,
    worldSeed,
    condition,
    outcome: result.outcome,
    reachedFloor: Number(result.reachedFloor) || 0,
    deathFloor: result.deathFloor ?? null,
    deathCause: diagnostics.deathCauseCategory || result.deathCause || null,
    returnReason: diagnostics.retreatReason || null,
    steps: Number(result.steps) || 0,
    encounters: Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog.length : 0,
    combatRounds: Number(result.combatRounds) || 0,
    combatDamageHp: Number(result.combatDamageHp) || 0,
    mpConsumed: Number(result.mpConsumed) || 0,
    recoveryPotionsUsed: Number(result.recoveryPotionsUsed) || 0,
    endingHpRate: Number.isFinite(result.finalHpRate) ? result.finalHpRate : null,
    endingMpRate: Number.isFinite(result.finalMpRate) ? result.finalMpRate : null,
    portal: {
      pushDecisions: milestoneDecisions,
      returnDecisions: portalUseEvents.length,
      wingUses: portalUseEvents.length,
      events: portalUseEvents.map(event => ({
        floor: event.floor,
        situation: event.situation,
        reason: event.reason,
        hpRate: event.hpRate,
        recoveryPotions: event.recoveryPotions
      }))
    },
    elite: {
      opportunities: Number(result.eliteOpportunities) || Number(result.specialCellsDetected?.elite) || Number(result.eliteEncounters) || 0,
      encounters: Number(result.eliteEncounters) || 0,
      victories: Number(result.eliteVictories) || 0,
      flees: Number(result.eliteFlees) || 0,
      deaths: Number(result.eliteDeaths) || 0,
      avoidDetourSteps: Number(result.eliteAvoidDetourSteps) || 0
    },
    loot,
    equipped: Number(equipmentChanges > 0),
    equipmentChanges,
    consumables,
    checkpoints
  };
}

function createConvergenceAccumulator(runs, targetDepths) {
  return {
    runs,
    outcomeCounts: {},
    returnDecisionRuns: 0,
    deathFloors: {},
    deathCauses: {},
    returnReasons: {},
    reachedByDepth: Object.fromEntries(targetDepths.map(depth => [depth, 0])),
    breakthroughByDepth: Object.fromEntries(targetDepths.map(depth => [depth, 0])),
    steps: [],
    encounters: [],
    combatRounds: [],
    combatDamageHp: [],
    mpConsumed: [],
    recoveryPotionsUsed: [],
    endingHpRate: [],
    endingMpRate: [],
    portal: { pushDecisions: 0, returnDecisions: 0, wingUses: 0 },
    elite: { opportunities: 0, encounters: 0, victories: 0, flees: 0, deaths: 0, avoidDetourSteps: 0 },
    loot: { status: "unobserved", found: 0, equipped: 0, banked: 0, salvaged: null, lost: 0, discarded: null, left: null, consumed: null },
    consumables: {},
    buildChanges: [],
    checkpoints: Object.fromEntries(targetDepths.map(depth => [String(depth), {
      entrants: 0,
      observed: 0,
      loadouts: {},
      weaponModes: {},
      dragon: {
        entrants: 0,
        antiDragonSupport: 0,
        countermeasure: { none: 0, one: 0, both: 0 },
        charmOwned: 0,
        charmEquipped: 0,
        ringOwned: 0,
        ringEquipped: 0,
        outcomes: { death: 0, return: 0, deeper: 0 }
      }
    }]))
  };
}

function observeConvergenceRun(accumulator, record, targetDepths) {
  increment(accumulator.outcomeCounts, record.outcome);
  if (record.outcome === "death") {
    increment(accumulator.deathFloors, record.deathFloor ?? record.reachedFloor ?? "unknown");
    increment(accumulator.deathCauses, record.deathCause || "unknown");
  }
  if (record.returnReason) increment(accumulator.returnReasons, record.returnReason);
  accumulator.returnDecisionRuns += Number(record.portal.returnDecisions > 0);
  targetDepths.forEach(depth => {
    const reached = record.reachedFloor >= depth;
    accumulator.reachedByDepth[depth] += Number(reached);
    accumulator.breakthroughByDepth[depth] += Number(record.reachedFloor > depth);
    const checkpoint = accumulator.checkpoints[String(depth)];
    checkpoint.entrants += Number(reached);
    const loadout = record.checkpoints[String(depth)];
    if (!loadout) return;
    checkpoint.observed++;
    increment(checkpoint.loadouts, loadout.signature);
    increment(checkpoint.weaponModes, loadout.weaponMode);
    checkpoint.dragon.entrants++;
    checkpoint.dragon.antiDragonSupport += Number(loadout.antiDragonSupport > 0);
    checkpoint.dragon.countermeasure[loadout.countermeasureClass]++;
    checkpoint.dragon.charmOwned += Number(loadout.dragonCharmOwned);
    checkpoint.dragon.charmEquipped += Number(loadout.dragonCharmEquipped);
    checkpoint.dragon.ringOwned += Number(loadout.dragonRingOwned);
    checkpoint.dragon.ringEquipped += Number(loadout.dragonRingEquipped);
    checkpoint.dragon.outcomes.death += Number(record.outcome === "death");
    checkpoint.dragon.outcomes.return += Number(record.outcome === "retreat");
    checkpoint.dragon.outcomes.deeper += Number(record.reachedFloor > depth);
  });
  accumulator.steps.push(record.steps);
  accumulator.encounters.push(record.encounters);
  accumulator.combatRounds.push(record.combatRounds);
  accumulator.combatDamageHp.push(record.combatDamageHp);
  accumulator.mpConsumed.push(record.mpConsumed);
  accumulator.recoveryPotionsUsed.push(record.recoveryPotionsUsed);
  if (record.endingHpRate !== null) accumulator.endingHpRate.push(record.endingHpRate);
  if (record.endingMpRate !== null) accumulator.endingMpRate.push(record.endingMpRate);
  Object.entries(record.portal).forEach(([key, value]) => {
    if (key === "events") return;
    accumulator.portal[key] += value;
  });
  Object.entries(record.elite).forEach(([key, value]) => { accumulator.elite[key] += value; });
  if (record.loot.status !== "unobserved") {
    accumulator.loot.status = record.loot.status;
    Object.entries(record.loot.counts).forEach(([key, value]) => {
      if (Object.hasOwn(accumulator.loot, key) && Number.isFinite(value)) {
        accumulator.loot[key] = (accumulator.loot[key] || 0) + value;
      }
    });
  }
  accumulator.buildChanges.push(record.equipmentChanges);
  accumulator.loot.equipped += record.equipmentChanges;
  Object.entries(record.consumables).forEach(([itemId, usage]) => {
    const total = accumulator.consumables[itemId] ||= { acquired: 0, consumed: 0 };
    total.acquired += usage.acquired;
    total.consumed += usage.consumed;
  });
}

function finalizeConvergenceCheckpoint(checkpoint, runs) {
  const loadouts = Object.entries(checkpoint.loadouts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const entrantN = checkpoint.entrants;
  const cohortN = checkpoint.dragon.entrants;
  const concentration = entries => ({
    distinct: entries.length,
    top1: rateMetric(entries[0]?.[1] || 0, cohortN),
    top3: rateMetric(entries.slice(0, 3).reduce((sum, [, count]) => sum + count, 0), cohortN)
  });
  const cohortStatus = cohortN >= MINIMUM_INTERPRETIVE_COHORT ? "eligible" : "insufficient_population";
  return {
    entrantN,
    observedN: checkpoint.observed,
    populationStatus: cohortStatus,
    loadoutConcentration: concentration(loadouts),
    topLoadouts: loadouts.slice(0, 3).map(([signature, count]) => ({ signature, count })),
    weaponModes: { ...checkpoint.weaponModes },
    dragon: {
      ...checkpoint.dragon,
      antiDragonSupportRate: rateMetric(checkpoint.dragon.antiDragonSupport, cohortN),
      charmOwnedRate: rateMetric(checkpoint.dragon.charmOwned, cohortN),
      charmEquippedRate: rateMetric(checkpoint.dragon.charmEquipped, cohortN),
      ringOwnedRate: rateMetric(checkpoint.dragon.ringOwned, cohortN),
      ringEquippedRate: rateMetric(checkpoint.dragon.ringEquipped, cohortN)
    },
    denominatorNote: `natural B1-start entrants; interpretation requires N>=${MINIMUM_INTERPRETIVE_COHORT}`,
    runs
  };
}

function finalizeConvergenceAccumulator(accumulator, targetDepths) {
  const runs = accumulator.runs;
  return {
    runs,
    population: "natural B1-start",
    outcomeCounts: { ...accumulator.outcomeCounts },
    outcomeRates: {
      death: rateMetric(accumulator.outcomeCounts.death || 0, runs),
      return: rateMetric(accumulator.returnDecisionRuns, runs),
      retreat: rateMetric(accumulator.outcomeCounts.retreat || 0, runs),
      push: rateMetric(accumulator.portal.pushDecisions, runs),
      wing: rateMetric(accumulator.portal.wingUses, runs)
    },
    deathFloors: { ...accumulator.deathFloors },
    deathCauses: { ...accumulator.deathCauses },
    returnReasons: { ...accumulator.returnReasons },
    reach: targetDepths.map(depth => ({
      depth,
      entrantN: accumulator.checkpoints[String(depth)].entrants,
      reachedRate: rateMetric(accumulator.reachedByDepth[depth], runs),
      breakthroughRate: rateMetric(accumulator.breakthroughByDepth[depth], runs),
      checkpoint: finalizeConvergenceCheckpoint(accumulator.checkpoints[String(depth)], runs)
    })),
    portal: { ...accumulator.portal },
    elite: { ...accumulator.elite },
    loot: {
      ...accumulator.loot,
      secured: accumulator.loot.banked + (accumulator.loot.salvaged || 0),
      perRun: Object.fromEntries(Object.entries(accumulator.loot)
        .filter(([key]) => !["status"].includes(key))
        .map(([key, value]) => [key, Number.isFinite(value) ? value / Math.max(1, runs) : null]))
    },
    buildChanges: summarize(accumulator.buildChanges),
    resources: {
      steps: summarize(accumulator.steps),
      encounters: summarize(accumulator.encounters),
      combatRounds: summarize(accumulator.combatRounds),
      combatDamageHp: summarize(accumulator.combatDamageHp),
      mpConsumed: summarize(accumulator.mpConsumed),
      recoveryPotionsUsed: summarize(accumulator.recoveryPotionsUsed),
      endingHpRate: summarize(accumulator.endingHpRate),
      endingMpRate: summarize(accumulator.endingMpRate)
    },
    consumables: Object.fromEntries(Object.entries(accumulator.consumables)
      .sort(([left], [right]) => left.localeCompare(right))),
    interpretation: {
      status: targetDepths.some(depth => accumulator.checkpoints[String(depth)].dragon.entrants < MINIMUM_INTERPRETIVE_COHORT)
        ? "needs_more_measurement"
        : "measured",
      minimumCohort: MINIMUM_INTERPRETIVE_COHORT,
      scalarStrategyScore: "forbidden",
      causalClaim: "correlation_only"
    }
  };
}

function convergenceConditionKey(condition) {
  return [
    condition.scenarioId,
    condition.startingKitId,
    condition.routePolicyId,
    condition.elitePolicy,
    condition.portalPolicyId,
    condition.equipmentPolicyId
  ].join("/");
}

function convergencePairSummary(baselineRecords, candidateRecords) {
  const normalizeOutcome = record => ({
    ...record,
    outcome: record.outcome === "retreat" ? "voluntaryReturn" : record.outcome
  });
  const conversion = buildMatchedConversion(
    baselineRecords.map(normalizeOutcome),
    candidateRecords.map(normalizeOutcome)
  );
  const transitions = conversion.transitions;
  const deeper = candidateRecords.filter((candidate, index) => {
    const baseline = baselineRecords[index];
    return candidate.reachedFloor > baseline.reachedFloor;
  }).length;
  const shallower = candidateRecords.filter((candidate, index) => {
    const baseline = baselineRecords[index];
    return candidate.reachedFloor < baseline.reachedFloor;
  }).length;
  const same = candidateRecords.length - deeper - shallower;
  const resourceDelta = candidateRecords.map((candidate, index) => ({
    combatDamageHp: candidate.combatDamageHp - baselineRecords[index].combatDamageHp,
    mpConsumed: candidate.mpConsumed - baselineRecords[index].mpConsumed,
    recoveryPotionsUsed: candidate.recoveryPotionsUsed - baselineRecords[index].recoveryPotionsUsed,
    equipmentChanges: candidate.equipmentChanges - baselineRecords[index].equipmentChanges
  }));
  return {
    pairedRuns: candidateRecords.length,
    worldSeedIntegrity: true,
    reachDirection: {
      candidateDeeper: deeper,
      same: same,
      candidateShallower: shallower
    },
    outcomeTransitions: transitions,
    resourceDelta: {
      combatDamageHp: summarize(resourceDelta.map(row => row.combatDamageHp)),
      mpConsumed: summarize(resourceDelta.map(row => row.mpConsumed)),
      recoveryPotionsUsed: summarize(resourceDelta.map(row => row.recoveryPotionsUsed)),
      equipmentChanges: summarize(resourceDelta.map(row => row.equipmentChanges))
    },
    lootLifecycle: "condition aggregates retain measured/unobserved status; no scalar utility"
  };
}

export async function runConvergenceAuditMeasurement({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  startingKitIds = STARTING_KIT_IDS,
  scenarioIds = ["workshop-empty"],
  targetDepths = CONVERGENCE_TARGET_DEPTHS,
  routePolicyIds = Object.values(CONVERGENCE_ROUTE_POLICIES).map(policy => policy.id),
  elitePolicies = CONVERGENCE_ELITE_POLICIES,
  portalPolicyIds = Object.values(CONVERGENCE_PORTAL_POLICIES).map(policy => policy.id),
  equipmentPolicyIds = Object.values(CONVERGENCE_EQUIPMENT_POLICIES).map(policy => policy.id),
  allowSmallRunCount = false
} = {}) {
  const minimumRuns = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimumRuns);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedTargetDepths = [...targetDepths].map(depth => positiveInteger(depth, "targetDepth"));
  const normalizedKitIds = [...startingKitIds];
  const normalizedScenarioIds = [...scenarioIds];
  const routePolicies = routePolicyIds.map(id => Object.values(CONVERGENCE_ROUTE_POLICIES)
    .find(policy => policy.id === id));
  const elitePolicyList = [...elitePolicies];
  const portalPolicies = portalPolicyIds.map(id => Object.values(CONVERGENCE_PORTAL_POLICIES)
    .find(policy => policy.id === id));
  const equipmentPolicies = equipmentPolicyIds.map(id => Object.values(CONVERGENCE_EQUIPMENT_POLICIES)
    .find(policy => policy.id === id));
  if (normalizedTargetDepths.length === 0 || Math.max(...normalizedTargetDepths) > 30) {
    throw new Error("convergence targetDepths must be non-empty and <= 30");
  }
  if (normalizedKitIds.length === 0 || normalizedKitIds.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`startingKitIds must be non-empty and drawn from ${STARTING_KIT_IDS.join("|")}`);
  }
  if (normalizedScenarioIds.length === 0 || normalizedScenarioIds.some(id => !SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be non-empty and drawn from ${SCENARIO_IDS.join("|")}`);
  }
  if (routePolicies.some(policy => !policy) || elitePolicyList.some(policy => !CONVERGENCE_ELITE_POLICIES.includes(policy)) ||
      portalPolicies.some(policy => !policy) || equipmentPolicies.some(policy => !policy)) {
    throw new Error("unknown convergence policy");
  }

  const envConfig = { ...STANDARD_BALANCE_CONFIG, seed: normalizedSeed, runs: normalizedRuns };
  applyStandardSimulationEnv(envConfig);
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("../simulations/sim_depth_material_ev.js");
  const simulationTargetDepth = Math.max(...normalizedTargetDepths) + 1;
  const conditions = [];
  for (const scenarioId of normalizedScenarioIds) {
    for (const startingKitId of normalizedKitIds) {
      for (const routePolicy of routePolicies) {
        for (const elitePolicy of elitePolicyList) {
          for (const portalPolicy of portalPolicies) {
            for (const equipmentPolicy of equipmentPolicies) {
              conditions.push({
                scenarioId,
                startingKitId,
                routePolicyId: routePolicy.id,
                elitePolicy,
                portalPolicyId: portalPolicy.id,
                equipmentPolicyId: equipmentPolicy.id,
                routePolicy: routePolicy.routePolicy,
                personaPolicy: routePolicy.personaPolicy,
                portalHpThreshold: portalPolicy.portalHpThreshold,
                equipmentUpdatePolicy: equipmentPolicy.equipmentUpdatePolicy
              });
            }
          }
        }
      }
    }
  }
  const runOne = condition => {
    const baseScenario = getScenarioById(condition.scenarioId);
    const scenario = {
      ...baseScenario,
      startingKit: condition.startingKitId,
      routePolicy: condition.routePolicy,
      personaPolicy: condition.personaPolicy,
      elitePolicy: condition.elitePolicy,
      portalPolicyId: condition.portalPolicyId,
      portalHpThreshold: condition.portalHpThreshold,
      equipmentUpdatePolicy: condition.equipmentUpdatePolicy,
      collectEncounterIdentities: true,
      collectCheckpointSnapshots: true,
      simDiagnosticLevel: "full"
    };
    return simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: simulationTargetDepth,
      runIndex: condition.runIndex,
      seriesId: `run-difficulty-convergence:${condition.scenarioId}:${condition.startingKitId}`,
      scoringProfile: null,
      scenario,
      workshop: scenario.workshop,
      worldSeed: `run-difficulty:${normalizedSeed}:${condition.runIndex}`,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true
    });
  };

  const probeCondition = { ...conditions[0], runIndex: 0 };
  resetSimulationRandom(normalizedSeed);
  const firstProbe = compactConvergenceRun(runOne(probeCondition), {
    runIndex: 0,
    worldSeed: `run-difficulty:${normalizedSeed}:0`,
    condition: convergenceConditionKey(probeCondition)
  });
  resetSimulationRandom(normalizedSeed);
  const secondProbe = compactConvergenceRun(runOne(probeCondition), {
    runIndex: 0,
    worldSeed: `run-difficulty:${normalizedSeed}:0`,
    condition: convergenceConditionKey(probeCondition)
  });
  const determinism = {
    pass: JSON.stringify(firstProbe) === JSON.stringify(secondProbe),
    first: firstProbe,
    second: secondProbe
  };
  if (!determinism.pass) throw new Error("run difficulty convergence determinism probe failed");

  const recordsByKey = new Map();
  const reports = [];
  for (const condition of conditions) {
    resetSimulationRandom(normalizedSeed);
    const key = convergenceConditionKey(condition);
    const accumulator = createConvergenceAccumulator(normalizedRuns, normalizedTargetDepths);
    const records = [];
    for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
      const conditionWithIndex = { ...condition, runIndex };
      const result = runOne(conditionWithIndex);
      const record = compactConvergenceRun(result, {
        runIndex,
        worldSeed: `run-difficulty:${normalizedSeed}:${runIndex}`,
        condition: key
      });
      records.push(record);
      observeConvergenceRun(accumulator, record, normalizedTargetDepths);
    }
    recordsByKey.set(key, records);
    reports.push({
      ...condition,
      key,
      ...finalizeConvergenceAccumulator(accumulator, normalizedTargetDepths)
    });
  }

  const baselineKeys = new Set(normalizedScenarioIds.map(scenarioId => convergenceConditionKey({
    scenarioId,
    startingKitId: "vanguard",
    routePolicyId: "balanced",
    elitePolicy: "avoid",
    portalPolicyId: "canonical",
    equipmentPolicyId: "canonical-adaptive"
  })));
  const comparisons = reports
    .filter(report => !baselineKeys.has(report.key))
    .map(report => {
      const baselineRecords = recordsByKey.get([...baselineKeys].find(key => key.startsWith(`${report.scenarioId}/`))) ||
        recordsByKey.values().next().value;
      return {
        condition: report.key,
        comparison: convergencePairSummary(baselineRecords, recordsByKey.get(report.key))
      };
    });
  const configuration = {
    runs: normalizedRuns,
    seed: normalizedSeed,
    startingKitIds: normalizedKitIds,
    scenarioIds: normalizedScenarioIds,
    targetDepths: normalizedTargetDepths,
    simulationTargetDepth,
    routePolicies: routePolicies.map(policy => ({
      id: policy.id,
      routePolicy: policy.routePolicy,
      personaPolicy: policy.personaPolicy
    })),
    elitePolicies: elitePolicyList,
    portalPolicies: portalPolicies.map(policy => ({ id: policy.id, portalHpThreshold: policy.portalHpThreshold })),
    equipmentPolicies: equipmentPolicies.map(policy => ({ ...policy })),
    seedPolicy: "same worldSeed runIndex across every condition; paired only until policy divergence",
    population: "natural B1-start",
    syntheticDeepPopulation: false,
    sameStateCounterfactual: {
      status: "not_run",
      reason: "simulateRun exposes deterministic matched reruns, not resumable state clone at Portal decision"
    },
    policy: "production-backed convergence audit; no balance tuning; no scalar strategy score"
  };
  return {
    schemaVersion: CONVERGENCE_SCHEMA_VERSION,
    runnerVersion: CONVERGENCE_RUNNER_VERSION,
    configuration,
    comparisonKey: hashConfiguration(configuration),
    determinism,
    baselineCondition: baselineKeys.size === 1 ? [...baselineKeys][0] : [...baselineKeys],
    conditions: reports,
    comparisons
  };
}

export function buildConvergenceReport(result, provenance, { purpose = null, requestedRef = null } = {}) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    scope,
    runnerVersion: result.runnerVersion,
    schemaVersion: result.schemaVersion,
    ...result.configuration
  }, { label: "run-difficulty-convergence" });
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

export function buildConvergenceSummary(report) {
  const lines = [
    "# Run difficulty convergence audit",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source: \`${report.measurement.sourceCommit || "not recorded"}\` / production baseline: \`${report.measurement.productionBaselineSha || "not recorded"}\``,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; population=${report.configuration.population}`,
    `- depths: ${report.configuration.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; same-state Portal counterfactual: ${report.configuration.sameStateCounterfactual.status}`,
    "",
    "Natural B1-start only. B25/B30 synthetic or frozen deep population is not included.",
    "No scalar strategy score or Build Power. Pairing reports direction, outcome conversion, resource, and loot dimensions separately.",
    ""
  ];
  report.conditions.forEach(condition => {
    const reach = Object.fromEntries(condition.reach.map(row => [row.depth, row]));
    lines.push(
      `- ${condition.key}: death=${percent(condition.outcomeRates.death)}, Return=${percent(condition.outcomeRates.return)}, ` +
      `Push=${condition.portal.pushDecisions}, Wing=${condition.portal.wingUses}, ` +
      `B5=${percent(reach[5]?.reachedRate)}, B10=${percent(reach[10]?.reachedRate)}, ` +
      `B15=${percent(reach[15]?.reachedRate)}, B20=${percent(reach[20]?.reachedRate)}, ` +
      `B25 entrants=${reach[25]?.entrantN ?? "—"}, B30 entrants=${reach[30]?.entrantN ?? "—"}`
    );
  });
  lines.push(
    "",
    "## Evidence boundary",
    "",
    "- Reach, death, Return, Push, Wing, resource use, loot lifecycle, build changes, and checkpoint loadout distributions are separate observations.",
    "- Checkpoint top1/top3 and Dragon cohort results are descriptive only when the natural entrant cohort is N>=30; smaller cohorts remain needs_more_measurement.",
    "- Same-world-seed pairing is valid for matched runs. Same-state Portal Return vs Push cloning is not claimed because the current production-backed simulator has no resumable state-clone boundary.",
    "- Correlation does not establish causation. Gameplay, loot, enemy, Portal, elite, RNG, and balance values remain unchanged."
  );
  return lines.join("\n");
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
