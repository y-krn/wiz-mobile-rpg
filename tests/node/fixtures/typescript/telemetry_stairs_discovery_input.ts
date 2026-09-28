import type { StairsDiscoveryPayloadInput } from "../../../../src/telemetry_stairs_discovery.js";

export const stairsDiscoveryPayloadInputFixture: StairsDiscoveryPayloadInput = {
  runId: "run-fixture",
  context: { floor: "context-floor", customContext: "context-value" },
  floor: 2.5,
  stairsType: "stairs-down",
  stepsAtDiscovery: "12.25",
  stepsBeforeDiscovery: 9,
  hpRate: 1.25,
  mpRate: "0.5",
  explorationMode: "discovery",
  unbankedObjectLootCount: 3
};
