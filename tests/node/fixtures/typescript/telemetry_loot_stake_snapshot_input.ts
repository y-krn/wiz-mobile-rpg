import type { LootStakeSnapshotPayloadInput } from "../../../../src/telemetry_loot_stake_snapshot.js";

export const lootStakeSnapshotPayloadInputFixture: LootStakeSnapshotPayloadInput = {
  runId: "run-fixture",
  context: { customContext: "context-value" },
  snapshotPoint: "portal_decision",
  safeSnapshotPoints: new Set(["portal_decision"]),
  settlementOutcome: "retreat",
  selectedLootCount: 2,
  inventoryCapacity: 20,
  stakeSnapshotFields: { bagOccupancy: 2 }
};
