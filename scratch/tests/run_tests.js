import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { runDependencyPreflight } from '../../scripts/dependency-preflight.js';

if (!runDependencyPreflight()) process.exit(1);

// Unit/regression ownership is explicit: only test files under these two
// directories are suite candidates. Simulations and measurements live under
// separate directories and cannot be picked up by naming accidents.
const EXCLUDE_LIST = [];
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
  path.join(repoRoot, 'scratch/tests/unit'),
  path.join(repoRoot, 'scratch/tests/regression'),
];
const startTime = Date.now();

const toRepoPath = filePath => path.relative(repoRoot, filePath).split(path.sep).join('/');
const normalizeRepoPath = filePath => path.normalize(filePath).split(path.sep).join('/').replace(/^\.\//, '');

function parseCommandOutput(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function resolveRelativeImport(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    path.join(unresolved, 'index.js'),
  ];
  const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

  if (!resolved) {
    throw new Error(`Unable to resolve "${specifier}" from ${toRepoPath(importer)}`);
  }

  return resolved;
}

function findRelativeImports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[^'";]*?\s+from\s*)['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith('.')) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers];
}

function collectHeavyDependencies(testFile) {
  const ownedTestPath = testFile.includes('/')
    ? testFile
    : ['unit', 'regression']
      .map(directory => `scratch/tests/${directory}/${testFile}`)
      .find(candidate => fs.existsSync(path.join(repoRoot, candidate)));
  if (!ownedTestPath) {
    throw new Error(`Heavy test is not owned by a test directory: ${testFile}`);
  }
  const testPath = path.join(repoRoot, ownedTestPath);
  const dependencies = new Set([toRepoPath(testPath)]);
  const visited = new Set();

  function visit(filePath) {
    const absolutePath = path.resolve(filePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    for (const specifier of findRelativeImports(absolutePath)) {
      const dependency = resolveRelativeImport(absolutePath, specifier);
      dependencies.add(toRepoPath(dependency));
      visit(dependency);
    }
  }

  visit(testPath);
  return dependencies;
}

function findChangedFiles() {
  const baseRef = process.env.BASE_REF || 'origin/main';
  const [mergeBase] = parseCommandOutput('git', ['merge-base', 'HEAD', baseRef]);
  if (!mergeBase) {
    throw new Error(`No merge base found for ${baseRef}`);
  }

  const changedFiles = new Set([
    ...parseCommandOutput('git', ['diff', '--name-only', `${mergeBase}...HEAD`]),
    ...parseCommandOutput('git', ['diff', '--name-only']),
    ...parseCommandOutput('git', ['diff', '--name-only', '--cached']),
    ...parseCommandOutput('git', ['ls-files', '--others', '--exclude-standard']),
  ].map(normalizeRepoPath));

  return changedFiles;
}

function selectHeavyTests() {
  if (process.env.FULL_TEST === '1') {
    return new Set(heavyTestFiles);
  }

  if (process.env.FAST === '1') {
    return new Set();
  }

  try {
    const changedFiles = findChangedFiles();
    const selected = new Set();

    for (const testFile of heavyTestFiles) {
      const dependencies = collectHeavyDependencies(testFile);
      if ([...dependencies].some(dependency => changedFiles.has(dependency))) {
        selected.add(testFile);
      }
    }

    return selected;
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
    const child = spawn(process.execPath, [path.join(repoRoot, file)], {
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
