import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

const DEFAULT_SIM_PARALLEL = 4;
const MAX_SIM_PARALLEL = Math.max(1, availableParallelism());

export function resolveSimParallelism(taskCount) {
  const raw = String(process.env.SIM_PARALLEL || "").trim().toLowerCase();
  const requested = raw === "max"
    ? MAX_SIM_PARALLEL
    : raw
      ? Math.max(1, Math.floor(Number(raw) || 1))
      : Math.min(DEFAULT_SIM_PARALLEL, MAX_SIM_PARALLEL);
  return Math.max(1, Math.min(requested, MAX_SIM_PARALLEL, taskCount));
}

function splitIndexedTasks(tasks, workerCount) {
  const chunks = Array.from({ length: workerCount }, () => []);
  tasks.forEach((task, index) => {
    chunks[index % workerCount].push({ index, task });
  });
  return chunks;
}

function runWorkerChunk(moduleUrl, exportName, indexedTasks, context) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sim_parallel_worker.js", import.meta.url), {
      workerData: { moduleUrl, exportName, indexedTasks, context }
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", code => {
      if (code !== 0) reject(new Error(`simulation worker exited with code ${code}`));
    });
  });
}

export async function runSimTasks({ moduleUrl, exportName, runTask, tasks, context }) {
  if (tasks.length === 0) return [];
  const parallelism = resolveSimParallelism(tasks.length);
  if (parallelism === 1) {
    const results = [];
    for (const task of tasks) results.push(await runTask(task, context));
    return results;
  }

  const chunks = splitIndexedTasks(tasks, parallelism);
  const chunkResults = await Promise.all(
    chunks.map(chunk => runWorkerChunk(moduleUrl, exportName, chunk, context))
  );
  const results = Array(tasks.length);
  chunkResults.flat().forEach(({ index, result }) => {
    results[index] = result;
  });
  return results;
}
