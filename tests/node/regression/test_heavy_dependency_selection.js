import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectChangedFiles,
  resolveDependencyClosure,
  resolveTestPath,
  selectTestsForChanges,
} from '../fixtures/dependency_resolver.js';
import {
  HEAVY_TEST_COUNT,
  HEAVY_TEST_MANIFEST,
  HEAVY_TEST_OWNERSHIP_COUNTS,
} from '../fixtures/heavy_test_manifest.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const canonicalFiles = [
  'tests/node/unit/test_stairs_min_distance.js',
  'tests/node/unit/test_heal_priority_policy.js',
  'tests/node/unit/test_reachability_loop.js',
  'tests/node/regression/test_cli_tsx_entrypoints.js',
  'tests/node/unit/test_shared_wall_corridors.js',
  'tests/node/unit/test_terrain_structures.js',
  'tests/node/unit/test_evidence_storage_policy.js',
  'tests/node/unit/test_camp_waypoints.js',
  'tests/node/unit/test_return_wing_special_reward.js',
  'tests/node/unit/test_maze_diversity.js',
  'tests/node/unit/test_room_generation.js',
  'tests/node/unit/test_chest_relief.js',
  'tests/node/unit/test_roaming_elites.js',
  'tests/node/unit/test_chest_count.js',
  'tests/node/regression/test_sim_follow_gate.js',
  'tests/node/regression/test_sim_equipment_craft.js',
  'tests/node/regression/test_undefined_state_recovery.js',
  'tests/node/unit/test_save.js',
  'tests/node/regression/test_milestone_route.js',
  'tests/node/unit/test_floor_trials.js',
  'tests/node/unit/test_map_reachability.js',
  'tests/node/regression/test_biome_depth.js',
  'tests/node/regression/test_pareto_safe_policy.js',
  'tests/node/unit/test_css_lint.js',
  'tests/node/unit/test_submenu_resume.js',
  'tests/node/regression/test_sim_path_determinism.js',
  'tests/node/unit/test_loot.js',
  'tests/node/regression/test_observability_after_stairs.js',
  'tests/node/regression/test_first_band_build_formation.js',
  'tests/node/regression/test_first_band_levelup_recovery.js',
  'tests/node/regression/test_first_band_transition_recovery.js',
  'tests/node/regression/test_starting_kit_diagnostic.js',
  'tests/node/regression/test_run_difficulty_measurement.js',
  'tests/node/unit/test_explore_spell_usage.js',
  'tests/node/regression/test_early_run_attrition_trajectory.js',
  'tests/node/regression/test_fixture_snapshot_measurement.js',
  'tests/node/regression/test_run_difficulty_policy_sensitivity.js',
  'tests/node/regression/test_first_band_arcana_mp_supply.js',
  'tests/node/regression/test_survival_policy_comparison.js',
  'tests/node/regression/test_phase3_stage1_5_diagnostics.js',
  'tests/node/regression/test_early_b1f_composition_diagnostic.js',
  'tests/node/regression/test_preparation_power_factorial.js',
  'tests/node/regression/test_b5_guardian_flee_ev_diagnostic.js',
  'tests/node/regression/test_first_kill_window_diagnostic.js',
  'tests/node/regression/test_phase3_stage3_checkpoint_continuation.js',
  'tests/node/regression/test_partial_information_progression.js',
  'tests/node/unit/test_build_sensitivity.js',
  'tests/node/regression/test_reached_run_measurement.js',
  'tests/node/regression/test_standard_class_axis.js',
  'tests/node/regression/test_phase3_stage2_combat_personas.js',
];

assert.equal(HEAVY_TEST_MANIFEST.length, HEAVY_TEST_COUNT);
assert.equal(HEAVY_TEST_COUNT, 50);
assert.deepEqual(
  [...new Set(HEAVY_TEST_MANIFEST.map(entry => entry.file))].sort(),
  [...new Set(canonicalFiles)].sort(),
  'manifest must equal the canonical #1421 file set',
);
assert.equal(new Set(HEAVY_TEST_MANIFEST.map(entry => entry.file)).size, 50);

const ownershipCounts = HEAVY_TEST_MANIFEST.reduce((counts, entry) => {
  counts[entry.ownership] = (counts[entry.ownership] || 0) + 1;
  return counts;
}, {});
assert.deepEqual(
  ownershipCounts,
  HEAVY_TEST_OWNERSHIP_COUNTS,
  'manifest ownership counts must equal #1421',
);

