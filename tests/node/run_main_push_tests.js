import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDependencyPreflight } from '../../scripts/dependency-preflight.js';
import {
  HEAVY_TEST_OWNERSHIP_COUNTS,
  MAIN_PUSH_MANIFEST,
} from './fixtures/heavy_test_manifest.js';
import {
  createMainPushTasks,
  runHeavyTestPool,
} from './fixtures/heavy_test_runner.js';

if (!runDependencyPreflight()) process.exit(1);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (MAIN_PUSH_MANIFEST.length !== HEAVY_TEST_OWNERSHIP_COUNTS.MAIN_PUSH) {
  console.error(
    `[main-push] MAIN_PUSH ownership count mismatch: ${MAIN_PUSH_MANIFEST.length}`,
  );
  process.exit(1);
}
const tasks = createMainPushTasks();
const paths = tasks.map(task => task.file);

console.log(`[main-push] MAIN_PUSH manifest count: ${MAIN_PUSH_MANIFEST.length}`);
console.log(`[main-push] execution count: ${tasks.length}`);
console.log('[main-push] execution paths:');
for (const file of paths) console.log(`  ${file}`);

const results = await runHeavyTestPool({ repoRoot, tasks });
const failed = results.filter(result => result.code !== 0);
const passed = results.filter(result => result.code === 0);
const passedPaths = passed.map(result => result.file);
const failedPaths = failed.map(result => result.file);

console.log(`[main-push] PASS ${passed.length} / FAIL ${failed.length}`);
if (failed.length > 0) {
  console.error(`[main-push] FAIL paths: ${failedPaths.join(', ')}`);
  process.exitCode = 1;
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## unit-heavy-main-push',
    '',
    `- count: ${tasks.length}`,
    `- paths: ${paths.map(file => `\`${file}\``).join(', ')}`,
    `- PASS (${passed.length}): ${passedPaths.length ? passedPaths.map(file => `\`${file}\``).join(', ') : '(none)'}`,
    `- FAIL (${failed.length}): ${failedPaths.length ? failedPaths.map(file => `\`${file}\``).join(', ') : '(none)'}`,
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}
