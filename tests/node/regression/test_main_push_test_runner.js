import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEAVY_TEST_MANIFEST,
  MAIN_PUSH_MANIFEST,
} from '../fixtures/heavy_test_manifest.js';
import { createMainPushTasks } from '../fixtures/heavy_test_runner.js';
import { getUnitExclusions } from '../fixtures/unit_gate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/test.yml'), 'utf8');
const expectedPaths = [
  'tests/node/regression/test_observability_after_stairs.js',
  'tests/node/regression/test_first_band_build_formation.js',
  'tests/node/regression/test_first_band_levelup_recovery.js',
  'tests/node/regression/test_first_band_transition_recovery.js',
  'tests/node/regression/test_starting_kit_diagnostic.js',
  'tests/node/regression/test_run_difficulty_measurement.js',
];

assert.equal(MAIN_PUSH_MANIFEST.length, 6);
assert.equal(new Set(MAIN_PUSH_MANIFEST.map(entry => entry.file)).size, 6);
assert.ok(MAIN_PUSH_MANIFEST.every(entry => entry.ownership === 'MAIN_PUSH'));
assert.deepEqual(MAIN_PUSH_MANIFEST.map(entry => entry.file), expectedPaths);
assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'PR_CONDITIONAL').length, 27);
assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'SCHEDULED').length, 6);
assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'MANUAL_MEASUREMENT').length, 7);

const mainPushTasks = createMainPushTasks();
assert.deepEqual(mainPushTasks.map(task => task.file), expectedPaths);
assert.equal(mainPushTasks.length, 6);
assert.ok(mainPushTasks.every(task => task.file.startsWith('tests/node/')));

const pullRequestExclusions = getUnitExclusions({ unitMode: 'pull-request' });
const mergeGroupExclusions = getUnitExclusions({ unitMode: 'merge-group' });
const mainPushExclusions = getUnitExclusions({ unitMode: 'main-push' });
for (const exclusions of [pullRequestExclusions, mergeGroupExclusions, mainPushExclusions]) {
  for (const file of expectedPaths) assert.ok(exclusions.has(file));
}
assert.equal(pullRequestExclusions.size, 39);
assert.equal(mergeGroupExclusions.size, 39);
assert.equal(mainPushExclusions.size, 12);
assert.equal(getUnitExclusions({ unitMode: 'local' }).size, 0);
assert.match(
  workflow,
  /unit-heavy-main-push:\n\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
);
assert.match(workflow, /run: npm run test:unit:main-push/);
assert.doesNotMatch(workflow, /test_observability_after_stairs\.js/);
assert.doesNotMatch(workflow, /test_first_band_build_formation\.js/);

console.log(`[PASS] MAIN_PUSH exact 6, canonical tasks, ownership guards, and unit exclusions (${repoRoot})`);
