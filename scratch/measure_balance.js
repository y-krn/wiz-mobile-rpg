// sim-scope: run — standard N>=500 statistical balance measurement via the canonical run simulator
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveMeasurementProvenance } from "./measurement_provenance.js";
import {
  applyStandardSimulationEnv,
  resolveBalanceMeasurementConfig,
  summarizeSimulationResults
} from "./balance_measurement.js";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--output" || value === "--summary") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a path`);
      options[value.slice(2)] = next;
    } else if (value === "--runs" || value === "--calibration-runs" || value === "--seed") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      const optionName = value === "--calibration-runs" ? "calibrationRuns" : value.slice(2);
      options[optionName] = Number(next);
    } else if (value === "--help") {
      console.log("Usage: node scratch/measure_balance.js --output /private/tmp/balance.json [--summary /private/tmp/balance.md]");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output) throw new Error("--output is required; raw measurements must be explicitly placed in a temporary/results path");
  return options;
}

const options = parseArgs(process.argv.slice(2));
const config = resolveBalanceMeasurementConfig(options);
applyStandardSimulationEnv(config);

const provenance = resolveMeasurementProvenance({
  fetchOriginMain: false,
  measurementRunnerPaths: [
    "scratch/balance_measurement.js",
    "scratch/measure_balance.js",
    "scratch/sim_depth_material_ev.js",
    "scratch/measurement_provenance.js"
  ]
});

const { IDENTIFICATION_BALANCE } = await import("../src/rules/identification_rules.js");
const standardEnv = process.env;
standardEnv.IDENTIFICATION_STARTING_POWDER = String(IDENTIFICATION_BALANCE.startingPowder);
standardEnv.IDENTIFICATION_COST_OVERRIDE = String(IDENTIFICATION_BALANCE.identifyCost);
const { runCalibratedDepthSimulationTask } = await import("./sim_depth_material_ev.js");

const scenarioResults = config.scenarioIds.map(scenarioId => {
  const task = runCalibratedDepthSimulationTask({
    kind: "scenario",
    scenarioId,
    identificationPolicyId: config.identificationPolicy,
    runCount: config.calibrationRuns
  }, {});
  return { scenarioId, results: task.results };
});
const report = summarizeSimulationResults({ config, provenance, scenarioResults });
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
    `- scenarios: ${config.scenarioIds.join(", ")}; depths: ${config.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    "",
    "The JSON file is the machine-readable measurement record. Compare it with `compare_balance.js`; do not use a single rerun or a raw stdout dump as a regression decision.",
    ""
  ];
  fs.writeFileSync(summaryPath, lines.join("\n"));
}
console.log(`Wrote standard balance measurement: ${outputPath}`);
