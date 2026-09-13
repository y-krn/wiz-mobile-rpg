// sim-scope: run — CLI for the production-backed run difficulty measurement
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import {
  DEFAULT_RUNS,
  DEFAULT_SEED,
  MEASUREMENT_RUNNER_PATHS,
  buildManifest,
  buildReport,
  buildSummary,
  buildPolicySensitivityReport,
  buildPolicySensitivitySummary,
  positiveInteger,
  runPolicySensitivityMeasurement,
  runMeasurement
} from "./run_difficulty_measurement.js";

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
  measurementRunnerPaths: [...MEASUREMENT_RUNNER_PATHS]
});
const requestedRef = options.ref || process.env.MEASUREMENT_REQUESTED_REF || null;
const purpose = options.purpose || null;
const policyIds = options.policies
  ? String(options.policies).split(",").map(value => value.trim()).filter(Boolean)
  : null;
const result = policyIds
  ? await runPolicySensitivityMeasurement({ runs, seed, portalPolicyIds: policyIds })
  : await runMeasurement({ runs, seed });
const report = policyIds
  ? buildPolicySensitivityReport(result, provenance, { purpose, requestedRef })
  : buildReport(result, provenance, { purpose, requestedRef });
const runType = process.env.MEASUREMENT_RUN_TYPE || options["run-type"] || "baseline-candidate";

fs.writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(resolve(summary), `${(policyIds ? buildPolicySensitivitySummary : buildSummary)(report)}\n`);
fs.writeFileSync(resolve(manifest), `${JSON.stringify(buildManifest(report, { runType }), null, 2)}\n`);
console.log(`Wrote run difficulty measurement: ${resolve(output)}`);
