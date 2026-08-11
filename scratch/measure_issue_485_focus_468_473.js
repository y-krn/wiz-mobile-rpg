// sim-scope: run — #485。#468/#473の符号反転セルだけ本測定。
/* global console, process */

import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSimTasks, resolveSimParallelism } from "./sim_parallel.js";
import { compareConditionRows } from "./measurement_utils.js";

process.env.SIM_SEED ||= "271";
process.env.SIM_RUNS ||= "50100";
process.env.SIM_CALIBRATION_RUNS ||= "100";
process.env.SIM_SCENARIOS ||= "workshop-core-pools,workshop-complete";
process.env.SIM_RESULT_BASENAME ||= "issue-485-audit-468-473-main";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const SEED = Number(process.env.SIM_SEED);
const RUNS = Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = Number(process.env.SIM_CALIBRATION_RUNS);
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CELLS = Object.freeze([
  ["smart", "workshop-core-pools"],
  ["never", "workshop-core-pools"],
  ["smart", "workshop-complete"],
  ["never", "workshop-complete"]
]);
const CONDITION_IDS = Object.freeze(["current", "ceiling"]);
const CONDITIONS = Object.freeze({
  current: Object.freeze({
    id: "current",
    mode: "base",
    trapOverride: null,
    trapBonusExposure: null
  }),
  ceiling: Object.freeze({
    id: "ceiling",
    mode: "trapBonus",
    trapOverride: { trapBonus: { multiplier: 1 } },
    trapBonusExposure: { mode: "all-b5-entrants", value: 20 }
  })
});

if (RUNS !== 50100 || CALIBRATION_RUNS !== 100) {
  throw new Error("#485 focused #468/#473 measurement requires SIM_RUNS=50100 and SIM_CALIBRATION_RUNS=100");
}

function buildScenario(scenarioId, curePolicy, condition) {
  return {
    ...getScenarioById(scenarioId),
    identificationPolicy: "powder",
    trapPolicy: "conservative",
    trapAvoidancePolicy: "ev",
    trapOverride: condition.trapOverride,
    trapBonusExposure: condition.trapBonusExposure,
    statusCurePolicy: curePolicy,
    statusCureHpThreshold: 0.35,
    statusCureMerchantPolicy: "missing",
    healPotionMerchantPolicy: "missing",
    fleeHpThreshold: 0.35,
    elitePolicy: "avoid",
    simDiagnosticLevel: "off"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, estimate: null, low: null, high: null };
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = (p + z ** 2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (p * (1 - p) + z ** 2 / (4 * trials)) / trials
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin)
  };
}

function pair(cellRows, selector, filter = () => true) {
  return compareConditionRows({
    leftRows: cellRows.filter(row => row.conditionId === "ceiling").filter(filter),
    rightRows: cellRows.filter(row => row.conditionId === "current").filter(filter),
    selector,
    condition: CONDITIONS.ceiling,
    pairKey: row => row.pairId
  });
}

function priestChestDisarm(cellRows) {
  const result = {};
  for (const conditionId of CONDITION_IDS) {
    const rows = cellRows.filter(row =>
      row.conditionId === conditionId && row.className === "Priest"
    );
    const attempts = rows.reduce(
      (sum, row) => sum + row.trap.chestDisarmAttempts,
      0
    );
    const successes = rows.reduce(
      (sum, row) => sum + row.trap.chestDisarmSuccesses,
      0
    );
    result[conditionId] = wilson(successes, attempts);
  }
  return result;
}

function formatEffect(result) {
  if (result.estimate === null) return "NA";
  return `${(result.estimate * 100).toFixed(2)}pt ` +
    `[${(result.low * 100).toFixed(2)}, ${(result.high * 100).toFixed(2)}]`;
}

async function writeRaw(rows, rawPath) {
  const stream = createWriteStream(rawPath);
  const hash = createHash("sha256");
  for (const row of rows) {
    const line = `${JSON.stringify(row)}\n`;
    hash.update(line);
    if (!stream.write(line)) await once(stream, "drain");
  }
  stream.end();
  await once(stream, "finish");
  return hash.digest("hex");
}

