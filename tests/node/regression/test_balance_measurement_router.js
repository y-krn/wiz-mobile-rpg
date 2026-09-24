import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { STANDARD_BALANCE_CONFIG } from "../../../scratch/measurements/balance_measurement.js";
import {
  BALANCE_MEASUREMENT_ENTRY_VERSION,
  MEASUREMENT_FAMILIES,
  MEASUREMENT_IDS,
  MEASUREMENT_PROFILES,
  MEASUREMENT_REGISTRY,
  createMeasurementArtifactName,
  createMeasurementOutputPaths,
  createRunnerProcessInvocation,
  enrichManifest,
  getMeasurementDefinition,
  getMeasurementFamily,
  resolveMeasurementOptions,
  resolveRunnerInvocation
} from "../../../scratch/measurements/run_balance_measurement.js";

const OUTPUT_DIRECTORY = "/tmp/router-test";
const OUTPUT_PATHS = [
  "--output", `${OUTPUT_DIRECTORY}/measurement.json`,
  "--summary", `${OUTPUT_DIRECTORY}/measurement.md`,
  "--manifest", `${OUTPUT_DIRECTORY}/manifest.json`
];
const STANDARD_OUTPUT_PATHS = OUTPUT_PATHS.slice(0, 4);
const nativeArgs = (...args) => [...args, "--purpose", "smoke", ...OUTPUT_PATHS];

const smokeChild = createRunnerProcessInvocation({
  runner: "tests/node/fixtures/typescript/tsx_root.js",
  args: []
});
assert.equal(smokeChild.executable, process.execPath);
assert.deepEqual(smokeChild.args, ["--import", "tsx/esm", "tests/node/fixtures/typescript/tsx_root.js"]);
const smokeResult = spawnSync(smokeChild.executable, smokeChild.args, {
  cwd: process.cwd(),
  encoding: "utf8"
});
assert.equal(smokeResult.status, 0, `${smokeResult.stdout}\n${smokeResult.stderr}`);

