// sim-scope: infra
import { availableParallelism } from "node:os";
import { MessageChannel, Worker } from "node:worker_threads";

const MAX_SIM_PARALLEL = Math.max(1, availableParallelism());
const CI_SIM_PARALLEL = 4;
const IS_CI = ["1", "true"].includes(
  String(process.env.CI || "").trim().toLowerCase()
);
const DEFAULT_SIM_PARALLEL = IS_CI
  ? Math.min(CI_SIM_PARALLEL, MAX_SIM_PARALLEL)
  : MAX_SIM_PARALLEL;
const DEFAULT_SIM_MAP_CACHE_ENTRIES = 1_024;

function resolveSimMapCacheEntries() {
  const requested = Number(process.env.SIM_MAP_CACHE_ENTRIES);
  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_SIM_MAP_CACHE_ENTRIES;
  }
  return requested;
}

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

function createMapBroker(generatorExportName) {
  const maxEntries = resolveSimMapCacheEntries();
  const cache = new Map();
  const inFlight = new Map();

  const touch = (key, payload) => {
    cache.delete(key);
    cache.set(key, payload);
  };

  const store = (key, payload) => {
    touch(key, payload);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  };

  const reply = (workerState, message) => {
    workerState.port.postMessage(message);
    Atomics.store(workerState.control, 0, 1);
    Atomics.notify(workerState.control, 0);
  };

  return {
    createWorkerState() {
      const channel = new MessageChannel();
      const control = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      return {
        port: channel.port1,
        control: new Int32Array(control),
        workerData: {
          port: channel.port2,
          control,
          generatorExportName
        }
      };
    },
    handleRequest(workerState, message) {
      const { key, requestId } = message;
      const cached = cache.get(key);
      if (cached) {
        touch(key, cached);
        reply(workerState, { type: "map-payload", requestId, payload: cached });
        return;
      }

      const pending = inFlight.get(key);
      if (pending) {
        pending.push({ workerState, requestId });
        return;
      }

      inFlight.set(key, [{ workerState, requestId }]);
      reply(workerState, { type: "map-generate", requestId });
    },
    handleGenerated(workerState, message) {
      const payload = message.payload instanceof Uint8Array
        ? message.payload
        : new Uint8Array(message.payload);
      store(message.key, payload);
      const pending = inFlight.get(message.key) || [];
      inFlight.delete(message.key);
      pending.forEach(waiter => {
        if (waiter.workerState === workerState && waiter.requestId === message.requestId) {
          return;
        }
        reply(waiter.workerState, {
          type: "map-payload",
          requestId: waiter.requestId,
          payload
        });
      });
    },
    close() {
      cache.clear();
      inFlight.clear();
    }
  };
}

function createWorkerWithMapBroker(moduleUrl, exportName, context, mapBroker) {
  const mapState = mapBroker.createWorkerState();
  const worker = new Worker(new URL("./sim_parallel_worker.js", import.meta.url), {
    workerData: {
      moduleUrl,
      exportName,
      context,
      mapBroker: mapState.workerData
    },
    transferList: [mapState.workerData.port]
  });
  return { worker, mapState };
}

function runWorkerPool(
  moduleUrl,
  exportName,
  tasks,
  context,
  workerCount,
  mapGeneratorExportName = null
) {
  return new Promise((resolve, reject) => {
    const results = Array(tasks.length);
    const workers = [];
    const mapBroker = mapGeneratorExportName
      ? createMapBroker(mapGeneratorExportName)
      : null;
    let nextTaskIndex = 0;
    let completed = 0;
    let settled = false;

    const stopWorkers = () => {
      workers.forEach(({ worker }) => worker.terminate());
      mapBroker?.close();
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

    const handleMessage = (workerState, message) => {
      const { worker } = workerState;
      if (message.type === "map-request") {
        mapBroker?.handleRequest(workerState.mapState, message);
        return;
      }
      if (message.type === "map-generated") {
        mapBroker?.handleGenerated(workerState.mapState, message);
        return;
      }
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
      const workerState = mapBroker
        ? createWorkerWithMapBroker(
            moduleUrl,
            exportName,
            context,
            mapBroker
          )
        : { worker: createWorker(moduleUrl, exportName, context), mapState: null };
      const { worker } = workerState;
      workers.push(workerState);
      worker.on("message", message => handleMessage(workerState, message));
      worker.once("error", fail);
      worker.once("exit", code => {
        if (!settled && code !== 0) {
          fail(new Error(`simulation worker exited with code ${code}`));
        }
      });
    }
  });
}

export async function runSimTasks({
  moduleUrl,
  exportName,
  runTask,
  tasks,
  context,
  mapGeneratorExportName = null
}) {
  if (tasks.length === 0) return [];
  const parallelism = resolveSimParallelism(tasks.length);
  if (parallelism === 1) {
    const results = [];
    for (const task of tasks) results.push(await runTask(task, context));
    return results;
  }

  return runWorkerPool(
    moduleUrl,
    exportName,
    tasks,
    context,
    parallelism,
    mapGeneratorExportName
  );
}
