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
import { STANDARD_BALANCE_CONFIG } from "./balance_measurement.js";

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

const STANDARD_BALANCE_DEFAULTS = Object.freeze({
  runs: STANDARD_BALANCE_CONFIG.runs,
  minimumRuns: STANDARD_BALANCE_CONFIG.runs,
  seed: STANDARD_BALANCE_CONFIG.seed,
  calibrationRuns: STANDARD_BALANCE_CONFIG.calibrationRuns
});

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

const nativeMeasurementArgs = ({
  options,
  output,
  beforeRef = [],
  afterRef = [],
  afterRuns = [],
  afterSeed = [],
  outputNames = ["output", "summary", "manifest"]
}) => [
  ...beforeRef,
  "--ref", options.ref,
  ...afterRef,
  "--runs", String(options.runs),
  ...afterRuns,
  "--seed", String(options.seed),
  ...afterSeed,
  "--purpose", options.purpose,
  ...outputArgs(output, outputNames)
];

const startingKitArgs = ({ options, output }) => nativeMeasurementArgs({
  options,
  output,
  afterRef: ["--starting-kit", options.startingKit],
  afterSeed: [
    "--policy", options.policy,
    "--flee-hp-threshold", String(options.fleeHpThreshold)
  ]
});

const earlyB1FArgs = ({ options, output }) => nativeMeasurementArgs({
  options,
  output,
  afterRuns: [
    "--selection-runs", String(options.selectionRuns),
    "--fixed-runs", String(options.fixedRuns)
  ],
  afterSeed: [
    "--selection-seed", String(options.selectionSeed),
    "--fixed-seed", String(options.fixedSeed)
  ]
});

const fixedCombatArgs = ({ options, output }) => nativeMeasurementArgs({
  options,
  output,
  afterSeed: ["--starting-kit", options.startingKit]
});

const milestoneBossArgs = ({ options, output, profile }) => [
  ...nativeMeasurementArgs({ options, output }),
  ...(profile.floor ? ["--floor", String(profile.floor)] : []),
  ...(profile.profile ? ["--profile", profile.profile] : [])
];

const equipmentVNextCombatArgs = nativeMeasurementArgs;
const depthScalingArgs = nativeMeasurementArgs;
const traitScalingArgs = ({ options, output, profile }) => nativeMeasurementArgs({
  options,
  output,
  beforeRef: profile.mode ? ["--mode", profile.mode] : []
});

const equipmentLoadArgs = ({ options, output }) => [
  "--runs", String(options.runs),
  "--seed", String(options.seed),
  ...outputArgs(output, ["output", "summary"])
];

const runDifficultyArgs = ({ options, output }) => nativeMeasurementArgs({
  options,
  output,
  afterSeed: options.policies ? ["--policies", options.policies] : []
});

const earlyRunArgs = ({ options, output, profile }) => nativeMeasurementArgs({
  options,
  output,
  beforeRef: ["--measurement", profile.measurement],
  afterRef: ["--treatment", options.treatment]
});

const survivalPolicyArgs = nativeMeasurementArgs;
const preparationPowerArgs = nativeMeasurementArgs;
const firstBandArgs = ({ options, output, profile }) => nativeMeasurementArgs({
  options,
  output,
  beforeRef: profile.mode ? ["--mode", profile.mode] : []
});

const ALL_RUN_TYPES = Object.freeze([...MEASUREMENT_RUN_TYPES]);
const DIAGNOSTIC_ONLY_RUN_TYPES = Object.freeze(["diagnostic"]);

function freezeFamily(family) {
  return Object.freeze({
    ...family,
    allowedRunTypes: Object.freeze([...(family.allowedRunTypes || MEASUREMENT_RUN_TYPES)])
  });
}