for (const entry of HEAVY_TEST_MANIFEST) {
  assert.ok(entry.file.endsWith('.js'), `${entry.file}: test metadata missing`);
  assert.ok(entry.category, `${entry.file}: category missing`);
  assert.ok(entry.ownership, `${entry.file}: ownership missing`);
  assert.ok(Array.isArray(entry.dependencies), `${entry.file}: dependency metadata missing`);
  assert.ok(resolveTestPath(entry.file, repoRoot), `${entry.file}: test file missing`);
  for (const dependency of entry.dependencies) {
    assert.equal(typeof dependency.path, 'string', `${entry.file}: dependency path missing`);
    assert.equal(typeof dependency.kind, 'string', `${entry.file}: dependency kind missing`);
    assert.equal(typeof dependency.reason, 'string', `${entry.file}: dependency reason missing`);
  }
}

const findEntry = file => HEAVY_TEST_MANIFEST.find(entry => entry.file.endsWith(`/${file}`));
const selectFor = (entry, dependency) => selectTestsForChanges({
  manifest: [entry],
  repoRoot,
  changedFiles: new Set([dependency]),
});

const representative = [
  ['test_stairs_min_distance.js', 'src/map_generator.js'],
  ['test_heal_priority_policy.js', 'scratch/simulations/sim_depth_material_ev.js'],
  ['test_first_band_build_formation.js', 'scratch/measurements/measurement_manifest.js'],
  ['test_cli_tsx_entrypoints.js', 'package.json'],
];
for (const [testFile, dependency] of representative) {
  const selection = selectFor(findEntry(testFile), dependency);
  assert.ok(selection.selected.has(findEntry(testFile).file), `${dependency} did not select ${testFile}`);
}

const healPath = resolveTestPath('test_heal_priority_policy.js', repoRoot);
const healClosure = resolveDependencyClosure({ entryPath: healPath, repoRoot });
assert.ok(
  [...healClosure.dependencies].some(file => file.endsWith('scratch/simulations/sim_depth_material_ev.js')),
  'literal dynamic import was not traversed recursively',
);

function assertNestedRunnerDependencySelected(testFile, runnerPath) {
  const runner = resolveTestPath(runnerPath, repoRoot);
  const runnerClosure = resolveDependencyClosure({ entryPath: runner, repoRoot });
  const runnerRelative = path.relative(repoRoot, runner).split(path.sep).join('/');
  const nestedDependency = [...runnerClosure.dependencies]
    .map(file => path.relative(repoRoot, file).split(path.sep).join('/'))
    .find(file => file !== runnerRelative);
  assert.ok(nestedDependency, `${runnerPath}: imported dependency missing from closure`);
  const selection = selectFor(findEntry(testFile), nestedDependency);
  assert.ok(
    selection.selected.has(findEntry(testFile).file),
    `${nestedDependency} did not select ${testFile} through ${runnerPath}`,
  );
}

assertNestedRunnerDependencySelected(
  'test_cli_tsx_entrypoints.js',
  'scratch/simulations/sim_depth_material_ev.js',
);
assertNestedRunnerDependencySelected(
  'test_cli_tsx_entrypoints.js',
  'scratch/measurements/measure_balance.js',
);

const selfSelection = selectFor(
  findEntry('test_stairs_min_distance.js'),
  'tests/node/unit/test_stairs_min_distance.js',
);
assert.ok(
  selfSelection.selected.has(findEntry('test_stairs_min_distance.js').file),
  'test self-change was not selected',
);

const unrelatedSelection = selectTestsForChanges({
  manifest: HEAVY_TEST_MANIFEST,
  repoRoot,
  changedFiles: new Set(['unrelated/not-a-repository-dependency.js']),
});
assert.equal(unrelatedSelection.selected.size, 0, 'unrelated change selected a heavy test');

const unresolvedSelection = selectTestsForChanges({
  manifest: [{
    file: 'tests/node/unit/test_stairs_min_distance.js',
    category: 'map',
    ownership: 'PR_CONDITIONAL',
    dependencies: [{ path: 'missing/unknown-fixture.json', kind: 'fixture', reason: 'guard' }],
  }],
  repoRoot,
  changedFiles: new Set(),
});
assert.ok(unresolvedSelection.selected.has('tests/node/unit/test_stairs_min_distance.js'), 'unresolved dependency did not safe-select');
assert.ok(unresolvedSelection.results[0].closure.safeToSelect);

const baseHeadChanges = collectChangedFiles({
  repoRoot,
  baseRef: 'origin/main',
  headRef: 'HEAD',
  includeWorkingTree: false,
});
assert.ok(baseHeadChanges instanceof Set, 'BASE...HEAD change set was not returned as a Set');

console.log('[PASS] canonical #1421 heavy inventory, ownership counts, recursive supplemental closure, and safe selection');
