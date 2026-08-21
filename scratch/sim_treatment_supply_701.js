// sim-scope: run
/* global console, process */

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { pathToFileURL } from "node:url";

import {
  calibrateCoreScoringProfile,
  generateSharedRunFloor,
  getResolvedSimulationEnv,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} from "./sim_depth_material_ev.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const RUNS = Math.max(1, Number(process.env.SIM_RUNS || 500));
const CALIBRATION = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || 100));
const SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const SMOKE = process.env.ISSUE701_SMOKE === "1";
const TARGET_DEPTH = 21;
const CONDITION_ID = String(process.env.ISSUE701_CONDITION_ID || "unknown");
const SERIES_ID = "issue701-treatment-supply";

export { generateSharedRunFloor };

if (SIM_CLASSES.length !== CLASSES.length || CLASSES.some(name => !SIM_CLASSES.includes(name))) {
  throw new Error(`class set mismatch: ${SIM_CLASSES.join(",")}`);
}
for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES"]) {
  if (process.env[key] !== undefined) throw new Error(`${key} must be omitted`);
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function scenarioForRun(runIndex) {
  if (SMOKE) return "workshop-complete";
  const position = ((runIndex * 37) % RUNS + 0.5) / RUNS * 1200;
  let cumulative = 0;
  for (const [scenarioId, weight] of DISTRIBUTION) {
    cumulative += weight;
    if (position < cumulative) return scenarioId;
  }
  return DISTRIBUTION.at(-1)[0];
}

function compactResult(task, result) {
  return {
    conditionId: CONDITION_ID,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId: task.randomSequenceId,
    reachedFloor: result.reachedFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    deathFloor: result.deathFloor,
    finalMpRate: result.finalMpRate,
    finalMp: result.finalMp,
    finalMaxMp: result.finalMaxMp,
    mpDepleted: Boolean(result.mpDepleted),
    statusObservations: result.statusObservations,
    statusCureItemsAcquired: result.statusCureItemsAcquired,
    statusCureItemsUsed: result.statusCureItemsUsed,
    statusCureDecisions: result.statusCureDecisions,
    statusCureDecisionContexts: result.statusCureDecisionContexts,
    statusCureDecisionsByFloor: result.statusCureDecisionsByFloor,
    statusCureUnavailableStatuses: result.statusCureUnavailableStatuses,
    statusCureEvMetrics: result.statusCureEvMetrics,
    statusCureSupply: result.statusCureSupply,
    statusCureMerchantAttempts: result.statusCureMerchantAttempts,
    statusCureMerchantFailures: result.statusCureMerchantFailures,
    statusesCured: result.statusesCured,
    consumableUsageByItem: result.consumableUsageByItem,
    manaPotionsAcquiredBySource: result.manaPotionsAcquiredBySource,
    manaPotionsConsumedBySource: result.manaPotionsConsumedBySource,
    holyWaterAcquiredBySource: result.holyWaterAcquiredBySource,
    holyWaterConsumedBySource: result.holyWaterConsumedBySource,
    materialSources: result.materialSources,
    materialSourceCounts: result.materialSourceCounts,
    materialAcquired: result.materialAcquired,
    materialConsumed: result.materialConsumed,
    bankedMaterials: result.bankedMaterials,
    materialConsumedByMerchant: result.materialConsumedByMerchant,
    timeCost: result.timeCost,
    statusCuresUsed: Object.values(result.statusCureItemsUsed || {})
      .reduce((sum, amount) => sum + (Number(amount) || 0), 0)
  };
}

export function runIssue701Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  resetSimulationRandom(hashSeed(`${SEED}:issue612:${task.randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: SERIES_ID,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario: { ...scenario, collectDiagnostics: false },
    workshop: scenario.workshop
  });
  return compactResult(task, result);
}

function buildTasks() {
  return CLASSES.flatMap(className => Array.from({ length: RUNS }, (_, runIndex) => {
    const scenarioId = scenarioForRun(runIndex);
    return {
      className,
      runIndex,
      scenarioId,
      randomSequenceId: `${scenarioId}:${className}:${runIndex}`
    };
  }));
}

function calibrateProfiles() {
  const profiles = {};
  for (const [scenarioId] of DISTRIBUTION) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SEED);
    profiles[scenarioId] = calibrateCoreScoringProfile(
      SMOKE ? 1 : CALIBRATION,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return profiles;
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const tasks = buildTasks();
  const measurementStarted = performance.now();
  const measurementCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runIssue701Task",
    runTask: runIssue701Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  if (rows.length !== tasks.length) throw new Error(`row count mismatch ${rows.length}/${tasks.length}`);
  const result = {
    conditionId: CONDITION_ID,
    sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
    originMainAncestor: MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
    staleTreeAllowed: MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null,
    seed: SEED,
    runsPerClass: RUNS,
    calibrationRuns: SMOKE ? 1 : CALIBRATION,
    targetDepth: TARGET_DEPTH,
    classes: CLASSES,
    scenarioIds: DISTRIBUTION.map(([id]) => id),
    workshopDistribution: DISTRIBUTION,
    seriesId: SERIES_ID,
    randomSequence: "hashSeed(`${SIM_SEED}:issue612:${scenarioId}:${className}:${runIndex}`)",
    resolvedSimulationEnv: getResolvedSimulationEnv(),
    resolvedParallelism: resolveSimParallelism(tasks.length),
    calibration: {
      wallSeconds: 0,
      cpuSeconds: 0
    },
    measurement: {
      wallSeconds: 0,
      cpuSeconds: 0
    },
    profileSha256: createHash("sha256").update(JSON.stringify(scoringProfiles)).digest("hex"),
    rows
  };
  const timing = {
    calibration: {
      wallSeconds: SMOKE ? 0 : (performance.now() - calibrationStarted) / 1000,
      cpuSeconds: SMOKE ? 0 : (calibrationCpu.user + calibrationCpu.system) / 1e6
    },
    measurement: {
      wallSeconds: SMOKE ? 0 : (performance.now() - measurementStarted) / 1000,
      cpuSeconds: SMOKE ? 0 : (measurementCpu.user + measurementCpu.system) / 1e6
    }
  };
  process.stderr.write(`ISSUE701_TIMING ${JSON.stringify(timing)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