export const MEASUREMENT_FAMILIES = Object.freeze({
  standard: freezeFamily({
    runner: "scratch/measurements/measure_balance.js",
    adapter: "standard-manifest",
    defaultRunType: "baseline-candidate",
    allowedRunTypes: ALL_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: standardArgs
  }),
  "starting-kit": freezeFamily({
    runner: "scratch/measurements/starting_kit_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: startingKitArgs
  }),
  "early-b1f-composition": freezeFamily({
    runner: "scratch/measurements/early_b1f_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: earlyB1FArgs
  }),
  "fixed-combat-composition": freezeFamily({
    runner: "scratch/measurements/fixed_combat_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: fixedCombatArgs
  }),
  "equipment-vnext-combat": freezeFamily({
    runner: "scratch/measurements/equipment_vnext_combat_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: equipmentVNextCombatArgs
  }),
  "depth-scaling": freezeFamily({
    runner: "scratch/measurements/depth_scaling_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: depthScalingArgs
  }),
  "trait-scaling": freezeFamily({
    runner: "scratch/measurements/trait_scaling_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: traitScalingArgs
  }),
  "composition-trait": freezeFamily({
    runner: "scratch/measurements/composition_trait_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: nativeMeasurementArgs
  }),
  "milestone-boss": freezeFamily({
    runner: "scratch/measurements/milestone_boss_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: milestoneBossArgs
  }),
  "equipment-load": freezeFamily({
    runner: "scratch/measurements/equipment_load_measurement.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: equipmentLoadArgs
  }),
  "run-difficulty": freezeFamily({
    runner: "scratch/measurements/measure_run_difficulty.js",
    adapter: "native-manifest",
    defaultRunType: profile => profile.runTypePolicy === "diagnostic" ? "diagnostic" : "baseline-candidate",
    allowedRunTypes: ALL_RUN_TYPES,
    resolveAllowedRunTypes: profile => profile.runTypePolicy === "diagnostic" ? DIAGNOSTIC_ONLY_RUN_TYPES : ALL_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: runDifficultyArgs
  }),
  "early-run": freezeFamily({
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: earlyRunArgs
  }),
  "survival-policy": freezeFamily({
    runner: "scratch/measurements/measure_survival_policy_comparison.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: survivalPolicyArgs
  }),
  "preparation-power": freezeFamily({
    runner: "scratch/measurements/preparation_power_factorial.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: preparationPowerArgs
  }),
  "first-band": freezeFamily({
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: DIAGNOSTIC_ONLY_RUN_TYPES,
    artifactPrefix: "balance-measurement",
    retentionDays: 14,
    buildArgs: firstBandArgs
  })
});

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    defaults: Object.freeze({ ...profile.defaults }),
    allowed: Object.freeze({
      ...(profile.allowed || {})
    })
  });
}

const PROFILE_LIST = [
  {
    id: "standard",
    label: "Standard statistical balance",
    family: "standard",
    defaults: STANDARD_BALANCE_DEFAULTS
  },
  {
    id: "starting-kit-early-run",
    label: "Starting-kit early-run diagnostic",
    family: "starting-kit",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1139, startingKit: "vanguard", policy: "fight", fleeHpThreshold: 0.20 },
    allowed: {
      startingKit: ["vanguard", "scout", "devotion", "arcana"],
      policy: ["fight", "flee-threshold", "visible-multi-enemy-flee"]
    }
  },
  {
    id: "early-b1f-composition",
    label: "Early B1F composition diagnostic",
    family: "early-b1f-composition",
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
    }
  },
  {
    id: "fixed-combat-composition",
    label: "Fixed combat composition diagnostic",
    family: "fixed-combat-composition",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1151, startingKit: "vanguard" },
    allowed: { startingKit: ["vanguard", "scout", "devotion", "arcana"] }
  },
  {
    id: "equipment-vnext-combat-diagnostic",
    label: "Equipment vNext combat / Guard / load diagnostic",
    family: "equipment-vnext-combat",
    defaults: { runs: 200, minimumRuns: 200, seed: 1544 }
  },
  {
    id: "depth-scaling-diagnostic",
    label: "Generic enemy depth scaling diagnostic",
    family: "depth-scaling",
    defaults: { runs: 200, minimumRuns: 200, seed: 1582 }
  },
  {
    id: "trait-scaling-diagnostic",
    label: "Phase 2a single-enemy trait scaling diagnostic",
    family: "trait-scaling",
    defaults: { runs: 200, minimumRuns: 200, seed: 1586 }
  },
  {
    id: "reflect-physical-diagnostic",
    label: "reflectPhysical rate diagnostic",
    family: "trait-scaling",
    mode: "reflect-physical",
    defaults: { runs: 200, minimumRuns: 200, seed: 1594 }
  },
  {
    id: "composition-trait-diagnostic",
    label: "Phase 2c composition trait diagnostic",
    family: "composition-trait",
    defaults: { runs: 200, minimumRuns: 200, seed: 1599 }
  },
  {
    id: "milestone-boss-diagnostic",
    label: "Phase 2d milestone Boss decision-pressure diagnostic",
    family: "milestone-boss",
    defaults: { runs: 200, minimumRuns: 200, seed: 1613 }
  },
  {
    id: "b30-atk-pressure-diagnostic",
    label: "B30 generic ATK scaling diagnostic",
    family: "milestone-boss",
    floor: 30,
    defaults: { runs: 200, minimumRuns: 200, seed: 1613 }
  },
  {
    id: "b30-production-hp-wall-diagnostic",
    label: "B30 production scaling HP wall diagnostic",
    family: "milestone-boss",
    floor: 30,
    profile: "production-hp-wall",
    defaults: { runs: 200, minimumRuns: 200, seed: 1613 }
  },
  {
    id: "equipment-load",
    label: "Equipment-load measurement",
    family: "equipment-load",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1170 }
  },
  {
    id: "run-difficulty",
    label: "Run difficulty measurement",
    family: "run-difficulty",
    runTypePolicy: "baseline",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 }
  },
  {
    id: "run-difficulty-policy-sensitivity",
    label: "Run difficulty policy sensitivity",
    family: "run-difficulty",
    runTypePolicy: "diagnostic",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, policies: "p0,p1,p2" }
  },
  {
    id: "early-run-attrition",
    label: "Early run attrition trajectory",
    family: "early-run",
    measurement: "early-run-attrition",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "portal-policy" }
  },
  {
    id: "b3plus-survival-decomposition",
    label: "B3-B5 survival decomposition",
    family: "early-run",
    measurement: "b3plus-survival-decomposition",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "b3plus-survival-decomposition" },
    allowed: { treatment: ["b3plus-survival-decomposition"] }
  },
  {
    id: "build-progression-audit",
    label: "B1-B5 Build progression audit",
    family: "early-run",
    measurement: "build-progression-audit",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "portal-policy" }
  },
  {
    id: "build-progression-pareto-safe",
    label: "Pareto-safe equipment policy diagnostic",
    family: "early-run",
    measurement: "build-progression-pareto-safe",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "equipment-pareto-safe" },
    allowed: { treatment: ["equipment-pareto-safe"] }
  },
  {
    id: "b2-chest-trap",
    label: "B2 chest-trap suppression diagnostic",
    family: "early-run",
    measurement: "b2-chest-trap",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "b2-chest-trap" },
    allowed: { treatment: ["b2-chest-trap"] }
  },
  {
    id: "survival-policy",
    label: "Survival policy comparison",
    family: "survival-policy",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 }
  },
  {
    id: "preparation-power-factorial",
    label: "Preparation power 2x2 factorial diagnostic",
    family: "preparation-power",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 }
  },
  {
    id: "first-band-build-formation",
    label: "First Band Build Formation diagnostic",
    family: "first-band",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 }
  },
  {
    id: "first-band-b5-wall-diagnostic",
    label: "First Band B5 wall diagnostic",
    family: "first-band",
    mode: "b5-wall-diagnostic",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  },
  {
    id: "first-band-b5-guardian-retry-diagnostic",
    label: "First Band B5 Guardian fracture checkpoint diagnostic",
    family: "first-band",
    mode: "b5-guardian-retry-diagnostic",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  },
  {
    id: "first-band-b5-guardian-flee-ev-diagnostic",
    label: "First Band B5 Guardian flee EV diagnostic",
    family: "first-band",
    mode: "b5-guardian-flee-ev-diagnostic",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  },
  {
    id: "first-band-arcana-weapon-diagnostic",
    label: "First Band Arcana weapon diagnostic",
    family: "first-band",
    mode: "arcana-weapon-diagnostic",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  },
  {
    id: "first-band-arcana-mp-supply-diagnostic",
    label: "First Band Arcana MP supply diagnostic",
    family: "first-band",
    mode: "arcana-mp-supply-diagnostic",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  },
  {
    id: "first-band-transition-recovery",
    label: "First Band transition recovery diagnostic",
    family: "first-band",
    mode: "transition-recovery",
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 }
  },
  {
    id: "first-band-levelup-recovery",
    label: "First Band level-up recovery diagnostic",
    family: "first-band",
    mode: "levelup-recovery",
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 }
  }
].map(freezeProfile);

