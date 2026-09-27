import assert from "node:assert/strict";
import { EQUIPMENT_SLOTS } from "../../../src/rules/equipment_slots.js";
import { INVENTORY_CAPACITY } from "../../../src/rules/item_inventory.js";
import { buildLoadoutTransactionPayload } from "../../../src/telemetry_loadout_transaction.ts";
import { loadoutTransactionInputFixture } from "../fixtures/typescript/telemetry_loadout_transaction_input.ts";

const payload = buildLoadoutTransactionPayload({
  ...loadoutTransactionInputFixture,
  equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
  discardedItemCountMax: INVENTORY_CAPACITY
});
assert.deepEqual(Object.keys(payload), [
  "runId",
  "floor",
  "action",
  "equipmentChangeCount",
  "runeChangeCount",
  "discardedItemCount",
  "mode",
  "turnCost"
]);
assert.equal(payload.runId, "run-fixture");
assert.equal(payload.action, "commit");
assert.equal(payload.equipmentChangeCount, 1);
assert.equal(payload.turnCost, 1);

const override = buildLoadoutTransactionPayload({
  ...loadoutTransactionInputFixture,
  context: { runId: "context-run", action: "context-action", mode: "context-mode" },
  action: "fight",
  equipmentChanges: EQUIPMENT_SLOTS.length * 8 + 5,
  runeChanges: "2.5",
  discardedItems: INVENTORY_CAPACITY + 3,
  mode: "trial",
  turnCost: "0.25",
  equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
  discardedItemCountMax: INVENTORY_CAPACITY
});
assert.deepEqual(Object.keys(override), [
  "runId",
  "action",
  "mode",
  "equipmentChangeCount",
  "runeChangeCount",
  "discardedItemCount",
  "turnCost"
]);
assert.equal(override.runId, "context-run", "context spread overrides runId");
assert.equal(override.action, "attack", "normalized action overwrites the context action");
assert.equal(override.mode, "trial", "normalized mode overwrites the context mode");
assert.equal(override.equipmentChangeCount, EQUIPMENT_SLOTS.length * 8);
assert.equal(override.runeChangeCount, 2.5);
assert.equal(override.discardedItemCount, INVENTORY_CAPACITY);
assert.equal(override.turnCost, 0.25);

for (const [value, expected] of [
  [null, 0],
  ["", 0],
  [undefined, null],
  ["invalid", null],
  [Number.NaN, null],
  [Number.POSITIVE_INFINITY, null],
  [-1.25, 0],
  [1.25, 1.25]
]) {
  const result = buildLoadoutTransactionPayload({
    ...loadoutTransactionInputFixture,
    equipmentChanges: value,
    runeChanges: value,
    discardedItems: value,
    turnCost: value,
    equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
    discardedItemCountMax: INVENTORY_CAPACITY
  });
  assert.equal(result.equipmentChangeCount, expected);
  assert.equal(result.runeChangeCount, expected);
  assert.equal(result.discardedItemCount, expected);
  assert.equal(result.turnCost, expected === null ? null : Math.min(expected, 1));
}

for (const mode of ["LOADOUT", " loadout", "other", null, 1]) {
  assert.equal(buildLoadoutTransactionPayload({
    ...loadoutTransactionInputFixture,
    mode,
    equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
    discardedItemCountMax: INVENTORY_CAPACITY
  }).mode, "other");
}

for (const action of ["Fight", " fight", "unknown", null, 1]) {
  assert.equal(buildLoadoutTransactionPayload({
    ...loadoutTransactionInputFixture,
    action,
    equipmentChangeCountMax: EQUIPMENT_SLOTS.length * 8,
    discardedItemCountMax: INVENTORY_CAPACITY
  }).action, "other");
}

console.log("[PASS] loadout transaction payload preserves typed telemetry semantics");
