import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDependencyPreflight } from '../../scripts/dependency-preflight.js';
import {
  PR_CONDITIONAL_MANIFEST,
  createConditionalTasks,
  resolveConditionalSelection,
  runConditionalPool,
} from './fixtures/conditional_test_runner.js';

if (!runDependencyPreflight()) process.exit(1);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const selection = resolveConditionalSelection({
  repoRoot,
  baseRef: process.env.BASE_REF || 'origin/main',
  headRef: process.env.HEAD_REF || 'HEAD',
  includeWorkingTree: process.env.INCLUDE_WORKING_TREE !== '0',
});

if (selection.resolverError) {
  console.warn(`[WARN] Safe-select all PR_CONDITIONAL tests: ${selection.resolverError.message}`);
}
for (const result of selection.results) {
  if (result.closure.safeToSelect) {
    const details = [...result.closure.unresolved, ...result.closure.errors]
      .map(issue => issue.message)
      .join('; ');
    console.warn(`[WARN] Safe-select ${result.entry.file}: ${details}`);
  }
}

const selectedPaths = PR_CONDITIONAL_MANIFEST
  .filter(entry => selection.selected.has(entry.file))
  .map(entry => entry.file);
console.log(`[conditional] PR_CONDITIONAL manifest count: ${PR_CONDITIONAL_MANIFEST.length}`);
console.log(`[conditional] selected count: ${selectedPaths.length}`);
console.log(`[conditional] selected paths:`);
if (selectedPaths.length === 0) {
  console.log('  (none)');
  console.log('[conditional] No PR_CONDITIONAL dependency closure matched changed files.');
} else {
  for (const file of selectedPaths) console.log(`  ${file}`);

  if (selection.changedFiles) {
    console.log(`[conditional] changed files: ${selection.changedFiles.size}`);
  }

  const tasks = createConditionalTasks({
    selected: selection.selected,
    ci: Boolean(process.env.CI),
  });
  const results = await runConditionalPool({ repoRoot, tasks });
  const failed = results.filter(result => result.code !== 0);
  console.log(`[conditional] PASS ${results.length - failed.length} / FAIL ${failed.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## unit-heavy-conditional',
    '',
    `- selected count: ${selectedPaths.length}`,
    `- selected paths: ${selectedPaths.length ? selectedPaths.map(file => `\`${file}\``).join(', ') : '(none)'}`,
  ];
if (selection.resolverError) summary.push('- safe-select: resolver/base resolution failure');
fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}
