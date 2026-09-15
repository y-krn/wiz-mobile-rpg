// sim-scope: infra — registry/router for the single Balance measurement entrypoint
/* global console, process */

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMeasurementManifest,
  renderMeasurementManifestMarkdown
} from "./measurement_manifest.js";

export const BALANCE_MEASUREMENT_ENTRY_VERSION = "balance-entry-v1";
export const MEASUREMENT_RUN_TYPES = Object.freeze([
  "baseline-candidate",
  "diagnostic",
  "temporary"
]);

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT_DIRECTORY = "/tmp/balance-measurement";
const DEFAULT_REF = "main";

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    defaults: Object.freeze({ ...definition.defaults }),
    allowedRunTypes: Object.freeze([...(definition.allowedRunTypes || MEASUREMENT_RUN_TYPES)]),
    allowed: Object.freeze({
      ...(definition.allowed || {})
    })
  });
}

const outputArgs = (output, names = ["output", "summary", "manifest"]) => names.flatMap(name => [
  `--${name}`,
  output[name === "output" ? "measurement" : name]
]);

const standardArgs = ({ options, output }) => [
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  "--calibration-runs", String(options.calibrationRuns),
  ...outputArgs(output, ["output", "summary"])
];

const startingKitArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--starting-kit", options.startingKit,
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  "--policy", options.policy,
  "--flee-hp-threshold", String(options.fleeHpThreshold),
  "--purpose", options.purpose,
  ...outputArgs(output)
];

const earlyB1FArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--runs", String(options.runs),
  "--selection-runs", String(options.selectionRuns),
  "--fixed-runs", String(options.fixedRuns),
  "--seed", String(options.seed),
  "--selection-seed", String(options.selectionSeed),
  "--fixed-seed", String(options.fixedSeed),
  "--purpose", options.purpose,
  ...outputArgs(output)
];

const fixedCombatArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  "--starting-kit", options.startingKit,
  "--purpose", options.purpose,
  ...outputArgs(output)
];

const equipmentLoadArgs = ({ options, output }) => [
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  ...outputArgs(output, ["output", "summary"])
];

const runDifficultyArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  ...(options.policies ? ["--policies", options.policies] : []),
  "--purpose", options.purpose,
  ...outputArgs(output)
];

const earlyAttritionArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--treatment", options.treatment,
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  "--purpose", options.purpose,
  ...outputArgs(output)
];

const survivalPolicyArgs = ({ options, output }) => [
  "--ref", options.ref,
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  "--purpose", options.purpose,
  ...outputArgs(output)
];

