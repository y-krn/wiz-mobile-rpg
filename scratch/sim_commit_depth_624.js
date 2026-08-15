// sim-scope: run — Issue #624 の撤退方針別到達深度・素材収支測定
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

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, [, weight]) => sum + weight,
  0
);
const SMOKE = process.env.ISSUE624_SMOKE === "1";
const SCENARIO_IDS = Object.freeze(
  SMOKE
    ? ["workshop-complete"]
    : WORKSHOP_DISTRIBUTION.map(([scenarioId]) => scenarioId)
);
const RUNS_PER_CLASS = Math.max(1, Number(process.env.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.SIM_CALIBRATION_RUNS || 100)
);
const TARGET_DEPTH = 21;
const SIM_SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const CONDITION_ID = String(process.env.ISSUE624_CONDITION_ID || "unknown");
const SERIES_ID = "issue612-exp-pace";

export { generateSharedRunFloor };

for (const key of ["SIM_PARALLEL", "SIM_MAP_CACHE_ENTRIES"]) {
  if (process.env[key] !== undefined) {
    throw new Error(`${key} must be omitted for Issue #624 measurement`);
  }
}

if (
  SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
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
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, weight] of WORKSHOP_DISTRIBUTION) {
    cumulative += weight;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function compactResult(task, result) {
  const statusCuresUsed = Object.values(result.statusCureItemsUsed || {})
    .reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  return {
    conditionId: CONDITION_ID,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId: task.randomSequenceId,
    reachedFloor: result.reachedFloor,
    endFloor: result.endFloor,
    deathFloor: result.deathFloor,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    outcome: result.outcome,
    finalLevel: result.finalLevel,
    expGained: result.expGained,
    deathCause: result.deathCause,
    deathEncounterType: result.deathEncounterType,
    deathSnapshot: result.deathSnapshot,
    finalCoreIds: [...result.finalCoreIds],
    finalRecoveryPotions: result.finalRecoveryPotions,
    finalStatusCureInventory: result.finalStatusCureInventory,
    materialAcquired: result.materialAcquired,
    materialConsumed: result.materialConsumed,
    carriedMaterials: result.carriedMaterials,
    bankedMaterials: result.bankedMaterials,
    carriedMaterialCounts: { ...result.carriedMaterialCounts },
    bankedMaterialCounts: { ...result.bankedMaterialCounts },
    timeCost: result.timeCost,
    battles: result.battles,
    normalEncounterCount: result.normalCombatTelemetry?.encounters || 0,
    trapEncounterCount: result.trapEncounterCount,
    trapDamageHp: result.trapDamageHp,
    fleeCount: result.fleeCount,
    townPortalsUsed: result.townPortalsUsed,
    statusCuresUsed,
    mpDepleted: Boolean(result.mpDepleted)
  };
}

export function runIssue624Task(task, context) {
  const scenario = getScenarioById(task.scenarioId);
  const scoringProfile = context.scoringProfiles[task.scenarioId];
  if (!scoringProfile) {
    throw new Error(`missing scoring profile: ${task.scenarioId}`);
  }
  resetSimulationRandom(hashSeed(`${SIM_SEED}:issue612:${task.randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: SERIES_ID,
    scoringProfile,
    scenario,
    workshop: scenario.workshop,
    // Keep the #612 run path identical; the returned diagnostics are discarded
    // after simulateRun so only the existing combat/exploration path is measured.
    collectDiagnostics: true
  });
  return compactResult(task, result);
}

function buildTasks() {
  return BASIC_CLASSES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => {
      const scenarioId = scenarioForRun(runIndex);
      return {
        className,
        runIndex,
        scenarioId,
        randomSequenceId: `${scenarioId}:${className}:${runIndex}`
      };
    })
  );
}

function calibrateProfiles() {
  const scoringProfiles = {};
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SIM_SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  return scoringProfiles;
}

function auditRows(rows, tasks) {
  if (rows.length !== tasks.length) {
    throw new Error(`row count mismatch: ${rows.length}/${tasks.length}`);
  }
  const expectedKeys = new Set(
    tasks.map(task => `${task.className}:${task.runIndex}:${task.scenarioId}`)
  );
  const seenKeys = new Set();
  for (const row of rows) {
    const key = `${row.className}:${row.runIndex}:${row.scenarioId}`;
    if (!expectedKeys.has(key) || seenKeys.has(key)) {
      throw new Error(`run key mismatch or duplicate: ${key}`);
    }
    seenKeys.add(key);
    if (Number(row.survived) + Number(row.died) !== 1) {
      throw new Error(`non-terminal result: ${JSON.stringify(row)}`);
    }
    if (!Number.isFinite(row.reachedFloor)) {
      throw new Error(`invalid reachedFloor: ${JSON.stringify(row)}`);
    }
    if (row.died && !row.deathSnapshot) {
      throw new Error(`missing death snapshot: ${key}`);
    }
  }
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibration = {
    wallSeconds: (performance.now() - calibrationStarted) / 1000,
    cpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6
  };

  const tasks = buildTasks();
  const measurementStarted = performance.now();
  const measurementCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runIssue624Task",
    runTask: runIssue624Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  auditRows(rows, tasks);

  const profileSha256 = createHash("sha256")
    .update(JSON.stringify(scoringProfiles))
    .digest("hex");
  const result = {
    conditionId: CONDITION_ID,
    sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
    originMainAncestor: MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
    staleTreeAllowed: MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null,
    seed: SIM_SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepth: TARGET_DEPTH,
    classes: BASIC_CLASSES,
    scenarioIds: SCENARIO_IDS,
    seriesId: SERIES_ID,
    randomSequence: "hashSeed(`${SIM_SEED}:issue612:${scenarioId}:${className}:${runIndex}`)",
    resolvedSimulationEnv: getResolvedSimulationEnv(),
    directSimulationEnv: {
      SIM_EXPLORATION_FACTOR: process.env.SIM_EXPLORATION_FACTOR || null,
      SIM_MAP_STATS: process.env.SIM_MAP_STATS || null,
      SIM_DAMAGE_PROBE: process.env.SIM_DAMAGE_PROBE || null
    },
    resolvedParallelism: resolveSimParallelism(tasks.length),
    calibration,
    measurement: {
      wallSeconds: (performance.now() - measurementStarted) / 1000,
      cpuSeconds: (measurementCpu.user + measurementCpu.system) / 1e6
    },
    profileSha256,
    rows
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  isMainThread &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
