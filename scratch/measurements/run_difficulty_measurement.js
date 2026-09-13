// sim-scope: run — production-backed starting-kit depth difficulty measurement
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { STARTING_KITS } from "../../src/state/initial_state.js";
import {
  STANDARD_BALANCE_CONFIG,
  applyStandardSimulationEnv,
  hashConfiguration,
  rateMetric
} from "./balance_measurement.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "run-difficulty-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const SCENARIO_IDS = Object.freeze(["workshop-empty", "workshop-complete"]);
export const TARGET_DEPTHS = Object.freeze([5, 10, 15, 20]);
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));

const RUNNER_PATH = "scratch/measurements/run_difficulty_measurement.js";
const PRODUCTION_PATHS = Object.freeze([
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

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

function positiveInteger(value, label, minimum = 1) {
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

function firstEvent(events, predicate) {
  return events.find(predicate) || null;
}

function createAccumulator(runs, targetDepths) {
  return {
    runs,
    outcomeCounts: {},
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
  targetDepths.forEach(depth => {
    accumulator.reachedByDepth[depth] += Number(result.reachedFloor >= depth);
    accumulator.breakthroughByDepth[depth] += Number(result.reachedFloor > depth);
  });

  if (result.outcome === "death") {
    increment(accumulator.deathsByFloor, result.deathFloor ?? result.reachedFloor ?? "unknown");
    increment(accumulator.deathCauses, result.runDiagnostics?.deathCauseCategory || "unknown");
  }
  if (result.outcome === "retreat") {
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

  const rewardEvents = result.diagnostics?.rewardEvents || [];
  accumulator.meaningfulLootRuns += Number(Boolean(firstEvent(rewardEvents, event => event.meaningful === true)));
  accumulator.equipmentOpportunityRuns += Number(Boolean(firstEvent(
    rewardEvents,
    event => event.category === "equipment"
  )));
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
      retreat: rateMetric(accumulator.outcomeCounts.retreat || 0, runs),
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
      retreatsOnFloor: accumulator.retreatsByFloor[depth] || 0
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
    retreatFloors: { ...accumulator.retreatsByFloor },
    deathCauses: { ...accumulator.deathCauses },
    retreatReasons: { ...accumulator.retreatReasons },
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
  if (normalizedKitIds.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`unknown starting kit in ${normalizedKitIds.join(",")}`);
  }
  if (normalizedScenarioIds.some(id => !SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be ${SCENARIO_IDS.join("|")}`);
  }

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

function buildReport(result, provenance, { purpose = null, requestedRef = null } = {}) {
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
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, ...PRODUCTION_PATHS],
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

function buildSummary(report) {
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
    "",
    "| scenario | starting kit | death | return | B5 reach / through | B10 reach / through | B15 reach / through | B20 reach / through | deepest p50 | top death cause |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  report.cases.forEach(testCase => {
    testCase.kits.forEach(kit => {
      const byDepth = new Map(kit.depths.map(depth => [depth.depth, depth]));
      const depthCell = depth => {
        const row = byDepth.get(depth);
        return `${percent(row?.reachedRate)} / ${percent(row?.breakthroughRate)}`;
      };
      lines.push(
        `| ${testCase.scenarioId} | ${kit.startingKitId} | ${percent(kit.outcomeRates.death)} | ${percent(kit.outcomeRates.retreat)} | ${depthCell(5)} | ${depthCell(10)} | ${depthCell(15)} | ${depthCell(20)} | ${kit.distributions.deepestFloor.p50 ?? "—"} | ${topCount(kit.deathCauses)} |`
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

function buildManifest(report) {
  return {
    schemaVersion: 1,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    purpose: report.measurement.purpose,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: report.measurement.requestedRef,
      generatedAt: new Date().toISOString()
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  const output = options.output;
  const summary = options.summary;
  const manifest = options.manifest;
  if (!output || !summary || !manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }

  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runMeasurement({ runs, seed });
  const report = buildReport(result, provenance, {
    purpose: options.purpose || null,
    requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null
  });
  fs.writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(summary), `${buildSummary(report)}\n`);
  fs.writeFileSync(resolve(manifest), `${JSON.stringify(buildManifest(report), null, 2)}\n`);
  console.log(`Wrote run difficulty measurement: ${resolve(output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
