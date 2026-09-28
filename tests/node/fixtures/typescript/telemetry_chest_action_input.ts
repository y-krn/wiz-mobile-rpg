import type { ChestActionInput } from "../../../../src/telemetry_chest_action.js";

export const chestActionInputFixture: ChestActionInput = {
  runId: "run-fixture",
  context: { contextOnly: "kept", floor: 99, inventoryCount: "context value" },
  chest: { fromDrop: true, inspected: "yes", lootHint: { aura: "strong" } },
  action: "open",
  details: {
    floor: 2,
    trap: "poison needle",
    inventoryCount: "4.5",
    hasTrapKit: 0,
    rewardCount: false,
    rewardCategories: ["weapon", "invalid"]
  },
  safeActions: new Set(["open", "leave"]),
  safeTraps: new Set(["none", "poison needle"]),
  safeRewardCategories: new Set(["weapon", "usable", "armor"]),
  safeAuras: new Set(["weak", "medium", "strong"])
};
