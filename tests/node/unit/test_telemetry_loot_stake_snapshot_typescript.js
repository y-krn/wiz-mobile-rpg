import assert from "node:assert/strict";
import { buildLootStakeSnapshotPayload } from "../../../src/telemetry_loot_stake_snapshot.ts";
import { lootStakeSnapshotPayloadInputFixture } from "../fixtures/typescript/telemetry_loot_stake_snapshot_input.ts";

const payload = buildLootStakeSnapshotPayload(lootStakeSnapshotPayloadInputFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "customContext", "snapshotPoint", "settlementOutcome", "bagOccupancy"
]);
assert.equal(payload.snapshotPoint, "portal_decision");
assert.equal(payload.settlementOutcome, "retreat");

const calls = [];
const safeSnapshotPoints = new Set(["portal_decision"]);
const orderedInput = {
  runId: "run-ordered",
  context: { snapshotPoint: "context-point", settlementOutcome: "context-outcome", stake: "context" },
  safeSnapshotPoints,
  get snapshotPoint() { calls.push("snapshotPoint"); return "PORTAL_DECISION"; },
  get settlementOutcome() { calls.push("settlementOutcome"); return " "; },
  get stakeSnapshotFields() {
    calls.push("stakeSnapshotFields");
    return { stake: "snapshot" };
  }
};
const orderedPayload = buildLootStakeSnapshotPayload(orderedInput);
assert.deepEqual(calls, ["snapshotPoint", "settlementOutcome", "stakeSnapshotFields"]);
assert.deepEqual(Object.keys(orderedPayload), [
  "runId", "snapshotPoint", "settlementOutcome", "stake"
]);
assert.equal(orderedPayload.snapshotPoint, "other");
assert.equal(orderedPayload.settlementOutcome, "other");
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

console.log("[PASS] loot stake snapshot TypeScript payload preserves normalization, order, and lazy evaluation");
