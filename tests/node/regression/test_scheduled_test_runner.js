import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEAVY_TEST_MANIFEST,
  HEAVY_TEST_OWNERSHIP_COUNTS,
  SCHEDULED_MANIFEST,
} from '../fixtures/heavy_test_manifest.js';
import { createScheduledTasks } from '../fixtures/heavy_test_runner.js';
import { getUnitExclusions } from '../fixtures/unit_gate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/test-scheduled.yml'), 'utf8');
const expectedPaths = [
  'tests/node/unit/test_explore_spell_usage.js',
  'tests/node/regression/test_early_run_attrition_trajectory.js',
  'tests/node/regression/test_fixture_snapshot_measurement.js',
  'tests/node/regression/test_run_difficulty_policy_sensitivity.js',
  'tests/node/regression/test_first_band_arcana_mp_supply.js',
  'tests/node/regression/test_survival_policy_comparison.js',
];

assert.equal(SCHEDULED_MANIFEST.length, 6);
assert.equal(SCHEDULED_MANIFEST.length, HEAVY_TEST_OWNERSHIP_COUNTS.SCHEDULED);
assert.deepEqual(SCHEDULED_MANIFEST.map(entry => entry.file), expectedPaths);
assert.ok(SCHEDULED_MANIFEST.every(entry => entry.ownership === 'SCHEDULED'));
assert.equal(new Set(SCHEDULED_MANIFEST.map(entry => entry.file)).size, 6);
assert.deepEqual(createScheduledTasks().map(task => task.file), expectedPaths);

const scheduledExclusions = [
  getUnitExclusions({ unitMode: 'pull-request' }),
  getUnitExclusions({ unitMode: 'merge-group' }),
  getUnitExclusions({ unitMode: 'main-push' }),
];
for (const exclusions of scheduledExclusions) {
  for (const file of expectedPaths) assert.ok(exclusions.has(file));
}
assert.equal(scheduledExclusions[0].size, 46);
assert.equal(scheduledExclusions[1].size, 46);
assert.equal(scheduledExclusions[2].size, 19);
assert.equal(getUnitExclusions({ unitMode: 'local' }).size, 0);

assert.match(workflow, /schedule:\n\s+- cron: '17 18 \* \* \*'/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /unit-heavy-scheduled:/);
assert.match(workflow, /run: npm run test:unit:scheduled/);
assert.doesNotMatch(workflow, /test_explore_spell_usage\.js/);
assert.doesNotMatch(workflow, /test_early_run_attrition_trajectory\.js/);
assert.equal((workflow.match(/uses: \.\/\.github\/actions\/setup-node-deps/g) || []).length, 1);

assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'PR_CONDITIONAL').length, 27);
assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'MAIN_PUSH').length, 6);
assert.equal(HEAVY_TEST_MANIFEST.filter(entry => entry.ownership === 'MANUAL_MEASUREMENT').length, 7);

console.log('[PASS] SCHEDULED exact 6, generated tasks, CI exclusions, local inclusion, and workflow contract');
