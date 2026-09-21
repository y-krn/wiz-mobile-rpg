import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = path.join(repoRoot, '.github/workflows/test.yml');
const workflowSource = fs.readFileSync(workflowPath, 'utf8');
const workflow = YAML.parse(workflowSource);

assert.equal(
  workflow.concurrency.group,
  '${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}',
);
assert.equal(
  workflow.concurrency['cancel-in-progress'],
  "${{ github.event_name == 'pull_request' || github.event_name == 'push' }}",
);

const scenarios = [
  { event: 'pull_request', ref: 'refs/pull/1504/merge', cancel: true },
  { event: 'push', ref: 'refs/heads/main', cancel: true },
  { event: 'merge_group', ref: 'refs/heads/gh-readonly-queue/main/pr-1504-abc', cancel: false },
  { event: 'workflow_dispatch', ref: 'refs/heads/main', cancel: false },
];

function concurrencyFor({ event, ref }) {
  return {
    group: `Test-${event}-${ref}`,
    cancel: event === 'pull_request' || event === 'push',
  };
}

const resolved = scenarios.map(scenario => ({
  ...scenario,
  ...concurrencyFor(scenario),
}));

assert.deepEqual(resolved.map(({ event, cancel }) => ({ event, cancel })), scenarios.map(({ event, cancel }) => ({ event, cancel })));
assert.notEqual(
  resolved.find(scenario => scenario.event === 'push').group,
  resolved.find(scenario => scenario.event === 'workflow_dispatch').group,
);
assert.notEqual(
  resolved.find(scenario => scenario.event === 'pull_request').group,
  resolved.find(scenario => scenario.event === 'merge_group').group,
);

assert.deepEqual(Object.keys(workflow.on).sort(), ['merge_group', 'pull_request', 'push', 'workflow_dispatch']);
assert.deepEqual(workflow.on.push.branches, ['main']);

console.log('[PASS] Test concurrency isolates event types and cancels only pull_request/push runs');
