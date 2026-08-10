// sim-scope: infra
import v8 from "node:v8";
import {
  parentPort,
  receiveMessageOnPort,
  workerData
} from "node:worker_threads";

let generateSharedRunFloor = null;
let mapRequestId = 0;
const mapBroker = workerData.mapBroker
  ? {
      port: workerData.mapBroker.port,
      control: new Int32Array(workerData.mapBroker.control)
    }
  : null;

function requestSharedMap({ runSeed, floor }) {
  if (!mapBroker) return null;
  const requestId = ++mapRequestId;
  const key = `${runSeed}:${floor}`;
  Atomics.store(mapBroker.control, 0, 0);
  parentPort.postMessage({ type: "map-request", requestId, key, runSeed, floor });

  while (true) {
    if (Atomics.load(mapBroker.control, 0) === 0) {
      Atomics.wait(mapBroker.control, 0, 0);
    }
    const packet = receiveMessageOnPort(mapBroker.port)?.message;
    if (!packet || packet.requestId !== requestId) {
      Atomics.store(mapBroker.control, 0, 0);
      continue;
    }
    if (packet.type === "map-generate") {
      const generated = generateSharedRunFloor({ runSeed, floor });
      const payload = Uint8Array.from(v8.serialize(generated));
      parentPort.postMessage(
        { type: "map-generated", requestId, key, payload },
        [payload.buffer]
      );
      return generated;
    }
    if (packet.type === "map-payload") {
      return v8.deserialize(Buffer.from(packet.payload));
    }
    throw new Error(`unknown shared map response: ${packet.type}`);
  }
}

if (mapBroker) {
  globalThis.__simSharedMapRequest = requestSharedMap;
}
const module = await import(workerData.moduleUrl);
if (mapBroker) {
  generateSharedRunFloor = module[workerData.mapBroker.generatorExportName];
  if (typeof generateSharedRunFloor !== "function") {
    throw new TypeError(
      `missing map generator export: ${workerData.mapBroker.generatorExportName}`
    );
  }
}
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
