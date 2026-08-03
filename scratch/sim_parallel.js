// sim-scope: infra
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

const MAX_SIM_PARALLEL = Math.max(1, availableParallelism());
const CI_SIM_PARALLEL = 4;
const IS_CI = ["1", "true"].includes(
  String(process.env.CI || "").trim().toLowerCase()
);
const DEFAULT_SIM_PARALLEL = IS_CI
  ? Math.min(CI_SIM_PARALLEL, MAX_SIM_PARALLEL)
  : MAX_SIM_PARALLEL;

export function resolveSimParallelism(taskCount) {
  const raw = String(process.env.SIM_PARALLEL || "").trim().toLowerCase();
  const requested = raw === "max"
    ? MAX_SIM_PARALLEL
    : raw
      ? Math.max(1, Math.floor(Number(raw) || 1))
      : Math.min(DEFAULT_SIM_PARALLEL, MAX_SIM_PARALLEL);
  return Math.max(1, Math.min(requested, MAX_SIM_PARALLEL, taskCount));
}

function createWorker(moduleUrl, exportName, context) {
  return new Worker(new URL("./sim_parallel_worker.js", import.meta.url), {
    workerData: { moduleUrl, exportName, context }
  });
}

function runWorkerPool(moduleUrl, exportName, tasks, context, workerCount) {
  return new Promise((resolve, reject) => {
    const results = Array(tasks.length);
    const workers = [];
    let nextTaskIndex = 0;
    let completed = 0;
    let settled = false;

    const stopWorkers = () => {
      workers.forEach(worker => worker.terminate());
    };

    const fail = error => {
      if (settled) return;
      settled = true;
      stopWorkers();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const dispatch = worker => {
      if (nextTaskIndex >= tasks.length) {
        worker.postMessage({ type: "close" });
        return;
      }
      const index = nextTaskIndex++;
      worker.postMessage({ type: "task", index, task: tasks[index] });
    };

    const handleMessage = (worker, message) => {
      if (message.type === "ready") {
        dispatch(worker);
        return;
      }
      if (message.type === "error") {
        const error = new Error(message.error?.message || "simulation worker failed");
        if (message.error?.name) error.name = message.error.name;
        if (message.error?.stack) error.stack = message.error.stack;
        fail(error);
        return;
      }
      if (message.type !== "result") return;

      results[message.index] = message.result;
      completed++;
      if (completed === tasks.length) {
        settled = true;
        stopWorkers();
        resolve(results);
        return;
      }
      dispatch(worker);
    };

    for (let index = 0; index < workerCount; index++) {
      const worker = createWorker(moduleUrl, exportName, context);
      workers.push(worker);
      worker.on("message", message => handleMessage(worker, message));
      worker.once("error", fail);
      worker.once("exit", code => {
        if (!settled && code !== 0) {
          fail(new Error(`simulation worker exited with code ${code}`));
        }
      });
    }
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

  return runWorkerPool(moduleUrl, exportName, tasks, context, parallelism);
}