const ROUTER_CONTRACTS = [
  {
    id: "standard",
    runner: "scratch/measurements/measure_balance.js",
    adapter: "standard-manifest",
    defaultRunType: "baseline-candidate",
    allowedRunTypes: ["baseline-candidate", "diagnostic", "temporary"],
    defaults: { runs: 500, minimumRuns: 500, seed: 843, calibrationRuns: 100 },
    args: ["--runs", "500", "--seed", "843", "--calibration-runs", "100", ...STANDARD_OUTPUT_PATHS],
    override: { input: { runs: 501, seed: 844, calibration_runs: 101 }, expected: { runs: 501, seed: 844, calibrationRuns: 101 } }
  },
  {
    id: "starting-kit-early-run",
    runner: "scratch/measurements/starting_kit_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1139, startingKit: "vanguard", policy: "fight", fleeHpThreshold: 0.20 },
    args: nativeArgs("--ref", "main", "--starting-kit", "vanguard", "--runs", "1000", "--seed", "1139", "--policy", "fight", "--flee-hp-threshold", "0.2"),
    override: { input: { seed: 1140, starting_kit: "scout", policy: "flee-threshold", flee_hp_threshold: "0.3" }, expected: { seed: 1140, startingKit: "scout", policy: "flee-threshold", fleeHpThreshold: 0.3 } }
  },
  {
    id: "early-b1f-composition",
    runner: "scratch/measurements/early_b1f_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 2192, selectionRuns: 5000, minimumSelectionRuns: 5000, selectionSeed: 1192, fixedRuns: 1000, minimumFixedRuns: 1000, fixedSeed: 1151 },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--selection-runs", "5000", "--fixed-runs", "1000", "--seed", "2192", "--selection-seed", "1192", "--fixed-seed", "1151"),
    override: { input: { selection_runs: 5001, selection_seed: 1193 }, expected: { selectionRuns: 5001, selectionSeed: 1193 } }
  },
  {
    id: "fixed-combat-composition",
    runner: "scratch/measurements/fixed_combat_composition_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1151, startingKit: "vanguard" },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1151", "--starting-kit", "vanguard"),
    override: { input: { seed: 1152, starting_kit: "scout" }, expected: { seed: 1152, startingKit: "scout" } }
  },
  {
    id: "progression-enemy-candidate-diagnostic",
    runner: "scratch/measurements/progression_enemy_candidate_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1700 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1700"),
    override: { input: { runs: 300, seed: 1689 }, expected: { runs: 300, seed: 1689 } }
  },
  {
    id: "progression-enemy-defense-diagnostic",
    runner: "scratch/measurements/progression_enemy_defense_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1694 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1694"),
    override: { input: { runs: 201, seed: 1691 }, expected: { runs: 201, seed: 1691 } }
  },
  {
    id: "progression-enemy-hp-buffer-diagnostic",
    runner: "scratch/measurements/progression_enemy_hp_buffer_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1696 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1696"),
    override: { input: { runs: 201, seed: 1697 }, expected: { runs: 201, seed: 1697 } }
  },
  {
    id: "progression-enemy-guard-policy-diagnostic",
    runner: "scratch/measurements/progression_enemy_guard_policy_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1698 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1698"),
    override: { input: { runs: 201, seed: 1699 }, expected: { runs: 201, seed: 1699 } }
  },
  {
    id: "progression-exp-award-inventory",
    runner: "scratch/measurements/progression_exp_award_inventory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1703 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1703"),
    override: { input: { runs: 201, seed: 1704 }, expected: { runs: 201, seed: 1704 } }
  },
  {
    id: "progression-exp-award-paired-inventory",
    runner: "scratch/measurements/progression_exp_award_paired_inventory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1703 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1703"),
    override: { input: { runs: 201, seed: 1704 }, expected: { runs: 201, seed: 1704 } }
  },
  {
    id: "equipment-vnext-combat-diagnostic",
    runner: "scratch/measurements/equipment_vnext_combat_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1544 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1544"),
    override: { input: { runs: 201, seed: 1545 }, expected: { runs: 201, seed: 1545 } }
  },
  {
    id: "depth-scaling-diagnostic",
    runner: "scratch/measurements/depth_scaling_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1582 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1582"),
    override: { input: { runs: 201, seed: 1583 }, expected: { runs: 201, seed: 1583 } }
  },
  {
    id: "trait-scaling-diagnostic",
    runner: "scratch/measurements/trait_scaling_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1586 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1586"),
    override: { input: { runs: 201, seed: 1587 }, expected: { runs: 201, seed: 1587 } }
  },
  {
    id: "reflect-physical-diagnostic",
    runner: "scratch/measurements/trait_scaling_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1594 },
    args: nativeArgs("--mode", "reflect-physical", "--ref", "main", "--runs", "200", "--seed", "1594"),
    override: { input: { runs: 201, seed: 1595 }, expected: { runs: 201, seed: 1595 } }
  },
  {
    id: "composition-trait-diagnostic",
    runner: "scratch/measurements/composition_trait_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1599 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1599"),
    override: { input: { runs: 201, seed: 1600 }, expected: { runs: 201, seed: 1600 } }
  },
  {
    id: "milestone-boss-diagnostic",
    runner: "scratch/measurements/milestone_boss_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1613 },
    args: nativeArgs("--ref", "main", "--runs", "200", "--seed", "1613"),
    override: { input: { runs: 201, seed: 1614 }, expected: { runs: 201, seed: 1614 } }
  },
  {
    id: "b30-atk-pressure-diagnostic",
    runner: "scratch/measurements/milestone_boss_diagnostic.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 200, minimumRuns: 200, seed: 1613 },
    args: [...nativeArgs("--ref", "main", "--runs", "200", "--seed", "1613"), "--floor", "30"],
    override: { input: { runs: 201, seed: 1614 }, expected: { runs: 201, seed: 1614 } }
  },
  {
    id: "equipment-load",
    runner: "scratch/measurements/equipment_load_measurement.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1170 },
    args: ["--runs", "1000", "--seed", "1170", ...STANDARD_OUTPUT_PATHS],
    override: { input: { runs: 1001, seed: 1171 }, expected: { runs: 1001, seed: 1171 } }
  },
  {
    id: "run-difficulty",
    runner: "scratch/measurements/measure_run_difficulty.js",
    adapter: "native-manifest",
    defaultRunType: "baseline-candidate",
    allowedRunTypes: ["baseline-candidate", "diagnostic", "temporary"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "run-difficulty-policy-sensitivity",
    runner: "scratch/measurements/measure_run_difficulty.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, policies: "p0,p1,p2" },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1277", "--policies", "p0,p1,p2"),
    override: { input: { policies: "p0" }, expected: { policies: "p0" } }
  },
  {
    id: "early-run-attrition",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "portal-policy" },
    args: nativeArgs("--measurement", "early-run-attrition", "--ref", "main", "--treatment", "portal-policy", "--runs", "1000", "--seed", "1277"),
    override: { input: { treatment: "custom" }, expected: { treatment: "custom" } }
  },
  {
    id: "b3plus-survival-decomposition",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "b3plus-survival-decomposition" },
    args: nativeArgs("--measurement", "b3plus-survival-decomposition", "--ref", "main", "--treatment", "b3plus-survival-decomposition", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "build-progression-audit",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "portal-policy" },
    args: nativeArgs("--measurement", "build-progression-audit", "--ref", "main", "--treatment", "portal-policy", "--runs", "1000", "--seed", "1277"),
    override: { input: { treatment: "custom" }, expected: { treatment: "custom" } }
  },
  {
    id: "build-progression-pareto-safe",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "equipment-pareto-safe" },
    args: nativeArgs("--measurement", "build-progression-pareto-safe", "--ref", "main", "--treatment", "equipment-pareto-safe", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "b2-chest-trap",
    runner: "scratch/measurements/measure_early_run_attrition_trajectory.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277, treatment: "b2-chest-trap" },
    args: nativeArgs("--measurement", "b2-chest-trap", "--ref", "main", "--treatment", "b2-chest-trap", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "survival-policy",
    runner: "scratch/measurements/measure_survival_policy_comparison.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "preparation-power-factorial",
    runner: "scratch/measurements/preparation_power_factorial.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "first-band-build-formation",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    args: nativeArgs("--ref", "main", "--runs", "1000", "--seed", "1277"),
    override: { input: { runs: 1001, seed: 1278 }, expected: { runs: 1001, seed: 1278 } }
  },
  {
    id: "first-band-b5-wall-diagnostic",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "b5-wall-diagnostic", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { runs: 501, seed: 1278 }, expected: { runs: 501, seed: 1278 } }
  },
  {
    id: "first-band-b5-guardian-retry-diagnostic",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "b5-guardian-retry-diagnostic", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { runs: 501, seed: 1278 }, expected: { runs: 501, seed: 1278 } }
  },
  {
    id: "first-band-b5-guardian-flee-ev-diagnostic",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "b5-guardian-flee-ev-diagnostic", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { runs: 501, seed: 1278 }, expected: { runs: 501, seed: 1278 } }
  },
  {
    id: "first-band-arcana-weapon-diagnostic",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "arcana-weapon-diagnostic", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "first-band-arcana-mp-supply-diagnostic",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "arcana-mp-supply-diagnostic", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  },
  {
    id: "first-band-transition-recovery",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 1000, minimumRuns: 1000, seed: 1277 },
    args: nativeArgs("--mode", "transition-recovery", "--ref", "main", "--runs", "1000", "--seed", "1277"),
    override: { input: { runs: 1001, seed: 1278 }, expected: { runs: 1001, seed: 1278 } }
  },
  {
    id: "first-band-levelup-recovery",
    runner: "scratch/measurements/first_band_build_formation.js",
    adapter: "native-manifest",
    defaultRunType: "diagnostic",
    allowedRunTypes: ["diagnostic"],
    defaults: { runs: 500, minimumRuns: 500, seed: 1277 },
    args: nativeArgs("--mode", "levelup-recovery", "--ref", "main", "--runs", "500", "--seed", "1277"),
    override: { input: { seed: 1278 }, expected: { seed: 1278 } }
  }
];

