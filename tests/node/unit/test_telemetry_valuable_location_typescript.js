import assert from "node:assert/strict";
import {
  buildValuableLocationPayload,
  normalizeValuableLocationIdentity
} from "../../../src/telemetry_valuable_location.ts";
import { valuableLocationPayloadInputFixture } from "../fixtures/typescript/telemetry_valuable_location_input.ts";

const safeLocationTypes = new Set(["chest", "stairs-down", "return-portal", "merchant"]);
const safeLocationActions = new Set(["discovered", "opened", "skipped", "used", "visited"]);
const identityInput = {
  ...valuableLocationPayloadInputFixture,
  safeLocationTypes,
  safeLocationActions
};

assert.deepEqual(normalizeValuableLocationIdentity(identityInput), {
  floor: 2.5,
  x: 4,
  y: 5,
  locationType: "chest",
  action: "discovered"
});

for (const [value, expected] of [[0, 0], ["", 0], ["2.25", 2.25], [-3.5, 0], [1001, 1001], [1_000_001, 1_000_000], ["invalid", null], [Infinity, null]]) {
  assert.equal(normalizeValuableLocationIdentity({ ...identityInput, floor: value }).floor, expected);
}
for (const [value, expected] of [[0, 0], ["", 0], ["4.5", 4.5], [-2.5, 0], [1001, 1000], ["invalid", null], [Infinity, null]]) {
  assert.equal(normalizeValuableLocationIdentity({ ...identityInput, x: value }).x, expected);
  assert.equal(normalizeValuableLocationIdentity({ ...identityInput, y: value }).y, expected);
}
for (const value of ["Chest", " chest", "unknown", 3]) {
  assert.equal(normalizeValuableLocationIdentity({ ...identityInput, locationType: value }).locationType, "other");
}
for (const value of ["DISCOVERED", "discovered ", "unknown", 3]) {
  assert.equal(normalizeValuableLocationIdentity({ ...identityInput, action: value }).action, "other");
}

const payload = buildValuableLocationPayload(valuableLocationPayloadInputFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "customContext", "locationType", "action", "distanceFromStart", "source"
]);
assert.equal(payload.floor, 2.5);
assert.equal(payload.locationType, "chest");
assert.equal(payload.action, "discovered");
assert.equal(payload.distanceFromStart, 12.5);
assert.equal(payload.source, "chest");

const overridden = buildValuableLocationPayload({
  ...valuableLocationPayloadInputFixture,
  context: { runId: "context-run", floor: 999, locationType: "context-type", action: "context-action" }
});
assert.equal(overridden.runId, "context-run");
assert.equal(overridden.floor, 2.5);
assert.equal(overridden.locationType, "chest");
assert.equal(overridden.action, "discovered");

for (const source of ["", 0, false, null, undefined]) {
  assert.equal(buildValuableLocationPayload({ ...valuableLocationPayloadInputFixture, source }).source, "dungeon");
}
assert.equal(buildValuableLocationPayload({ ...valuableLocationPayloadInputFixture, source: "invalid" }).source, "other");
for (const [distanceFromStart, expected] of [[0, 0], ["", 0], ["3.25", 3.25], [-1, 0], [1001, 1000], ["invalid", null]]) {
  assert.equal(buildValuableLocationPayload({ ...valuableLocationPayloadInputFixture, distanceFromStart }).distanceFromStart, expected);
}
assert.equal(Object.hasOwn(payload, "x"), false);
assert.equal(Object.hasOwn(payload, "y"), false);

console.log("[PASS] TypeScript valuable location owner preserves identity and payload semantics");
