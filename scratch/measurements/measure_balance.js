// sim-scope: run — standard N>=500 statistical balance measurement via the canonical run simulator
/* global console, process */

import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { resolveMeasurementProvenance } from "./measurement_provenance.js";
import { resolveSimParallelism, runSimTasks } from "../simulations/sim_parallel.js";
import {
  applyStandardSimulationEnv,
  createStandardMeasurementShard,
  createStandardSimulationTasks,
  mergeStandardMeasurementShards,
  resolveBalanceMeasurementConfig,
  renderDiagnosticsMarkdown
} from "./balance_measurement.js";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--output" || value === "--summary") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a path`);
      options[value.slice(2)] = next;
    } else if (value === "--runs" || value === "--calibration-runs" || value === "--seed" ||
      value === "--shard-index" || value === "--shard-count") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      const optionName = value === "--calibration-runs"
        ? "calibrationRuns"
        : value === "--shard-index"
          ? "shardIndex"
          : value === "--shard-count"
            ? "shardCount"
            : value.slice(2);
      options[optionName] = next === "" ? undefined : Number(next);
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurements/measure_balance.js --output /private/tmp/balance.json [--summary /private/tmp/balance.md] [--partial-output /private/tmp/shard.json --shard-index 0 --shard-count 12]");
      process.exit(0);
    } else if (value === "--partial-output") {
      const next = argv[++index];
      if (!next) throw new Error("--partial-output requires a path");
      options.partialOutput = next;
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output && !options.partialOutput) {
    throw new Error("--output or --partial-output is required; raw measurements must be explicitly placed in a temporary/results path");
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const config = resolveBalanceMeasurementConfig(options);
applyStandardSimulationEnv(config);

const provenance = resolveMeasurementProvenance({
  fetchOriginMain: false,
  measurementRunnerPaths: [
    "scratch/measurements/balance_measurement.js",
    "scratch/measurements/build_fixtures.js",
    "scratch/measurements/measure_balance.js",
    "scratch/measurements/merge_balance_measurement.js",
    "scratch/simulations/sim_depth_material_ev.js",
    "scratch/simulations/sim_parallel.js",
    "scratch/measurements/measurement_provenance.js",
    "src/rules/build_snapshot.js"
  ]
});

const { IDENTIFICATION_BALANCE } = await import("../../src/rules/identification_rules.js");
const standardEnv = process.env;
standardEnv.IDENTIFICATION_STARTING_POWDER = String(IDENTIFICATION_BALANCE.startingPowder);
standardEnv.IDENTIFICATION_COST_OVERRIDE = String(IDENTIFICATION_BALANCE.identifyCost);
const { runCalibratedDepthSimulationTask } = await import("../simulations/sim_depth_material_ev.js");

const allTasks = createStandardSimulationTasks(config);
const shard = options.partialOutput || options.shardIndex !== undefined || options.shardCount !== undefined
  ? resolveStandardMeasurementShard(config, {
      shardIndex: options.shardIndex,
      shardCount: options.shardCount
    })
  : { shardIndex: 0, shardCount: 1, tasks: allTasks };
if (options.partialOutput && options.shardIndex === undefined) {
  throw new Error("--partial-output requires --shard-index");
}
const tasks = shard.tasks;
const startedAt = performance.now();
const startedResourceUsage = process.resourceUsage();
const taskResults = await runSimTasks({
  moduleUrl: new URL("../simulations/sim_depth_material_ev.js", import.meta.url).href,
  exportName: "runCalibratedDepthSimulationTask",
  runTask: runCalibratedDepthSimulationTask,
  tasks,
  context: {},
  mapGeneratorExportName: "generateSharedRunFloor"
});
const endedResourceUsage = process.resourceUsage();
const execution = {
  taskCount: tasks.length,
  parallelism: resolveSimParallelism(tasks.length),
  wallClockMs: Math.round(performance.now() - startedAt),
  cpuTimeMs: Math.round(
    (endedResourceUsage.userCPUTime - startedResourceUsage.userCPUTime +
      endedResourceUsage.systemCPUTime - startedResourceUsage.systemCPUTime) / 1000
  )
};
const partial = createStandardMeasurementShard({
  config,
  provenance,
  shardIndex: shard.shardIndex,
  shardCount: shard.shardCount,
  taskResults: tasks.map((task, index) => ({ task, result: taskResults[index] }))
});
if (options.partialOutput) {
  const partialPath = resolve(options.partialOutput);
  fs.mkdirSync(dirname(partialPath), { recursive: true });
  fs.writeFileSync(partialPath, `${JSON.stringify({ ...partial, execution }, null, 2)}\n`);
  console.log(`Wrote standard balance measurement shard: ${partialPath}`);
  process.exit(0);
}
const report = mergeStandardMeasurementShards({
  config,
  provenance,
  shards: [partial],
  execution
});
const outputPath = resolve(options.output);
fs.mkdirSync(dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (options.summary) {
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  const lines = [
    "# Standard balance measurement",
    "",
    `- runner: ${report.measurement.runnerVersion}`,
    `- source commit: \`${report.measurement.sourceCommit}\``,
    `- production baseline SHA: \`${report.measurement.productionBaselineSha}\``,
    `- configuration key: \`${report.measurement.comparisonKey}\``,
    `- N=${config.runs}, calibration=${config.calibrationRuns}, seed=${config.seed}`,
    `- fixtures: ${config.fixtureIds.join(", ")} (N=${config.runs}/fixture); tasks=${execution.taskCount}, parallelism=${execution.parallelism}, wall=${execution.wallClockMs}ms, CPU=${execution.cpuTimeMs}ms`,
    `- scenarios: ${config.scenarioIds.join(", ")}; depths: ${config.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    "",
    "The JSON file is the machine-readable measurement record. Compare it with `compare_balance.js`; do not use a single rerun or a raw stdout dump as a regression decision.",
    "",
    ...renderDiagnosticsMarkdown(report.cases)
  ];
  fs.writeFileSync(summaryPath, lines.join("\n"));
}
console.log(`Wrote standard balance measurement: ${outputPath}`);
