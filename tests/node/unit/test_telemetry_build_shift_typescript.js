import assert from "node:assert/strict";
import { buildBuildShiftPayload } from "../../../src/telemetry_build_shift.ts";
import { buildShiftInputFixture } from "../fixtures/typescript/telemetry_build_shift_input.ts";

const payload = buildBuildShiftPayload(buildShiftInputFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "action", "fromBuildRole", "toBuildRole", "fromEquipmentId", "toEquipmentId", "reason"
]);
assert.deepEqual(payload, {
  runId: "run-fixture",
  floor: 2,
  action: "equip",
  fromBuildRole: "convert",
  toBuildRole: "pivot",
  fromEquipmentId: "WAND",
  toEquipmentId: "SHORT_SWORD",
  reason: "main_core_axis_changed"
});

const precedence = buildBuildShiftPayload({
  ...buildShiftInputFixture,
  context: {
    runId: "context-run",
    floor: 3,
    action: "context-action",
    fromBuildRole: "context-from",
    toBuildRole: "context-to",
    fromEquipmentId: "context-from-id",
    toEquipmentId: "context-to-id",
    reason: "context-reason"
  }
});
assert.deepEqual(Object.keys(precedence), [
  "runId", "floor", "action", "fromBuildRole", "toBuildRole", "fromEquipmentId", "toEquipmentId", "reason"
]);
assert.equal(precedence.runId, "context-run");
assert.equal(precedence.floor, 3);
assert.equal(precedence.action, "equip");
assert.equal(precedence.fromBuildRole, "convert");
assert.equal(precedence.toBuildRole, "pivot");
assert.equal(precedence.fromEquipmentId, "WAND");
assert.equal(precedence.toEquipmentId, "SHORT_SWORD");
assert.equal(precedence.reason, "main_core_axis_changed");

for (const [action, expected] of [["fight", "attack"], ["run", "flee"], ["rest", "heal"], ["unknown", "other"], [null, "other"]]) {
  assert.equal(buildBuildShiftPayload({ ...buildShiftInputFixture, action }).action, expected);
}

for (const [value, expected] of [[null, null], ["other", "other"], ["pivot", "pivot"]]) {
  const roles = buildBuildShiftPayload({ ...buildShiftInputFixture, fromBuildRole: value, toBuildRole: value });
  assert.equal(roles.fromBuildRole, expected);
  assert.equal(roles.toBuildRole, expected);
}

for (const [value, expected] of [[null, null], ["other", "other"], ["WAND", "WAND"]]) {
  const ids = buildBuildShiftPayload({ ...buildShiftInputFixture, fromEquipmentId: value, toEquipmentId: value });
  assert.equal(ids.fromEquipmentId, expected);
  assert.equal(ids.toEquipmentId, expected);
}

console.log("[PASS] TypeScript build shift owner preserves payload semantics");