async function main() {
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const [curePolicy, scenarioId] of CELLS) {
    const scenario = buildScenario(scenarioId, curePolicy, CONDITIONS.current);
    for (const conditionId of CONDITION_IDS) {
      scenarios[`${conditionId}:${curePolicy}:${scenarioId}`] =
        buildScenario(scenarioId, curePolicy, CONDITIONS[conditionId]);
    }
    resetSimulationRandom(SEED);
    scoringProfiles[`${curePolicy}:${scenarioId}`] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;
  const tasks = CONDITION_IDS.flatMap(conditionId => CELLS.flatMap(([curePolicy, scenarioId]) =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      conditionId,
      curePolicy,
      scenarioId,
      runIndex,
      className: CLASSES[runIndex % CLASSES.length]
    }))
  ));
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(resolve("scratch/measure_issue_485_focus_468_473.js")).href,
    exportName: "runFocusedTask",
    runTask: runFocusedTask,
    tasks,
    context: { seed: SEED, conditions: CONDITIONS, scenarios, scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`row count mismatch: ${rows.length}/${tasks.length}`);
  }

  const resultDir = "scratch/results";
  const basename = process.env.SIM_RESULT_BASENAME;
  mkdirSync(resultDir, { recursive: true });
  const rawPath = `${resultDir}/${basename}.raw.jsonl`;
  const rawSha256 = await writeRaw(rows, rawPath);
  const cells = {};
  for (const [curePolicy, scenarioId] of CELLS) {
    const cellRows = rows.filter(row =>
      row.curePolicy === curePolicy && row.scenarioId === scenarioId
    );
    const priest = priestChestDisarm(cellRows);
    cells[`${curePolicy}:${scenarioId}`] = {
      runsPerCondition: RUNS,
      allRunReachedFloor: pair(cellRows, row => row.reachedFloor),
      b5Death: pair(cellRows, row => Number(row.b5Death), row => row.b5Entrant),
      b5Breakthrough: pair(
        cellRows,
        row => Number(row.b5Breakthrough),
        row => row.b5Entrant
      ),
      priestChestDisarm: {
        current: priest.current,
        ceiling: priest.ceiling,
        delta: priest.ceiling.estimate - priest.current.estimate
      }
    };
  }
  const measurement = {
    issue: "468/473",
    seed: SEED,
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    cells: Object.keys(cells),
    classes: CLASSES,
    resolvedParallelism: resolveSimParallelism(tasks.length),
    availableParallelism: availableParallelism(),
    simParallel: "<omitted>",
    simMapCacheEntries: "<omitted; runtime default 1024>",
    calibrationWallSeconds,
    simulationWallSeconds,
    totalWallSeconds: calibrationWallSeconds + simulationWallSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system +
      simulationCpu.user + simulationCpu.system
    ) / 1e6,
    rawSha256,
    command: "SIM_AUDIT_RUNS=500 SIM_SEED=271 SIM_RUNS=50100 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-core-pools,workshop-complete SIM_RESULT_BASENAME=issue-485-audit-468-473-main node scratch/measure_issue_485_focus_468_473.js"
  };
  const summary = { measurement, cells };
  const summaryPath = `${resultDir}/${basename}.json`;
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = createHash("sha256")
    .update(readFileSync(summaryPath))
    .digest("hex");
  const reportLines = [
    "# Issue #485 #468/#473 focused remeasurement",
    "",
    "上薬能動使用を含む固定kitで、低N監査で符号が変わった4セルだけ本測定。#468/#473の受入判定を変更する測定ではなく、符号確認用の再測定。",
    "",
    "## 結果",
    "",
    ...Object.entries(cells).flatMap(([cell, value]) => [
      `### ${cell}`,
      `- ceiling−current（paired, 95% CI）: 平均到達floor=${formatEffect(value.allRunReachedFloor)} / B5死亡=${formatEffect(value.b5Death)} / B5突破=${formatEffect(value.b5Breakthrough)}`,
      `- Priest chest disarm: current=${(value.priestChestDisarm.current.estimate * 100).toFixed(1)}% ` +
        `[${(value.priestChestDisarm.current.low * 100).toFixed(1)}%, ${(
          value.priestChestDisarm.current.high * 100
        ).toFixed(1)}%] / ceiling=${(value.priestChestDisarm.ceiling.estimate * 100).toFixed(1)}% ` +
        `[${(value.priestChestDisarm.ceiling.low * 100).toFixed(1)}%, ${(
          value.priestChestDisarm.ceiling.high * 100
        ).toFixed(1)}%] / delta=${(value.priestChestDisarm.delta * 100).toFixed(1)}pt`,
      ""
    ]),
    "## 測定記録",
    "",
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    `- summary JSON SHA-256: \`${summarySha256}\``,
    `- wall-clock: ${measurement.totalWallSeconds.toFixed(3)}s / CPU: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- resolved parallelism: ${measurement.resolvedParallelism}（available=${measurement.availableParallelism}）`,
    `- command: \`${measurement.command}\``,
    "- Wilson 95% CI / paired差は生成run対応、介入後軌跡は同一と解釈しない。"
  ];
  const reportPath = `${resultDir}/${basename}.md`;
  writeFileSync(reportPath, `${reportLines.join("\n")}\n`);
  console.log(JSON.stringify({
    reportPath,
    summaryPath,
    rawPath,
    rawSha256,
    summarySha256,
    measurement
  }, null, 2));
}

export function runFocusedTask(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = context.scenarios[
    `${task.conditionId}:${task.curePolicy}:${task.scenarioId}`
  ];
  const randomSequenceId = [
    task.curePolicy,
    task.scenarioId,
    task.className,
    task.runIndex
  ].join(":");
  resetSimulationRandom(hashSeed(`${context.seed}:${randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: "issue485-focused-468-473",
    scoringProfile: context.scoringProfiles[
      `${task.curePolicy}:${task.scenarioId}`
    ],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false,
    collectBuildSnapshots: true
  });
  const b5 = result.buildSnapshots?.find(snapshot =>
    snapshot.floor === 5 && snapshot.point === "floor-start"
  ) || null;
  return {
    conditionId: condition.id,
    scenarioId: task.scenarioId,
    curePolicy: task.curePolicy,
    runIndex: task.runIndex,
    className: task.className,
    pairId: [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":"),
    randomSequenceId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    b5Entrant: Boolean(b5),
    b5Death: Boolean(b5 && result.died && result.deathFloor === 5),
    b5Breakthrough: Boolean(b5 && result.buildSnapshots?.some(snapshot =>
      snapshot.floor === 6 && snapshot.point === "floor-start"
    )),
    trap: {
      chestDisarmAttempts: Number(result.chestDisarmAttempts || 0),
      chestDisarmSuccesses: Number(result.chestDisarmSuccesses || 0)
    }
  };
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
