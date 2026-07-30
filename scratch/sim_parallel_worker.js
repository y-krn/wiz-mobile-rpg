import { parentPort, workerData } from "node:worker_threads";

const module = await import(workerData.moduleUrl);
const runTask = module[workerData.exportName];
const results = [];

for (const { index, task } of workerData.indexedTasks) {
  results.push({ index, result: await runTask(task, workerData.context) });
}

parentPort.postMessage(results);
parentPort.close();
