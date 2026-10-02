import {
  buildRunStartPayload,
  type RunStartPayload,
  type RunStartPayloadInput
} from "../../../../src/telemetry_run_start.js";

export const runStartPayloadInputFixture: RunStartPayloadInput = {
  runId: "run-fixture",
  context: { contextOnly: "kept", level: 99 },
  run: { startFloor: "2.5" },
  character: { level: "4", maxHp: 18, maxMp: 7 },
  getCharMaxHp: () => 24,
  getCharMaxMp: () => 9,
  buildEquipmentSnapshot: () => ({ equipmentIds: ["SWORD", null] }),
  buildResourceSnapshot: () => ({
    inventoryCount: 3,
    inventoryFreeSlots: 5,
    consumableWingCount: 1
  }),
  getUnbankedLootSummary: () => ({ count: 2 }),
  stateSnapshot: {}
};

export const runStartPayloadFixture: RunStartPayload =
  buildRunStartPayload(runStartPayloadInputFixture);
