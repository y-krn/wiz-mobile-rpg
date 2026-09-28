import type { ValuableLocationPayloadInput } from "../../../../src/telemetry_valuable_location.js";

export const valuableLocationPayloadInputFixture: ValuableLocationPayloadInput = {
  runId: "run-fixture",
  context: { floor: "context-floor", customContext: "context-value" },
  floor: 2.5,
  x: 4,
  y: 5,
  locationType: "chest",
  action: "discovered",
  distanceFromStart: 12.5,
  source: "chest",
  safeLootSources: new Set(["dungeon", "chest", "other"])
};
