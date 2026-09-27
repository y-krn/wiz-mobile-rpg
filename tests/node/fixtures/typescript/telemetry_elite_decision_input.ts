import type { EliteDecisionInput } from "../../../../src/telemetry_elite_decision.js";

export const eliteDecisionInputFixture: EliteDecisionInput = {
  runId: "run-fixture",
  context: { floor: 1 },
  floor: 2,
  decision: "avoid",
  eliteId: "RUN_ELITE_B2",
  contactMode: "combat",
  distance: 3.5,
  detected: true,
  elitePolicy: "avoid",
  unbankedObjectLootCount: 1,
  safeDecisions: new Set(["avoid"]),
  safeContactModes: new Set(["combat"])
};
