// sim-scope: infra
import { parentPort, workerData } from "node:worker_threads";

const module = await import(workerData.moduleUrl);
const runTask = module[workerData.exportName];

parentPort.on("message", async message => {
  if (message.type === "close") {
    parentPort.close();
    return;
  }
  if (message.type !== "task") return;

  try {
    const result = await runTask(message.task, workerData.context);
    parentPort.postMessage({ type: "result", index: message.index, result });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      error: {
        name: error?.name,
        message: error?.message || String(error),
        stack: error?.stack
      }
    });
  }
});

parentPort.postMessage({ type: "ready" });
