import assert from "node:assert/strict";
import {
  INVENTORY_CAPACITY,
  addInventoryItemToState,
  getInventoryRemainingSlots,
  getInventoryUsedSlots,
  hasInventorySpace
} from "../../../src/state/inventory_state.js";

const stateLike = { inventory: [] };

assert.equal(INVENTORY_CAPACITY, 20);
assert.equal(getInventoryUsedSlots(stateLike.inventory), 0);
assert.equal(getInventoryRemainingSlots(stateLike.inventory), 20);
assert.equal(hasInventorySpace(stateLike.inventory, 20), true);

assert.equal(addInventoryItemToState(stateLike, "HEAL_POTION"), true);
assert.equal(addInventoryItemToState(stateLike, "HEAL_POTION"), true);
assert.equal(stateLike.inventory.length, 2, "consumables use one slot per item and never stack");

for (let index = stateLike.inventory.length; index < INVENTORY_CAPACITY; index += 1) {
  assert.equal(addInventoryItemToState(stateLike, {
    kind: "equipment",
    baseId: index % 2 === 0 ? "LONG_SWORD" : "AMULET_HP",
    instanceId: `bag-${index}`
  }), true);
}
assert.equal(getInventoryUsedSlots(stateLike.inventory), INVENTORY_CAPACITY);
assert.equal(getInventoryRemainingSlots(stateLike.inventory), 0);
assert.equal(hasInventorySpace(stateLike.inventory), false);
assert.equal(addInventoryItemToState(stateLike, "GREATER_HEAL"), false);
assert.equal(stateLike.inventory.length, INVENTORY_CAPACITY);

const equippedState = {
  inventory: stateLike.inventory.slice(),
  party: [{ equipment: { weapon: { baseId: "CLAYMORE", instanceId: "equipped" } } }]
};
assert.equal(getInventoryUsedSlots(equippedState.inventory), INVENTORY_CAPACITY, "equipped placement is not part of the bag array");
assert.equal(addInventoryItemToState(equippedState, "ANTIDOTE"), false);

console.log("[PASS] fixed 20-slot inventory counts each carried item without stacking");
