// sim-scope: run — production-backed starting-kit depth difficulty measurement library
/* global process */

import { STARTING_KITS } from "../../src/state/initial_state.js";
import {
  STANDARD_BALANCE_CONFIG,
  applyStandardSimulationEnv,
  hashConfiguration,
  rateMetric
} from "./balance_measurement.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "run-difficulty-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const SCENARIO_IDS = Object.freeze(["workshop-empty", "workshop-complete"]);
export const TARGET_DEPTHS = Object.freeze([5, 10, 15, 20]);
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
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

  targetDepths.forEach(depth => {
    accumulator.reachedByDepth[depth] += Number(result.reachedFloor >= depth);
    accumulator.breakthroughByDepth[depth] += Number(result.reachedFloor > depth);
  });

  if (result.outcome === "death") {
    increment(accumulator.deathsByFloor, result.deathFloor ?? result.reachedFloor ?? "unknown");
    increment(accumulator.deathCauses, result.runDiagnostics?.deathCauseCategory || "unknown");
  }
  if (result.outcome === "retreat" && !reachedMeasurementTarget) {
    increment(accumulator.retreatsByFloor, result.reachedFloor ?? "unknown");
    increment(accumulator.retreatReasons, result.runDiagnostics?.retreatReason || "unknown");
  }

  if (Number.isFinite(result.reachedFloor)) accumulator.deepestFloor.push(result.reachedFloor);
  if (Number.isFinite(result.steps)) accumulator.steps.push(result.steps);
  const encounters = Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog : [];
  accumulator.combatCount.push(encounters.length);
  if (Number.isFinite(result.combatRounds)) accumulator.combatRounds.push(result.combatRounds);
  if (Number.isFinite(result.combatDamageHp)) accumulator.combatDamageHp.push(result.combatDamageHp);
  accumulator.floorTrapDamageHp.push(Number(result.trapDamageHpBySource?.floor) || 0);
  accumulator.chestTrapDamageHp.push(Number(result.trapDamageHpBySource?.chest) || 0);

  const diagnostics = result.runDiagnostics || {};
  if (Number.isFinite(diagnostics.endingHpRate)) accumulator.endingHpRate.push(diagnostics.endingHpRate);
  if (Number.isFinite(diagnostics.endingMpRate)) accumulator.endingMpRate.push(diagnostics.endingMpRate);
  if (Number.isFinite(diagnostics.recoveryPotionsRemaining)) {
    accumulator.recoveryPotionsRemaining.push(diagnostics.recoveryPotionsRemaining);
  }
  if (Number.isFinite(diagnostics.fleeAttempts)) accumulator.fleeAttempts.push(diagnostics.fleeAttempts);

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
      abandon: rateMetric(accumulator.outcomeCounts.abandon || 0, runs)
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
      buildShiftCount: summarize(accumulator.buildShiftCount)
    },
    deathFloors: { ...accumulator.deathsByFloor },
    voluntaryReturnFloors: { ...accumulator.retreatsByFloor },
    deathCauses: { ...accumulator.deathCauses },
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
  allowSmallRunCount = false
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
    classNameBridge: "Fighter is a scratch-only simulator axis shim; scenario.startingKit creates the production starting-kit character and current reports contain no class comparison axis."
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
  const environmentHash = printEnvSignatureBanner({
    scope,
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    ...result.configuration
  }, { label: "run-difficulty" });
  return {
    ...result,
    measurement: {
      scope,
      schemaVersion: SCHEMA_VERSION,
      runnerVersion: RUNNER_VERSION,
      profile: RUNNER_VERSION,
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
