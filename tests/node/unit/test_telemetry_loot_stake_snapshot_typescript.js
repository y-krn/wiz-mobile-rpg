import assert from "node:assert/strict";
import { buildLootStakeSnapshotPayload } from "../../../src/telemetry_loot_stake_snapshot.ts";
import { lootStakeSnapshotPayloadInputFixture } from "../fixtures/typescript/telemetry_loot_stake_snapshot_input.ts";

const payload = buildLootStakeSnapshotPayload(lootStakeSnapshotPayloadInputFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "customContext", "snapshotPoint", "settlementOutcome", "selectedLootCount", "bagOccupancy"
]);
assert.equal(payload.snapshotPoint, "portal_decision");
assert.equal(payload.settlementOutcome, "retreat");
assert.equal(payload.selectedLootCount, 2);

const calls = [];
const safeSnapshotPoints = new Set(["portal_decision"]);
const orderedInput = {
  runId: "run-ordered",
  context: { snapshotPoint: "context-point", settlementOutcome: "context-outcome", selectedLootCount: 99, stake: "context" },
  safeSnapshotPoints,
  inventoryCapacity: 20,
  get snapshotPoint() { calls.push("snapshotPoint"); return "PORTAL_DECISION"; },
  get settlementOutcome() { calls.push("settlementOutcome"); return " "; },
  get selectedLootCount() { calls.push("selectedLootCount"); return "25"; },
  get stakeSnapshotFields() {
    calls.push("stakeSnapshotFields");
    return { stake: "snapshot" };
  }
};
const orderedPayload = buildLootStakeSnapshotPayload(orderedInput);
assert.deepEqual(calls, ["snapshotPoint", "settlementOutcome", "selectedLootCount", "stakeSnapshotFields"]);
assert.deepEqual(Object.keys(orderedPayload), [
  "runId", "snapshotPoint", "settlementOutcome", "selectedLootCount", "stake"
]);
assert.equal(orderedPayload.snapshotPoint, "other");
assert.equal(orderedPayload.settlementOutcome, "other");
assert.equal(orderedPayload.selectedLootCount, 20);
assert.equal(orderedPayload.stake, "snapshot");

for (const snapshotPoint of [" portal_decision", "PORTAL_DECISION", "invalid"]) {
  assert.equal(buildLootStakeSnapshotPayload({
    ...lootStakeSnapshotPayloadInputFixture,
    snapshotPoint
  }).snapshotPoint, "other");
}

for (const settlementOutcome of [null, undefined, ""]) {
  assert.equal(buildLootStakeSnapshotPayload({
    ...lootStakeSnapshotPayloadInputFixture,
    settlementOutcome
  }).settlementOutcome, null);
}
for (const settlementOutcome of [" retreat", "RETREAT", "invalid"]) {
  assert.equal(buildLootStakeSnapshotPayload({
    ...lootStakeSnapshotPayloadInputFixture,
    settlementOutcome
  }).settlementOutcome, "other");
}

for (const selectedLootCount of [undefined]) {
  assert.equal(buildLootStakeSnapshotPayload({
    ...lootStakeSnapshotPayloadInputFixture,
    selectedLootCount
  }).selectedLootCount, null);
}
assert.equal(buildLootStakeSnapshotPayload({
  ...lootStakeSnapshotPayloadInputFixture,
  selectedLootCount: null
}).selectedLootCount, 0);
assert.equal(buildLootStakeSnapshotPayload({
  ...lootStakeSnapshotPayloadInputFixture,
  selectedLootCount: -3
}).selectedLootCount, 0);

console.log("[PASS] loot stake snapshot TypeScript payload preserves normalization, order, and lazy evaluation");
