import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEAVY_TEST_MANIFEST,
  HEAVY_TEST_OWNERSHIP_COUNTS,
  MANUAL_MEASUREMENT_MANIFEST,
} from '../fixtures/heavy_test_manifest.js';
import {
  createManualMeasurementTasks,
} from '../fixtures/heavy_test_runner.js';
import { getUnitExclusions } from '../fixtures/unit_gate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = path.join(repoRoot, '.github/workflows/test-manual-measurement.yml');
const runnerPath = path.join(repoRoot, 'tests/node/run_manual_measurement_tests.js');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const runner = fs.readFileSync(runnerPath, 'utf8');
const expectedPaths = [
  'tests/node/regression/test_early_b1f_composition_diagnostic.js',
  'tests/node/regression/test_preparation_power_factorial.js',
  'tests/node/regression/test_b5_guardian_flee_ev_diagnostic.js',
  'tests/node/regression/test_first_kill_window_diagnostic.js',
  'tests/node/unit/test_build_sensitivity.js',
  'tests/node/regression/test_reached_run_measurement.js',
  'tests/node/regression/test_standard_class_axis.js',
];

assert.equal(MANUAL_MEASUREMENT_MANIFEST.length, 7);
assert.equal(MANUAL_MEASUREMENT_MANIFEST.length, HEAVY_TEST_OWNERSHIP_COUNTS.MANUAL_MEASUREMENT);
assert.deepEqual(MANUAL_MEASUREMENT_MANIFEST.map(entry => entry.file), expectedPaths);
assert.ok(MANUAL_MEASUREMENT_MANIFEST.every(entry => entry.ownership === 'MANUAL_MEASUREMENT'));
assert.deepEqual(createManualMeasurementTasks().map(task => task.file), expectedPaths);
assert.equal(
  HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'MANUAL_MEASUREMENT').length,
  7,
);

for (const mode of ['pull-request', 'merge-group', 'main-push']) {
  const exclusions = getUnitExclusions({ unitMode: mode });
  for (const file of expectedPaths) assert.ok(exclusions.has(file), `${mode} must exclude ${file}`);
}
assert.equal(getUnitExclusions({ unitMode: 'local' }).size, 0);

assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
assert.doesNotMatch(workflow, /pull_request|merge_group|push:|schedule:/);
assert.match(workflow, /unit-heavy-manual-measurement:/);
assert.match(workflow, /run: npm run test:unit:manual-measurement/);
for (const file of expectedPaths) assert.doesNotMatch(workflow, new RegExp(file.replaceAll('/', '\\/')));

assert.match(runner, /MANUAL_MEASUREMENT manifest count/);
assert.match(runner, /execution paths/);
assert.match(runner, /PASS \(\$\{passed\.length\}\)/);
assert.match(runner, /FAIL \(\$\{failed\.length\}\)/);
assert.match(runner, /process\.exitCode = 1/);
assert.match(runner, /GITHUB_STEP_SUMMARY/);

console.log('[PASS] MANUAL_MEASUREMENT exact 7, generated manual workflow tasks, CI exclusions, and local inclusion');
