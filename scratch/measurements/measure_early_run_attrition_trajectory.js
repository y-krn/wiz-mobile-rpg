// sim-scope: run — CLI for the production-backed B1-B5 attrition trajectory diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import {
  DEFAULT_RUNS,
  DEFAULT_SEED,
  MEASUREMENT_RUNNER_PATHS,
  RUNNER_VERSION,
  buildManifest,
  buildReport,
  buildSummary,
  printMeasurementEnvSignature,
  runMeasurement
} from "./early_run_attrition_trajectory.js";
import {
  applyStandardSimulationEnv,
  getStandardSimulationEnv,
  STANDARD_BALANCE_CONFIG
} from "./balance_measurement.js";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const runs = Number(options.runs || DEFAULT_RUNS);
const seed = Number(options.seed || DEFAULT_SEED);
const measurementId = options.measurement || "early-run-attrition";
const treatment = options.treatment || (
  measurementId === "b3plus-survival-decomposition"
    ? "b3plus-survival-decomposition"
    : "portal-policy"
  );
const output = options.output;
const summary = options.summary;
const manifest = options.manifest;
if (!output || !summary || !manifest) {
  throw new Error("--output, --summary, and --manifest are required");
}
if (!Number.isInteger(runs) || runs < DEFAULT_RUNS) {
  throw new Error(`runs must be an integer >= ${DEFAULT_RUNS}: ${runs}`);
}
if (!Number.isInteger(seed) || seed < 1) {
  throw new Error(`seed must be a positive integer: ${seed}`);
}

const config = { runs, seed, calibrationRuns: STANDARD_BALANCE_CONFIG.calibrationRuns };
applyStandardSimulationEnv(config);
const provenance = requireRunnerProvenance({
  fetchOriginMain: false,
  measurementRunnerPaths: [...MEASUREMENT_RUNNER_PATHS]
});
const environmentSignature = {
  ...getStandardSimulationEnv(config),
  runnerVersion: RUNNER_VERSION
};
printMeasurementEnvSignature(config);
const result = await runMeasurement({
  ...config,
  treatment,
  // Both build diagnostics need the exact same candidate telemetry; the
  // existing audit's default treatment/output semantics remain unchanged.
  collectEquipmentCandidateAudit: [
    "build-progression-audit",
    "build-progression-pareto-safe"
  ].includes(measurementId)
});
const report = buildReport(result, provenance, environmentSignature, {
  purpose: options.purpose || null,
  requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null,
  measurementId
});
const runType = process.env.MEASUREMENT_RUN_TYPE || "diagnostic";

// The report contains aggregates and bounded evidence samples; full per-run
// records remain temporary inside runMeasurement only.
fs.writeFileSync(resolve(output), `${JSON.stringify(report)}\n`);
fs.writeFileSync(resolve(summary), `${buildSummary(report)}\n`);
fs.writeFileSync(resolve(manifest), `${JSON.stringify(buildManifest(report, { runType }), null, 2)}\n`);
console.log(`Wrote ${RUNNER_VERSION}: ${resolve(output)}`);