export const MEASUREMENT_PROFILES = Object.freeze(Object.fromEntries(
  PROFILE_LIST.map(profile => [profile.id, profile])
));

function resolveFamilySetting(setting, profile) {
  return typeof setting === "function" ? setting(profile) : setting;
}

export function getMeasurementFamily(familyId) {
  const family = MEASUREMENT_FAMILIES[familyId];
  if (!family) throw new Error(`unknown measurement family: ${familyId}`);
  return family;
}

function createMeasurementDefinition(profile) {
  const family = getMeasurementFamily(profile.family);
  return freezeDefinition({
    ...profile,
    runner: family.runner,
    adapter: family.adapter,
    defaultRunType: resolveFamilySetting(family.defaultRunType, profile),
    allowedRunTypes: family.resolveAllowedRunTypes
      ? family.resolveAllowedRunTypes(profile)
      : family.allowedRunTypes,
    artifactPrefix: family.artifactPrefix,
    retentionDays: family.retentionDays,
    buildArgs: family.buildArgs
  });
}

export const MEASUREMENT_REGISTRY = Object.freeze(Object.fromEntries(
  PROFILE_LIST.map(profile => [profile.id, createMeasurementDefinition(profile)])
));

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
  const normalizedMeasurementId = nonEmpty(measurementId, "");
  const definition = MEASUREMENT_REGISTRY[normalizedMeasurementId];
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
    args: Object.freeze(definition.buildArgs({ options, output, profile: definition })),
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

export function createRunnerProcessInvocation(invocation) {
  return Object.freeze({
    executable: process.execPath,
    args: Object.freeze(["--import", "tsx/esm", invocation.runner, ...invocation.args])
  });
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
  const childInvocation = createRunnerProcessInvocation(invocation);
  const child = spawnSync(childInvocation.executable, childInvocation.args, {
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