assert.deepEqual(MEASUREMENT_IDS, ROUTER_CONTRACTS.map(contract => contract.id));
assert.equal(Object.keys(MEASUREMENT_REGISTRY).length, ROUTER_CONTRACTS.length);
assert.deepEqual(Object.keys(MEASUREMENT_PROFILES), MEASUREMENT_IDS);
assert.deepEqual(Object.keys(MEASUREMENT_FAMILIES), [
  "standard",
  "starting-kit",
  "early-b1f-composition",
  "fixed-combat-composition",
  "progression-enemy-candidate",
  "progression-enemy-defensive-baseline",
  "progression-enemy-hp-buffer",
  "progression-enemy-guard-policy",
  "progression-exp-award-inventory",
  "progression-exp-award-paired-inventory",
  "equipment-vnext-combat",
  "depth-scaling",
  "trait-scaling",
  "composition-trait",
  "milestone-boss",
  "equipment-load",
  "run-difficulty",
  "early-run",
  "survival-policy",
  "preparation-power",
  "first-band"
]);
for (const profile of Object.values(MEASUREMENT_PROFILES)) {
  assert.equal(profile.runner, undefined, `${profile.id} profile must not own runner`);
  assert.equal(profile.buildArgs, undefined, `${profile.id} profile must not own buildArgs`);
  assert.ok(MEASUREMENT_FAMILIES[profile.family], `${profile.id} must reference a known family`);
}
for (const [familyId, family] of Object.entries(MEASUREMENT_FAMILIES)) {
  const familyProfiles = Object.values(MEASUREMENT_PROFILES).filter(profile => profile.family === familyId);
  assert.ok(familyProfiles.length > 0, `${familyId} must own at least one profile`);
  assert.equal(typeof family.buildArgs, "function", `${familyId} must own one args builder`);
  assert.equal(new Set(familyProfiles.map(profile => MEASUREMENT_REGISTRY[profile.id].runner)).size, 1);
  assert.equal(new Set(familyProfiles.map(profile => MEASUREMENT_REGISTRY[profile.id].buildArgs)).size, 1);
  assert.equal(MEASUREMENT_REGISTRY[familyProfiles[0].id].buildArgs, family.buildArgs);
}
assert.equal(Object.values(MEASUREMENT_PROFILES).filter(profile => profile.family === "run-difficulty").length, 2);
assert.equal(Object.values(MEASUREMENT_PROFILES).filter(profile => profile.family === "early-run").length, 5);
assert.equal(Object.values(MEASUREMENT_PROFILES).filter(profile => profile.family === "first-band").length, 8);
assert.throws(() => getMeasurementFamily("unknown-family"), /unknown measurement family/);
assert.equal(MEASUREMENT_REGISTRY.standard.defaults.runs, STANDARD_BALANCE_CONFIG.runs);
assert.equal(MEASUREMENT_REGISTRY.standard.defaults.minimumRuns, STANDARD_BALANCE_CONFIG.runs);
assert.equal(MEASUREMENT_REGISTRY.standard.defaults.seed, STANDARD_BALANCE_CONFIG.seed);
assert.equal(MEASUREMENT_REGISTRY.standard.defaults.calibrationRuns, STANDARD_BALANCE_CONFIG.calibrationRuns);
for (const contract of ROUTER_CONTRACTS) {
  const definition = MEASUREMENT_REGISTRY[contract.id];
  assert.equal(definition.runner, contract.runner);
  assert.equal(definition.adapter, contract.adapter);
  assert.equal(definition.defaultRunType, contract.defaultRunType);
  assert.deepEqual(definition.allowedRunTypes, contract.allowedRunTypes);
  assert.deepEqual(definition.defaults, contract.defaults);

  const invocation = resolveRunnerInvocation({ measurement: contract.id, purpose: "smoke" }, OUTPUT_DIRECTORY);
  assert.deepEqual(invocation.args, contract.args);
  assert.deepEqual(invocation.output, createMeasurementOutputPaths(OUTPUT_DIRECTORY));
  assert.equal(
    createMeasurementArtifactName(contract.id, "456"),
    `balance-measurement-${contract.id}-456`
  );
  assert.deepEqual(enrichManifest({ invocation, runId: "456" }).artifact, {
    name: `balance-measurement-${contract.id}-456`,
    files: ["measurement.json", "measurement.md", "manifest.json"],
    retentionDays: 14
  });

  const override = resolveMeasurementOptions({
    measurement: contract.id,
    purpose: "override",
    ...contract.override.input
  });
  for (const [key, value] of Object.entries(contract.override.expected)) {
    assert.equal(override[key], value, `${contract.id} override ${key}`);
  }
}
assert.deepEqual(MEASUREMENT_REGISTRY.standard.allowedRunTypes, [
  "baseline-candidate", "diagnostic", "temporary"
]);
assert.deepEqual(MEASUREMENT_REGISTRY["run-difficulty"].allowedRunTypes, [
  "baseline-candidate", "diagnostic", "temporary"
]);
for (const measurement of [
  "starting-kit-early-run",
  "early-b1f-composition",
  "fixed-combat-composition",
  "equipment-load",
  "depth-scaling-diagnostic",
  "trait-scaling-diagnostic",
  "composition-trait-diagnostic",
  "run-difficulty-policy-sensitivity",
  "early-run-attrition",
  "b3plus-survival-decomposition",
  "build-progression-audit",
  "build-progression-pareto-safe",
  "b2-chest-trap",
  "survival-policy",
  "preparation-power-factorial",
  "first-band-build-formation",
  "first-band-b5-wall-diagnostic",
  "first-band-b5-guardian-retry-diagnostic",
  "first-band-b5-guardian-flee-ev-diagnostic",
  "first-band-arcana-weapon-diagnostic",
  "first-band-arcana-mp-supply-diagnostic",
  "first-band-transition-recovery",
  "first-band-levelup-recovery"
]) {
  assert.deepEqual(MEASUREMENT_REGISTRY[measurement].allowedRunTypes, ["diagnostic"]);
  assert.throws(
    () => resolveMeasurementOptions({ measurement, purpose: "test", run_type: "baseline-candidate" }),
    new RegExp(`run_type for ${measurement} must be diagnostic`)
  );
}
assert.equal(resolveMeasurementOptions({
  measurement: "standard",
  purpose: "test",
  run_type: "temporary"
}).runType, "temporary");

