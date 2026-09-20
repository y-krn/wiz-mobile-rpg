import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PR_CONDITIONAL_MANIFEST,
  createConditionalTasks,
  resolveConditionalSelection,
  selectConditionalTests,
} from '../fixtures/conditional_test_runner.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

assert.equal(PR_CONDITIONAL_MANIFEST.length, 27);
assert.equal(new Set(PR_CONDITIONAL_MANIFEST.map(entry => entry.file)).size, 27);
assert.ok(PR_CONDITIONAL_MANIFEST.every(entry => entry.ownership === 'PR_CONDITIONAL'));
assert.ok(PR_CONDITIONAL_MANIFEST.every(entry => entry.file.startsWith('tests/node/')));

const unrelated = selectConditionalTests({
  repoRoot,
  changedFiles: new Set(['unrelated/not-a-repository-dependency.js']),
});
assert.equal(unrelated.selected.size, 0);

const selectFor = changedFile => selectConditionalTests({
  repoRoot,
  changedFiles: new Set([changedFile]),
});
assert.ok(
  selectFor('tests/node/unit/test_stairs_min_distance.js').selected.has(
    'tests/node/unit/test_stairs_min_distance.js',
  ),
);
assert.ok(selectFor('src/map_generator.js').selected.has('tests/node/unit/test_stairs_min_distance.js'));
assert.ok(
  selectFor('scratch/simulations/sim_depth_material_ev.js').selected.has(
    'tests/node/unit/test_heal_priority_policy.js',
  ),
);
assert.ok(
  selectFor('scratch/measurements/measure_balance.js').selected.has(
    'tests/node/regression/test_cli_tsx_entrypoints.js',
  ),
);
assert.equal(
  selectFor('tests/node/regression/test_observability_after_stairs.js').selected.has(
    'tests/node/regression/test_observability_after_stairs.js',
  ),
  false,
  'non-PR_CONDITIONAL entries must not enter the conditional gate',
);

const failedBase = resolveConditionalSelection({
  repoRoot,
  baseRef: 'refs/remotes/origin/does-not-exist',
  headRef: 'HEAD',
  includeWorkingTree: false,
});
assert.ok(failedBase.resolverError);
assert.equal(failedBase.selected.size, 27);
assert.equal(failedBase.results.length, 0);

const stairTasks = createConditionalTasks({
  selected: new Set(['tests/node/unit/test_stairs_min_distance.js']),
  ci: false,
});
assert.equal(stairTasks.length, 4);
assert.ok(stairTasks.every(task => task.file === 'tests/node/unit/test_stairs_min_distance.js'));
assert.ok(stairTasks.every(task => task.file.includes('/')));

console.log('[PASS] conditional gate exact ownership, canonical selection, safe-select, and shard contract');
