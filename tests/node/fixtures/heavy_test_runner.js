import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MAIN_PUSH_MANIFEST, SCHEDULED_MANIFEST } from './heavy_test_manifest.js';

function createManifestTasks(manifest) {
  return manifest.map(entry => ({ file: entry.file }));
}

export function createMainPushTasks() {
  return createManifestTasks(MAIN_PUSH_MANIFEST);
}

export function createScheduledTasks() {
  return createManifestTasks(SCHEDULED_MANIFEST);
}

export function runHeavyTest({ repoRoot, file, shardIndex, shardCount }) {
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

export async function runHeavyTestPool({ repoRoot, tasks }) {
  const workerCount = Math.max(1, Math.min(os.cpus().length - 1, tasks.length));
  const results = [];
  let nextIndex = 0;

  console.log(`Using ${workerCount} parallel workers.`);

  async function worker() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex++];
      const result = await runHeavyTest({ repoRoot, ...task });
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