assert.throws(
  () => getMeasurementDefinition("unknown-measurement"),
  /unknown measurement ID/
);
assert.equal(
  getMeasurementDefinition("  first-band-b5-wall-diagnostic  ").id,
  "first-band-b5-wall-diagnostic"
);
const trimmedOptions = resolveMeasurementOptions({
  measurement: "  first-band-b5-wall-diagnostic  ",
  ref: "  refs/heads/main  ",
  purpose: "  trimmed purpose  ",
  run_type: " diagnostic "
});
assert.deepEqual(
  {
    measurement: trimmedOptions.measurement,
    ref: trimmedOptions.ref,
    purpose: trimmedOptions.purpose,
    runType: trimmedOptions.runType
  },
  {
    measurement: "first-band-b5-wall-diagnostic",
    ref: "refs/heads/main",
    purpose: "trimmed purpose",
    runType: "diagnostic"
  }
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "standard", purpose: "test", runs: 499 }),
  /runs must be an integer >= 500/
);

const standard = resolveMeasurementOptions({ measurement: "standard", purpose: "test" });
assert.deepEqual(
  { runs: standard.runs, seed: standard.seed, runType: standard.runType },
  { runs: 500, seed: 843, runType: "baseline-candidate" }
);
const attrition = resolveMeasurementOptions({ measurement: "early-run-attrition", purpose: "test" });
assert.deepEqual(
  { runs: attrition.runs, seed: attrition.seed, runType: attrition.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const firstBand = resolveMeasurementOptions({ measurement: "first-band-build-formation", purpose: "test" });
assert.deepEqual(
  { runs: firstBand.runs, seed: firstBand.seed, runType: firstBand.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const b5Wall = resolveMeasurementOptions({ measurement: "first-band-b5-wall-diagnostic", purpose: "test" });
assert.deepEqual(
  { runs: b5Wall.runs, seed: b5Wall.seed, runType: b5Wall.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
assert.deepEqual(
  { runs: MEASUREMENT_REGISTRY["first-band-b5-wall-diagnostic"].defaults.runs, minimumRuns: MEASUREMENT_REGISTRY["first-band-b5-wall-diagnostic"].defaults.minimumRuns },
  { runs: 500, minimumRuns: 500 }
);
const b5WallInvocation = resolveRunnerInvocation({
  measurement: "first-band-b5-wall-diagnostic",
  purpose: "smoke"
}, "/tmp/router-test");
assert.equal(b5WallInvocation.measurement, "first-band-b5-wall-diagnostic");
assert.ok(b5WallInvocation.args.includes("--mode"));
assert.ok(b5WallInvocation.args.includes("b5-wall-diagnostic"));
const b5GuardianRetry = resolveMeasurementOptions({ measurement: "first-band-b5-guardian-retry-diagnostic", purpose: "test" });
assert.deepEqual(
  { runs: b5GuardianRetry.runs, seed: b5GuardianRetry.seed, runType: b5GuardianRetry.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
const b5GuardianRetryInvocation = resolveRunnerInvocation({
  measurement: "first-band-b5-guardian-retry-diagnostic",
  purpose: "smoke"
}, "/tmp/router-test");
assert.equal(b5GuardianRetryInvocation.measurement, "first-band-b5-guardian-retry-diagnostic");
assert.ok(b5GuardianRetryInvocation.args.includes("--mode"));
assert.ok(b5GuardianRetryInvocation.args.includes("b5-guardian-retry-diagnostic"));
const arcanaWeapon = resolveMeasurementOptions({ measurement: "first-band-arcana-weapon-diagnostic", purpose: "test" });
assert.deepEqual(
  { runs: arcanaWeapon.runs, seed: arcanaWeapon.seed, runType: arcanaWeapon.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
const arcanaWeaponInvocation = resolveRunnerInvocation({
  measurement: "first-band-arcana-weapon-diagnostic",
  purpose: "smoke"
}, "/tmp/router-test");
assert.equal(arcanaWeaponInvocation.measurement, "first-band-arcana-weapon-diagnostic");
assert.ok(arcanaWeaponInvocation.args.includes("--mode"));
assert.ok(arcanaWeaponInvocation.args.includes("arcana-weapon-diagnostic"));
const arcanaMpSupply = resolveMeasurementOptions({ measurement: "first-band-arcana-mp-supply-diagnostic", purpose: "test" });
assert.deepEqual(
  { runs: arcanaMpSupply.runs, seed: arcanaMpSupply.seed, runType: arcanaMpSupply.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
const arcanaMpSupplyInvocation = resolveRunnerInvocation({
  measurement: "first-band-arcana-mp-supply-diagnostic",
  purpose: "smoke"
}, "/tmp/router-test");
assert.equal(arcanaMpSupplyInvocation.measurement, "first-band-arcana-mp-supply-diagnostic");
assert.ok(arcanaMpSupplyInvocation.args.includes("--mode"));
assert.ok(arcanaMpSupplyInvocation.args.includes("arcana-mp-supply-diagnostic"));
const survivalDecomposition = resolveMeasurementOptions({
  measurement: "b3plus-survival-decomposition",
  purpose: "test"
});
const transitionRecovery = resolveMeasurementOptions({ measurement: "first-band-transition-recovery", purpose: "test" });
assert.deepEqual(
  { runs: transitionRecovery.runs, seed: transitionRecovery.seed, runType: transitionRecovery.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const levelUpRecovery = resolveMeasurementOptions({ measurement: "first-band-levelup-recovery", purpose: "test" });
assert.deepEqual(
  { runs: levelUpRecovery.runs, seed: levelUpRecovery.seed, runType: levelUpRecovery.runType },
  { runs: 500, seed: 1277, runType: "diagnostic" }
);
assert.deepEqual(
  {
    runs: survivalDecomposition.runs,
    seed: survivalDecomposition.seed,
    runType: survivalDecomposition.runType,
    treatment: survivalDecomposition.treatment
  },
  {
    runs: 1000,
    seed: 1277,
    runType: "diagnostic",
    treatment: "b3plus-survival-decomposition"
  }
);
assert.throws(
  () => resolveMeasurementOptions({
    measurement: "b3plus-survival-decomposition",
    purpose: "test",
    treatment: "portal-policy"
  }),
  /treatment must be b3plus-survival-decomposition/
);
const buildProgression = resolveMeasurementOptions({ measurement: "build-progression-audit", purpose: "test" });
assert.deepEqual(
  { runs: buildProgression.runs, seed: buildProgression.seed, runType: buildProgression.runType },
  { runs: 1000, seed: 1277, runType: "diagnostic" }
);
const paretoSafe = resolveMeasurementOptions({ measurement: "build-progression-pareto-safe", purpose: "test" });
assert.deepEqual(
  { runs: paretoSafe.runs, seed: paretoSafe.seed, runType: paretoSafe.runType, treatment: paretoSafe.treatment },
  { runs: 1000, seed: 1277, runType: "diagnostic", treatment: "equipment-pareto-safe" }
);
const b2ChestTrap = resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test" });
assert.deepEqual(
  { runs: b2ChestTrap.runs, seed: b2ChestTrap.seed, runType: b2ChestTrap.runType, treatment: b2ChestTrap.treatment },
  { runs: 1000, seed: 1277, runType: "diagnostic", treatment: "b2-chest-trap" }
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", run_type: "temporary" }),
  /run_type for b2-chest-trap must be diagnostic/
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", treatment: "portal-policy" }),
  /treatment must be b2-chest-trap/
);
assert.throws(
  () => resolveMeasurementOptions({ measurement: "b2-chest-trap", purpose: "test", runs: 999 }),
  /runs must be an integer >= 1000/
);
const earlyB1F = resolveMeasurementOptions({ measurement: "early-b1f-composition", purpose: "test" });
assert.deepEqual(
  {
    runs: earlyB1F.runs,
    selectionRuns: earlyB1F.selectionRuns,
    fixedRuns: earlyB1F.fixedRuns,
    seed: earlyB1F.seed,
    selectionSeed: earlyB1F.selectionSeed,
    fixedSeed: earlyB1F.fixedSeed
  },
  { runs: 1000, selectionRuns: 5000, fixedRuns: 1000, seed: 2192, selectionSeed: 1192, fixedSeed: 1151 }
);

const output = createMeasurementOutputPaths("/tmp/router-test");
assert.equal(output.measurement, "/tmp/router-test/measurement.json");
assert.equal(output.summary, "/tmp/router-test/measurement.md");
assert.equal(output.manifest, "/tmp/router-test/manifest.json");
assert.equal(
  createMeasurementArtifactName("early-run-attrition", "123/attempt"),
  "balance-measurement-early-run-attrition-123-attempt"
);

for (const measurement of ["standard", "early-run-attrition", "b3plus-survival-decomposition", "build-progression-audit", "build-progression-pareto-safe", "b2-chest-trap", "survival-policy", "preparation-power-factorial", "trait-scaling-diagnostic", "reflect-physical-diagnostic", "composition-trait-diagnostic", "first-band-build-formation", "first-band-b5-wall-diagnostic", "first-band-b5-guardian-retry-diagnostic", "first-band-b5-guardian-flee-ev-diagnostic", "first-band-arcana-weapon-diagnostic", "first-band-arcana-mp-supply-diagnostic", "first-band-transition-recovery", "first-band-levelup-recovery"]) {
  const invocation = resolveRunnerInvocation({ measurement, purpose: "smoke" }, "/tmp/router-test");
  assert.equal(invocation.measurement, measurement);
  assert.match(invocation.runner, /scratch\/measurements\//);
  assert.ok(invocation.args.includes("--output"));
  assert.ok(invocation.args.includes("/tmp/router-test/measurement.json"));
}

const enriched = enrichManifest({
  invocation: resolveRunnerInvocation({ measurement: "survival-policy", purpose: "provenance test" }),
  runId: "456",
  runnerManifest: {
    schemaVersion: 1,
    status: "success",
    source: { runnerVersion: "survival-policy-comparison-v1" },
    provenance: {
      baseRef: "origin/main",
      baseCommit: "d".repeat(40),
      originMainAncestor: true,
      staleTreeAllowed: false,
      workingTreeClean: true,
      measurementRunnerDiffSha256: "e".repeat(64)
    }
  },
  report: {
    runnerVersion: "survival-policy-comparison-v1",
    measurement: {
      sourceCommit: "a".repeat(40),
      gameplaySourceCommit: "b".repeat(40),
      measurementRunnerCommit: "c".repeat(40),
      originMainAncestor: true,
      staleTreeAllowed: false,
      workingTreeClean: true,
      environmentHash: "env-hash"
    }
  }
});
assert.equal(enriched.measurementId, "survival-policy");
assert.equal(enriched.runType, "diagnostic");
assert.equal(enriched.purpose, "provenance test");
assert.equal(enriched.routerProvenance.sourceSha, "a".repeat(40));
assert.equal(enriched.routerProvenance.gameplaySourceSha, "b".repeat(40));
assert.equal(enriched.routerProvenance.measurementRunnerSha, "c".repeat(40));
assert.equal(enriched.routerProvenance.originMainAncestry, true);
assert.equal(enriched.routerProvenance.staleTree, false);
assert.equal(enriched.routerProvenance.workingTreeClean, true);
assert.equal(enriched.routerProvenance.environmentSignature, "env-hash");
assert.deepEqual(enriched.provenance, {
  baseRef: "origin/main",
  baseCommit: "d".repeat(40),
  originMainAncestor: true,
  staleTreeAllowed: false,
  workingTreeClean: true,
  measurementRunnerDiffSha256: "e".repeat(64)
});
assert.equal(enriched.routerProvenance.sourceSha, "a".repeat(40));
assert.equal(enriched.routerProvenance.measurementRunnerSha, "c".repeat(40));
assert.equal(enriched.router.version, BALANCE_MEASUREMENT_ENTRY_VERSION);
assert.deepEqual(enriched.artifact.files, ["measurement.json", "measurement.md", "manifest.json"]);

console.log("[PASS] balance measurement registry, routing, defaults, artifacts, and provenance");