export const MEASUREMENT_REGISTRY = Object.freeze({
  standard: freezeDefinition({
    id: "standard",
    label: "Standard statistical balance",
    runner: "scratch/measurements/measure_balance.js",
    adapter: "standard-manifest",
    defaultRunType: "baseline-candidate",
    allowedRunTypes: ["baseline-candidate", "diagnostic", "temporary"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 500, minimumRuns: 500, seed: 843, calibrationRuns: 100 },
    buildArgs: standardArgs
  }),
  "starting-kit-early-run": freezeDefinition({
    id: "starting-kit-early-run",
    label: "Starting-kit early-run diagnostic",
    runner: "scratch/measurements/starting_kit_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1139, startingKit: "vanguard", policy: "fight", fleeHpThreshold: 0.20 },
    allowed: {
      startingKit: ["vanguard", "scout", "devotion", "arcana"],
      policy: ["fight", "flee-threshold", "visible-multi-enemy-flee"]
    },
    buildArgs: startingKitArgs
  }),
  "early-b1f-composition": freezeDefinition({
    id: "early-b1f-composition",
    label: "Early B1F composition diagnostic",
    runner: "scratch/measurements/early_b1f_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: {
      runs: 1000,
      minimumRuns: 1000,
      seed: 2192,
      selectionRuns: 5000,
      minimumSelectionRuns: 5000,
      selectionSeed: 1192,
      fixedRuns: 1000,
      minimumFixedRuns: 1000,
      fixedSeed: 1151
    },
    buildArgs: earlyB1FArgs
  }),
  "fixed-combat-composition": freezeDefinition({
    id: "fixed-combat-composition",
    label: "Fixed combat composition diagnostic",
    runner: "scratch/measurements/fixed_combat_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1151, startingKit: "vanguard" },
    allowed: { startingKit: ["vanguard", "scout", "devotion", "arcana"] },
    buildArgs: fixedCombatArgs
  }),
  "equipment-load": freezeDefinition({
    id: "equipment-load",
    label: "Equipment-load measurement",
    runner: "scratch/measurements/equipment_load_measurement.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1170 },
    buildArgs: equipmentLoadArgs
  }),
  "run-difficulty": freezeDefinition({
    id: "run-difficulty",
    label: "Run difficulty measurement",
    runner: "scratch/measurements/measure_run_difficulty.js",
    adapter: "native-manifest",
    defaultRunType: "baseline-candidate",
    allowedRunTypes: ["baseline-candidate", "diagnostic", "temporary"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    buildArgs: runDifficultyArgs
  }),
  "run-difficulty-policy-sensitivity": freezeDefinition({
    id: "run-difficulty-policy-sensitivity",
    label: "Run difficulty policy sensitivity",
    runner: "scratch/measurements/measure_run_difficulty.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, policies: "p0,p1,p2" },
    buildArgs: runDifficultyArgs
  }),
  "early-run-attrition": freezeDefinition({
    id: "early-run-attrition",
    label: "Early run attrition trajectory",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "portal-policy" },
    buildArgs: earlyAttritionArgs
  }),
  "b2-chest-trap": freezeDefinition({
    id: "b2-chest-trap",
    label: "B2 chest-trap suppression diagnostic",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "b2-chest-trap" },
    allowed: { treatment: ["b2-chest-trap"] },
    buildArgs: earlyAttritionArgs
  }),
  "survival-policy": freezeDefinition({
    id: "survival-policy",
    label: "Survival policy comparison",
    runner: "scratch/measurements/measure_survival_policy_comparison.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    buildArgs: survivalPolicyArgs
  })
});

export const MEASUREMENT_IDS = Object.freeze(Object.keys(MEASUREMENT_REGISTRY));

