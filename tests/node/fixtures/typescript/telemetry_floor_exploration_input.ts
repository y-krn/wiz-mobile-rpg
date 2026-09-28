import type { FloorExplorationPayloadInput } from "../../../../src/telemetry_floor_exploration.js";

export const floorExplorationPayloadInputFixture: FloorExplorationPayloadInput = {
  runId: "run-fixture",
  context: { floor: "context-floor", customContext: "context-value" },
  floor: 2.5,
  stepsBeforeStairs: 9,
  stepsAfterStairs: "3.5",
  stairsDiscovered: true,
  floorCompleted: true,
  chestsDiscovered: 2,
  chestsSkipped: 1,
  explorationMode: "discovery"
};
