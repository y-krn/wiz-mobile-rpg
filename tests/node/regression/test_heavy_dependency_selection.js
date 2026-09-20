import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectChangedFiles,
  resolveDependencyClosure,
  resolveTestPath,
  selectTestsForChanges,
} from '../fixtures/dependency_resolver.js';
import { HEAVY_TEST_COUNT, HEAVY_TEST_MANIFEST } from '../fixtures/heavy_test_manifest.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

assert.equal(HEAVY_TEST_MANIFEST.length, HEAVY_TEST_COUNT);
assert.equal(HEAVY_TEST_COUNT, 53);
assert.equal(new Set(HEAVY_TEST_MANIFEST.map(entry => entry.file)).size, HEAVY_TEST_COUNT);

for (const entry of HEAVY_TEST_MANIFEST) {
  assert.ok(entry.file.endsWith('.js'), `${entry.file}: test metadata missing`);
  assert.ok(entry.category, `${entry.file}: category missing`);
  assert.ok(Array.isArray(entry.dependencies), `${entry.file}: dependency metadata missing`);
  assert.ok(resolveTestPath(entry.file, repoRoot), `${entry.file}: test file missing`);
  for (const dependency of entry.dependencies) {
    assert.equal(typeof dependency.path, 'string', `${entry.file}: dependency path missing`);
    assert.equal(typeof dependency.kind, 'string', `${entry.file}: dependency kind missing`);
    assert.equal(typeof dependency.reason, 'string', `${entry.file}: dependency reason missing`);
  }
}

const representative = [
  ['test_stairs_min_distance.js', 'src/map_generator.js'],
  ['test_heal_priority_policy.js', 'scratch/simulations/sim_depth_material_ev.js'],
  ['test_first_band_build_formation.js', 'scratch/measurements/first_band_build_formation.js'],
  ['test_cli_tsx_entrypoints.js', 'package.json'],
  ['test_bleeding_measurement_provenance.js', 'evidence/fixtures/issue-793-measurement-provenance.json'],
];

for (const [testFile, dependency] of representative) {
  const selection = selectTestsForChanges({
    manifest: HEAVY_TEST_MANIFEST,
    repoRoot,
    changedFiles: new Set([dependency]),
  });
  assert.ok(selection.selected.has(testFile), `${dependency} did not select ${testFile}`);
}

const healPath = resolveTestPath('test_heal_priority_policy.js', repoRoot);
const healClosure = resolveDependencyClosure({ entryPath: healPath, repoRoot });
assert.ok(
  [...healClosure.dependencies].some(file => file.endsWith('scratch/simulations/sim_depth_material_ev.js')),
  'literal dynamic import was not traversed recursively',
);

const selfSelection = selectTestsForChanges({
  manifest: HEAVY_TEST_MANIFEST,
  repoRoot,
  changedFiles: new Set(['tests/node/unit/test_stairs_min_distance.js']),
});
assert.ok(selfSelection.selected.has('test_stairs_min_distance.js'), 'test self-change was not selected');

const unrelatedSelection = selectTestsForChanges({
  manifest: HEAVY_TEST_MANIFEST,
  repoRoot,
  changedFiles: new Set(['unrelated/not-a-repository-dependency.js']),
});
assert.equal(unrelatedSelection.selected.size, 0, 'unrelated change selected a heavy test');

const unresolvedSelection = selectTestsForChanges({
  manifest: [{
    file: 'test_stairs_min_distance.js',
    category: 'map',
    dependencies: [{ path: 'missing/unknown-fixture.json', kind: 'fixture', reason: 'guard' }],
  }],
  repoRoot,
  changedFiles: new Set(),
});
assert.ok(unresolvedSelection.selected.has('test_stairs_min_distance.js'), 'unresolved dependency did not safe-select');
assert.ok(unresolvedSelection.results[0].closure.safeToSelect);

const baseHeadChanges = collectChangedFiles({
  repoRoot,
  baseRef: 'origin/main',
  headRef: 'HEAD',
  includeWorkingTree: false,
});
assert.ok(baseHeadChanges instanceof Set, 'BASE...HEAD change set was not returned as a Set');

console.log('[PASS] heavy dependency manifest: 53 entries, recursive closure, representative selection, and safe fallback');
