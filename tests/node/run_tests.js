import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { runDependencyPreflight } from '../../scripts/dependency-preflight.js';
import { HEAVY_TEST_MANIFEST } from './fixtures/heavy_test_manifest.js';
import { collectChangedFiles, selectTestsForChanges } from './fixtures/dependency_resolver.js';

if (!runDependencyPreflight()) process.exit(1);

// Unit/regression ownership is explicit: only test files under these two
// directories are suite candidates. Simulations and measurements live under
// scratch/ and cannot be picked up by naming accidents.
const EXCLUDE_LIST = [];
// Keep the runner contract stable. #1425 supplies selection metadata for the
// later conditional gate; it does not move all #1421 ownership into this job.
const HEAVY_TESTS = {
  'test_stairs_min_distance.js': 4,
  'test_reachability_loop.js': 4,
  'test_shared_wall_corridors.js': 3,
  'test_observability_after_stairs.js': 1,
  'test_explore_spell_usage.js': 1,
  'test_heal_priority_policy.js': 1,
};
const heavyTestFiles = Object.keys(HEAVY_TESTS);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testRoots = [
  path.join(repoRoot, 'tests/node/unit'),
  path.join(repoRoot, 'tests/node/regression'),
];
const startTime = Date.now();

function selectHeavyTests() {
  if (process.env.FULL_TEST === '1') {
    return new Set(heavyTestFiles);
  }

  if (process.env.FAST === '1') {
    return new Set();
  }

  try {
    const changedFiles = collectChangedFiles({
      repoRoot,
      baseRef: process.env.BASE_REF || 'origin/main',
      headRef: process.env.HEAD_REF || 'HEAD',
    });
    const selection = selectTestsForChanges({
      manifest: HEAVY_TEST_MANIFEST.filter(entry => heavyTestFiles.includes(path.basename(entry.file))),
      repoRoot,
      changedFiles,
    });
    for (const result of selection.results) {
      if (result.closure.safeToSelect) {
        console.warn(`[WARN] Safe-select ${result.entry.file}: unresolved dependency or resolver error`);
      }
    }
    return new Set([...selection.selected].map(file => path.basename(file)));
  } catch (error) {
    console.warn(`[WARN] Scope detection failed; running all HEAVY tests: ${error.message}`);
    return new Set(heavyTestFiles);
  }
}

function formatTestName({ file, shardIndex, shardCount }) {
  return shardCount ? `${file} [${shardIndex + 1}/${shardCount}]` : file;
}

function printResult(result) {
  if (result.code === 0) {
    console.log(`PASS ${result.name}`);
    return;
  }

  const separator = '========================================';
  console.log(`\n${separator}`);
  console.log(`Completed: ${result.name}`);
  console.log(separator);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.code !== 0) {
    console.error(`\n[FAIL] ${result.name} failed (exit ${result.code ?? 'unknown'})`);
  }
}

function runTest(task) {
  const { file, shardIndex, shardCount } = task;
  // Test contracts may import simulation modules for wiring checks; they are not measurements.
  const env = { ...process.env, SIM_SKIP_PROVENANCE: '1' };
  if (shardCount) {
    env.SHARD_INDEX = String(shardIndex);
    env.SHARD_COUNT = String(shardCount);
  }

  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--import', 'tsx/esm', path.join(repoRoot, file)], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      stderr.push(Buffer.from(`${error.stack || error.message}\n`));
      finish(null);
    });
    child.on('close', code => finish(code));

    function finish(code) {
      if (settled) return;
      settled = true;
      resolve({
        file,
        name: formatTestName(task),
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    }
  });
}

async function runPool(tasks) {
  const workerCount = Math.max(1, Math.min(os.cpus().length - 1, tasks.length));
  const results = [];
  let nextIndex = 0;

  console.log(`Using ${workerCount} parallel workers.`);

  async function worker() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex++];
      const result = await runTest(task);
      results.push(result);
      printResult(result);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

const testFiles = testRoots
  .flatMap(testRoot => fs.readdirSync(testRoot)
    .filter(file => file.startsWith('test_') && file.endsWith('.js'))
    .map(file => path.relative(repoRoot, path.join(testRoot, file)).split(path.sep).join('/')))
  .filter(file => !EXCLUDE_LIST.includes(path.basename(file)))
  .sort();
const testFilePathsByName = new Map(testFiles.map(file => [path.basename(file), file]));
const selectedHeavyTests = selectHeavyTests();
const skippedHeavyTests = heavyTestFiles.filter(file => !selectedHeavyTests.has(file));
const cheapTests = testFiles.filter(file => !heavyTestFiles.includes(path.basename(file)));
const scheduledTests = [
  ...heavyTestFiles
    .filter(file => selectedHeavyTests.has(file))
    .flatMap(file => {
      const testPath = testFilePathsByName.get(file);
      if (!testPath) throw new Error(`Heavy test is not owned by a test directory: ${file}`);
      const shardCount = process.env.CI ? 1 : HEAVY_TESTS[file];
      return Array.from({ length: shardCount }, (_, shardIndex) =>
        shardCount === 1 ? { file: testPath } : { file: testPath, shardIndex, shardCount }
      );
    }),
  ...cheapTests.map(file => ({ file })),
];

console.log(`Found ${testFiles.length} test files.`);
const skipReason = process.env.FAST === '1' ? 'fast mode' : 'deps unchanged';
for (const file of skippedHeavyTests) {
  console.log(`skip: ${file} (${skipReason})`);
}

const results = await runPool(scheduledTests);
const passed = results.filter(result => result.code === 0);
const failed = results.filter(result => result.code !== 0);
const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\n実行 ${scheduledTests.length}本 / skip ${skippedHeavyTests.length}本 / 合計時間 ${elapsedSeconds}s`);

if (failed.length > 0) {
  console.error(`Some tests failed: ${failed.map(result => result.name).join(', ')}`);
} else {
  console.log('All tests passed successfully!');
}

console.log(`PASS ${passed.length} / FAIL ${failed.length} / SKIP ${skippedHeavyTests.length}`);
if (failed.length > 0) process.exitCode = 1;
