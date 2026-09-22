import assert from "node:assert/strict";
import * as facade from "../../../src/rules/equipment_slots.js";
import * as owner from "../../../src/rules/equipment_slots.ts";

assert.deepEqual(Object.keys(facade).sort(), Object.keys(owner).sort());
for (const name of Object.keys(owner)) {
  assert.strictEqual(facade[name], owner[name], `${name} facade identity`);
}

const expectedSlots = [
  { id: "weapon", itemType: "weapon", label: "武器" },
  { id: "shield", itemType: "shield", label: "盾" },
  { id: "armor", itemType: "armor", label: "鎧" },
  { id: "accessory", itemType: "accessory", label: "装飾1" },
  { id: "accessory2", itemType: "accessory", label: "装飾2" }
];
assert.deepEqual(owner.EQUIPMENT_SLOTS, expectedSlots);
assert.equal(Object.isFrozen(owner.EQUIPMENT_SLOTS), true);
for (const slot of owner.EQUIPMENT_SLOTS) assert.equal(Object.isFrozen(slot), true);

const expectedLabels = [
  ["weapon", "武器"],
  ["shield", "盾"],
  ["armor", "鎧"],
  ["accessory", "装飾"]
];
assert.deepEqual(Object.entries(owner.EQUIPMENT_TYPE_LABELS), expectedLabels);
assert.equal(Object.isFrozen(owner.EQUIPMENT_TYPE_LABELS), true);

for (const slot of owner.EQUIPMENT_SLOTS) {
  assert.strictEqual(owner.getEquipmentSlot(slot.id), slot);
}
assert.strictEqual(owner.getEquipmentSlot("accessory2"), owner.EQUIPMENT_SLOTS[4]);
for (const invalid of ["unknown", null, undefined, false, 0, new String("weapon"), {}]) {
  assert.equal(owner.getEquipmentSlot(invalid), null);
}

for (const [itemType, slot] of [
  ["weapon", owner.EQUIPMENT_SLOTS[0]],
  ["shield", owner.EQUIPMENT_SLOTS[1]],
  ["armor", owner.EQUIPMENT_SLOTS[2]]
]) {
  const result = owner.getEquipmentSlotsForType(itemType);
  assert.deepEqual(result, [slot]);
  assert.strictEqual(result[0], slot);
}

const accessories = owner.getEquipmentSlotsForType("accessory");
assert.deepEqual(accessories, [owner.EQUIPMENT_SLOTS[3], owner.EQUIPMENT_SLOTS[4]]);
assert.strictEqual(accessories[0], owner.EQUIPMENT_SLOTS[3]);
assert.strictEqual(accessories[1], owner.EQUIPMENT_SLOTS[4]);
const accessoriesAgain = owner.getEquipmentSlotsForType("accessory");
assert.notStrictEqual(accessoriesAgain, accessories);
assert.strictEqual(accessoriesAgain[0], accessories[0]);
assert.equal(Object.isFrozen(accessories), false);
assert.equal(Object.isFrozen(accessoriesAgain), false);

for (const invalid of ["unknown", null, undefined, false, 0, new String("accessory"), {}]) {
  assert.deepEqual(owner.getEquipmentSlotsForType(invalid), []);
}

console.log("[PASS] equipment slot owner, facade, and strict identity contracts");
