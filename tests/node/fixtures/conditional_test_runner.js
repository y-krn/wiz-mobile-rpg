import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HEAVY_TEST_MANIFEST } from './heavy_test_manifest.js';
import {
  collectChangedFiles,
  selectTestsForChanges,
} from './dependency_resolver.js';

export const PR_CONDITIONAL_MANIFEST = HEAVY_TEST_MANIFEST.filter(
  entry => entry.ownership === 'PR_CONDITIONAL',
);

export function selectConditionalTests({ repoRoot, changedFiles }) {
  return selectTestsForChanges({
    manifest: PR_CONDITIONAL_MANIFEST,
    repoRoot,
    changedFiles,
  });
}

export function resolveConditionalSelection({
  repoRoot,
  baseRef = 'origin/main',
  headRef = 'HEAD',
  includeWorkingTree = true,
}) {
  try {
    const changedFiles = collectChangedFiles({
      repoRoot,
      baseRef,
      headRef,
      includeWorkingTree,
    });
    return {
      ...selectConditionalTests({ repoRoot, changedFiles }),
      changedFiles,
      resolverError: null,
    };
  } catch (error) {
    return {
      selected: new Set(PR_CONDITIONAL_MANIFEST.map(entry => entry.file)),
      results: [],
      changedFiles: null,
      resolverError: error,
    };
  }
}

export function createConditionalTasks({ selected, ci = false }) {
  return PR_CONDITIONAL_MANIFEST
    .filter(entry => selected.has(entry.file))
    .flatMap(entry => {
      const shardCount = ci ? 1 : entry.shardCount;
      return Array.from({ length: shardCount }, (_, shardIndex) => ({
        file: entry.file,
        ...(shardCount === 1 ? {} : { shardIndex, shardCount }),
      }));
    });
}

export function runConditionalTest({ repoRoot, file, shardIndex, shardCount }) {
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
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    }
  });
}

export async function runConditionalPool({ repoRoot, tasks }) {
  const workerCount = Math.max(1, Math.min(os.cpus().length - 1, tasks.length));
  const results = [];
  let nextIndex = 0;

  console.log(`Using ${workerCount} parallel workers.`);

  async function worker() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex++];
      const result = await runConditionalTest({ repoRoot, ...task });
      results.push({ ...task, ...result });
      if (result.code === 0) {
        console.log(`PASS ${task.file}`);
      } else {
        console.error(`[FAIL] ${task.file} failed (exit ${result.code ?? 'unknown'})`);
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