function nonEmpty(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function positiveInteger(value, fallback, minimum, label) {
  const resolved = value === undefined || String(value).trim() === "" ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value ?? resolved}`);
  }
  return resolved;
}

function assertAllowed(value, allowed, label) {
  if (allowed && !allowed.includes(value)) {
    throw new Error(`${label} must be ${allowed.join("|")}: ${value}`);
  }
  return value;
}

export function getMeasurementDefinition(measurementId) {
  const definition = MEASUREMENT_REGISTRY[measurementId];
  if (!definition) {
    throw new Error(`unknown measurement ID: ${measurementId}; expected ${MEASUREMENT_IDS.join(", ")}`);
  }
  return definition;
}

export function resolveMeasurementOptions(input = {}) {
  const definition = getMeasurementDefinition(input.measurement);
  const defaults = definition.defaults;
  const options = {
    measurement: definition.id,
    ref: nonEmpty(input.ref, DEFAULT_REF),
    purpose: nonEmpty(input.purpose, ""),
    runType: nonEmpty(input.run_type, definition.defaultRunType),
    runs: positiveInteger(input.runs, defaults.runs, defaults.minimumRuns, "runs"),
    seed: positiveInteger(input.seed, defaults.seed, 1, "seed"),
    treatment: nonEmpty(input.treatment, defaults.treatment),
    calibrationRuns: positiveInteger(input.calibration_runs, defaults.calibrationRuns ?? 1, 1, "calibration-runs"),
    startingKit: nonEmpty(input.starting_kit, defaults.startingKit),
    policy: nonEmpty(input.policy, defaults.policy),
    fleeHpThreshold: input.flee_hp_threshold === undefined || String(input.flee_hp_threshold).trim() === ""
      ? (defaults.fleeHpThreshold ?? 0.20)
      : Number(input.flee_hp_threshold),
    selectionRuns: positiveInteger(input.selection_runs, defaults.selectionRuns ?? 1, defaults.minimumSelectionRuns ?? 1, "selection-runs"),
    selectionSeed: positiveInteger(input.selection_seed, defaults.selectionSeed ?? 1, 1, "selection-seed"),
    fixedRuns: positiveInteger(input.fixed_runs, defaults.fixedRuns ?? 1, defaults.minimumFixedRuns ?? 1, "fixed-runs"),
    fixedSeed: positiveInteger(input.fixed_seed, defaults.fixedSeed ?? 1, 1, "fixed-seed"),
    policies: nonEmpty(input.policies, defaults.policies)
  };
  if (!options.purpose) throw new Error("purpose is required");
  if (!definition.allowedRunTypes.includes(options.runType)) {
    throw new Error(
      `run_type for ${definition.id} must be ${definition.allowedRunTypes.join("|")}: ${options.runType}`
    );
  }
  if (!Number.isFinite(options.fleeHpThreshold) || options.fleeHpThreshold < 0 || options.fleeHpThreshold > 1) {
    throw new Error(`flee-hp-threshold must be a number between 0 and 1: ${options.fleeHpThreshold}`);
  }
  assertAllowed(options.startingKit, definition.allowed.startingKit, "starting-kit");
  assertAllowed(options.policy, definition.allowed.policy, "policy");
  assertAllowed(options.treatment, definition.allowed.treatment, "treatment");
  return Object.freeze(options);
}

export function createMeasurementOutputPaths(outputDirectory = DEFAULT_OUTPUT_DIRECTORY) {
  const root = resolve(outputDirectory);
  return Object.freeze({
    root,
    measurement: join(root, "measurement.json"),
    summary: join(root, "measurement.md"),
    manifest: join(root, "manifest.json")
  });
}

export function createMeasurementArtifactName(measurementId, runId = "local") {
  const definition = getMeasurementDefinition(measurementId);
  const normalizedRunId = nonEmpty(runId, "local").replace(/[^A-Za-z0-9_.-]/g, "-");
  return `${definition.artifactPrefix}-${definition.id}-${normalizedRunId}`;
}

export function resolveRunnerInvocation(input, outputDirectory = DEFAULT_OUTPUT_DIRECTORY) {
  const options = resolveMeasurementOptions(input);
  const definition = getMeasurementDefinition(options.measurement);
  const output = createMeasurementOutputPaths(outputDirectory);
  return Object.freeze({
    measurement: definition.id,
    runner: definition.runner,
    adapter: definition.adapter,
    args: Object.freeze(definition.buildArgs({ options, output })),
    output,
    options
  });
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function commonManifestFields({ invocation, runId, runnerManifest, report }) {
  const source = report?.measurement || runnerManifest?.source || null;
  const runnerVersion = report?.runnerVersion || source?.runnerVersion || source?.profile || runnerManifest?.runner || null;
  return {
    measurementId: invocation.measurement,
    runner: runnerVersion,
    runType: invocation.options.runType,
    purpose: invocation.options.purpose,
    requestedRef: invocation.options.ref,
    artifact: {
      name: createMeasurementArtifactName(invocation.measurement, runId),
      files: ["measurement.json", "measurement.md", "manifest.json"],
      retentionDays: getMeasurementDefinition(invocation.measurement).retentionDays
    },
    router: {
      version: BALANCE_MEASUREMENT_ENTRY_VERSION,
      path: "scratch/measurements/run_balance_measurement.js",
      adapter: invocation.adapter
    },
    routerProvenance: source ? {
      sourceSha: source.sourceCommit || null,
      gameplaySourceSha: source.gameplaySourceCommit || source.productionBaselineSha || null,
      measurementRunnerSha: source.measurementRunnerCommit || source.simulatorRunnerCommit || null,
      measurementRunnerVersion: runnerVersion,
      originMainAncestry: source.originMainAncestor ?? null,
      staleTree: source.staleTreeAllowed ?? null,
      workingTreeClean: source.workingTreeClean ?? null,
      environmentSignature: source.environmentHash || source.environmentSignature || null,
      seed: invocation.options.seed,
      runs: invocation.options.runs
    } : {
      seed: invocation.options.seed,
      runs: invocation.options.runs
    }
  };
}

export function enrichManifest({ invocation, runId = "local", runnerManifest = {}, report = null, status = "success" }) {
  return {
    ...runnerManifest,
    ...commonManifestFields({ invocation, runId, runnerManifest, report }),
    status: status === "failure" ? "failure" : (runnerManifest.status || status)
  };
}

function writeManifest(invocation, runId, status) {
  const report = readJson(invocation.output.measurement);
  const nativeManifest = invocation.adapter === "standard-manifest"
    ? createMeasurementManifest({
      measurementReport: report,
      measurementReadError: report ? null : "measurement report was not created",
      purpose: invocation.options.purpose,
      runType: invocation.options.runType,
      workflowRunId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || runId,
      workflowRunUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || "",
      repository: process.env.MEASUREMENT_REPOSITORY || "",
      requestedRef: invocation.options.ref,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || "",
      measuredAt: process.env.MEASUREMENT_AT || "",
      measurementStepOutcome: status
    })
    : readJson(invocation.output.manifest) || {};
  const manifest = enrichManifest({
    invocation,
    runId,
    runnerManifest: nativeManifest,
    report,
    status
  });
  fs.mkdirSync(dirname(invocation.output.manifest), { recursive: true });
  fs.writeFileSync(invocation.output.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  if (invocation.adapter === "standard-manifest") {
    fs.writeFileSync(invocation.output.summary.replace(/measurement\.md$/, "manifest.md"), renderMeasurementManifestMarkdown(manifest));
  }
}

export function runBalanceMeasurement(input = {}) {
  const invocation = resolveRunnerInvocation(input, input.output_dir || DEFAULT_OUTPUT_DIRECTORY);
  const runId = nonEmpty(input.run_id, process.env.MEASUREMENT_WORKFLOW_RUN_ID || "local");
  fs.mkdirSync(invocation.output.root, { recursive: true });
  const environment = {
    ...process.env,
    MEASUREMENT_REQUESTED_REF: invocation.options.ref,
    MEASUREMENT_PURPOSE: invocation.options.purpose,
    MEASUREMENT_RUN_TYPE: invocation.options.runType
  };
  const child = spawnSync(process.execPath, [invocation.runner, ...invocation.args], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    stdio: "inherit"
  });
  if (child.error) throw child.error;
  const status = child.status === 0 ? "success" : "failure";
  writeManifest(invocation, runId, status);
  return child.status ?? 1;
}

function parseArgs(argv) {
  const options = {};
  const valueOptions = new Set([
    "measurement", "ref", "runs", "seed", "purpose", "run_type", "output_dir", "run_id",
    "calibration_runs", "starting_kit", "policy", "treatment", "flee_hp_threshold", "selection_runs",
    "selection_seed", "fixed_runs", "fixed_seed", "policies"
  ]);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log("Usage: node scratch/measurements/run_balance_measurement.js --measurement <id> --purpose <text> [--runs N] [--seed N] [--ref main]");
      process.exit(0);
    }
    if (!argument.startsWith("--")) throw new Error(`unknown argument: ${argument}`);
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    if (!valueOptions.has(key)) throw new Error(`unknown argument: --${key}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const exitCode = runBalanceMeasurement(parseArgs(process.argv.slice(2)));
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
