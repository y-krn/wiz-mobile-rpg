// sim-scope: infra — merge deterministic standard balance measurement shards
/* global console, process */

import fs from "node:fs";
import { join, resolve } from "node:path";
import {
  createMeasurementManifest,
  renderMeasurementManifestMarkdown
} from "./measurement_manifest.js";
import {
  mergeStandardMeasurementShards,
  renderDiagnosticsMarkdown,
  resolveBalanceMeasurementConfig
} from "./balance_measurement.js";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input-dir" || value === "--output-dir") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a path`);
      options[value.slice(2).replace("-", "_")] = next;
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurements/merge_balance_measurement.js --input-dir /tmp/shards --output-dir /tmp/balance-measurement");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.input_dir) throw new Error("--input-dir is required");
  if (!options.output_dir) throw new Error("--output-dir is required");
  return options;
}

function findPartialFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = join(root, entry.name);
    if (entry.isDirectory()) files.push(...findPartialFiles(file));
    else if (entry.isFile() && entry.name === "partial.json") files.push(file);
  }
  return files.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function metadata() {
  return {
    purpose: process.env.MEASUREMENT_PURPOSE || "",
    runType: process.env.MEASUREMENT_RUN_TYPE || "baseline-candidate",
    workflowRunId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || "",
    workflowRunUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || "",
    repository: process.env.MEASUREMENT_REPOSITORY || "",
    requestedRef: process.env.MEASUREMENT_REF || "main",
    runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || "",
    measuredAt: process.env.MEASUREMENT_AT || ""
  };
}

function writeOutputs(outputDirectory, report, status = "success") {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(join(outputDirectory, "measurement.json"), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    "# Standard balance measurement",
    "",
    `- runner: ${report.measurement.runnerVersion}`,
    `- source commit: \`${report.measurement.sourceCommit}\``,
    `- production baseline SHA: \`${report.measurement.productionBaselineSha}\``,
    `- configuration key: \`${report.measurement.comparisonKey}\``,
    `- N=${report.measurement.configuration.runs}, calibration=${report.measurement.configuration.calibrationRuns}, seed=${report.measurement.configuration.seed}`,
    `- fixtures: ${report.measurement.configuration.fixtureIds.join(", ")} (N=${report.measurement.configuration.runs}/fixture); tasks=${report.measurement.execution.taskCount}, parallelism=${report.measurement.execution.parallelism}, wall=${report.measurement.execution.wallClockMs}ms, CPU=${report.measurement.execution.cpuTimeMs}ms`,
    `- scenarios: ${report.measurement.configuration.scenarioIds.join(", ")}; depths: ${report.measurement.configuration.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    "",
    "The JSON file is the machine-readable measurement record. Compare it with `compare_balance.js`; do not use a single rerun or a raw stdout dump as a regression decision.",
    "",
    ...renderDiagnosticsMarkdown(report.cases)
  ];
  fs.writeFileSync(join(outputDirectory, "measurement.md"), lines.join("\n"));
  const manifest = createMeasurementManifest({
    measurementReport: status === "success" ? report : null,
    measurementReadError: status === "success" ? null : "standard measurement shards were incomplete",
    ...metadata(),
    measurementStepOutcome: status
  });
  fs.writeFileSync(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(join(outputDirectory, "manifest.md"), renderMeasurementManifestMarkdown(manifest));
}

function writeFailure(outputDirectory, error) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const message = error.stack || error.message;
  fs.writeFileSync(join(outputDirectory, "measurement.md"), `# Standard balance measurement\n\n- status: failure\n- error: ${message}\n`);
  const manifest = createMeasurementManifest({
    measurementReport: null,
    measurementReadError: message,
    ...metadata(),
    measurementStepOutcome: "failure"
  });
  fs.writeFileSync(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(join(outputDirectory, "manifest.md"), renderMeasurementManifestMarkdown(manifest));
}

try {
  const options = parseArgs(process.argv.slice(2));
  const inputDirectory = resolve(options.input_dir);
  const outputDirectory = resolve(options.output_dir);
  const partialFiles = findPartialFiles(inputDirectory);
  if (partialFiles.length === 0) throw new Error("no standard measurement shard partials found");
  const shards = partialFiles.map(readJson);
  const first = shards[0];
  const config = resolveBalanceMeasurementConfig({
    runs: first.configuration?.runs,
    calibrationRuns: first.configuration?.calibrationRuns,
    seed: first.configuration?.seed
  });
  const provenance = first.provenance;
  const execution = {
    taskCount: shards.reduce((total, shard) => total + (shard.execution?.taskCount || shard.taskResults.length), 0),
    parallelism: Number(process.env.MEASUREMENT_PARALLELISM || 4),
    wallClockMs: Math.max(...shards.map(shard => shard.execution?.wallClockMs || 0)),
    cpuTimeMs: shards.reduce((total, shard) => total + (shard.execution?.cpuTimeMs || 0), 0),
    shardCount: shards.length
  };
  const report = mergeStandardMeasurementShards({ config, provenance, shards, execution });
  writeOutputs(outputDirectory, report);
  console.log(`Merged standard balance measurement shards: ${outputDirectory}`);
} catch (error) {
  const outputDirectory = resolve(process.argv.includes("--output-dir")
    ? process.argv[process.argv.indexOf("--output-dir") + 1]
    : "/tmp/balance-measurement");
  writeFailure(outputDirectory, error);
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
