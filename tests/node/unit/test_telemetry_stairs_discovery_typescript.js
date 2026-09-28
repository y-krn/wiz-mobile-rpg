import assert from "node:assert/strict";
import {
  buildStairsDiscoveryPayload,
  normalizeStairsDiscoveryIdentity
} from "../../../src/telemetry_stairs_discovery.ts";
import { stairsDiscoveryPayloadInputFixture } from "../fixtures/typescript/telemetry_stairs_discovery_input.ts";

for (const [floor, expected] of [
  [0, 0], ["", 0], [null, 0], ["2.25", 2.25], [-3.5, 0],
  [1_000_001, 1_000_000], [undefined, null], ["invalid", null], [Infinity, null]
]) {
  assert.equal(normalizeStairsDiscoveryIdentity({ floor, stairsType: "stairs-down" }).floor, expected);
}

for (const [stairsType, expected] of [
  ["stairs-up", "stairs-up"], ["stairs-down", "stairs-down"], ["stairs-UP", "other"],
  [" stairs-up", "other"], ["invalid", "other"], [0, "other"]
]) {
  assert.equal(normalizeStairsDiscoveryIdentity({ floor: 1, stairsType }).stairsType, expected);
}

const payload = buildStairsDiscoveryPayload(stairsDiscoveryPayloadInputFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "customContext", "stairsType", "stepsAtDiscovery", "stepsBeforeDiscovery",
  "hpRate", "mpRate", "explorationMode", "unbankedObjectLootCount"
]);
assert.equal(payload.floor, 2.5);
assert.equal(payload.stairsType, "stairs-down");
assert.equal(payload.stepsAtDiscovery, 12.25);
assert.equal(payload.stepsBeforeDiscovery, 9);
assert.equal(payload.hpRate, 1);
assert.equal(payload.mpRate, 0.5);
assert.equal(payload.explorationMode, "discovery");
assert.equal(payload.unbankedObjectLootCount, 3);

for (const [value, expected] of [
  [0, 0], ["", 0], ["2.25", 2.25], [-3.5, 0], [null, 0],
  [undefined, null], ["invalid", null], [Infinity, null]
]) {
  const bounded = buildStairsDiscoveryPayload({
    ...stairsDiscoveryPayloadInputFixture,
    stepsAtDiscovery: value,
    stepsBeforeDiscovery: value
  });
  assert.equal(bounded.stepsAtDiscovery, expected);
  assert.equal(bounded.stepsBeforeDiscovery, expected);
}

for (const [value, expected] of [
  [false, 0], ["", 0], [null, 0], ["0.25", 0.25], [-1, 0], [2, 1],
  [undefined, null], ["invalid", null], [Infinity, null]
]) {
  const bounded = buildStairsDiscoveryPayload({
    ...stairsDiscoveryPayloadInputFixture,
    hpRate: value,
    mpRate: value
  });
  assert.equal(bounded.hpRate, expected);
  assert.equal(bounded.mpRate, expected);
}

const overridden = buildStairsDiscoveryPayload({
  ...stairsDiscoveryPayloadInputFixture,
  context: { runId: "context-run", floor: 999, stairsType: "context-type" }
});
assert.equal(overridden.runId, "context-run");
assert.equal(overridden.floor, 2.5);
assert.equal(overridden.stairsType, "stairs-down");

for (const [value, expected] of [[null, null], [undefined, null], ["", null], [" ", "other"], ["unknown", "unknown"], ["invalid", "other"]]) {
  assert.equal(buildStairsDiscoveryPayload({
    ...stairsDiscoveryPayloadInputFixture,
    explorationMode: value
  }).explorationMode, expected);
}

console.log("[PASS] TypeScript stairs discovery owner preserves identity and payload semantics");
