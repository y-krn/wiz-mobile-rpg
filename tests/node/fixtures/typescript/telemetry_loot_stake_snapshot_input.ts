import type { LootStakeSnapshotPayloadInput } from "../../../../src/telemetry_loot_stake_snapshot.js";

export const lootStakeSnapshotPayloadInputFixture: LootStakeSnapshotPayloadInput = {
  runId: "run-fixture",
  context: { customContext: "context-value" },
  snapshotPoint: "portal_decision",
  safeSnapshotPoints: new Set(["portal_decision"]),
  settlementOutcome: "retreat",
  stakeSnapshotFields: { bagOccupancy: 2 }
};
