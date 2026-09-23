import assert from "assert";
import { ITEMS } from "../../../src/data/items.js";
import * as facade from "../../../src/rules/item_inventory.js";
import * as owner from "../../../src/rules/item_inventory.ts";

assert.deepStrictEqual(Object.keys(facade).sort(), Object.keys(owner).sort(), "facade exports match owner exports");
for (const name of Object.keys(owner)) {
  assert.strictEqual(facade[name], owner[name], `${name} facade export shares owner identity`);
}

const {
  INVENTORY_CAPACITY,
  getInventoryUsedSlots,
  getInventoryRemainingSlots,
  hasInventorySpace,
  getUsableInventoryItems
} = facade;

assert.equal(INVENTORY_CAPACITY, 20);
assert.equal(getInventoryUsedSlots([]), 0);
assert.equal(getInventoryRemainingSlots([]), 20);
assert.equal(getInventoryUsedSlots(new Array(3)), 3, "sparse holes count toward capacity");
assert.equal(getInventoryRemainingSlots(new Array(3)), 17);
assert.equal(getInventoryRemainingSlots(new Array(20)), 0);
assert.equal(getInventoryRemainingSlots(new Array(24)), 0, "over-capacity inventory clamps to zero");
assert.equal(getInventoryUsedSlots({ length: 4 }), 0, "array-like values are not accepted");
assert.equal(getInventoryRemainingSlots(null), 20);

assert.equal(hasInventorySpace([]), true, "omitted count defaults to one");
assert.equal(hasInventorySpace([], undefined), true, "undefined count defaults to one");
assert.equal(hasInventorySpace([], 20), true, "exact capacity boundary fits");
assert.equal(hasInventorySpace([], 21), false);
assert.equal(hasInventorySpace(new Array(20), 0), true);
assert.equal(hasInventorySpace(new Array(20), -5), true);
assert.equal(hasInventorySpace([], 1.9), true, "fractional count floors");
assert.equal(hasInventorySpace([], "20"), true, "numeric strings coerce");
assert.equal(hasInventorySpace([], true), true);
assert.equal(hasInventorySpace(new Array(20), false), true);
assert.equal(hasInventorySpace(new Array(20), null), true);
assert.equal(hasInventorySpace(new Array(20), Number.NaN), true);
assert.equal(hasInventorySpace([], Number.POSITIVE_INFINITY), false);
assert.equal(hasInventorySpace([], Number.NEGATIVE_INFINITY), true);
const throwingCount = { [Symbol.toPrimitive]() { throw new TypeError("legacy coercion error"); } };
assert.throws(() => hasInventorySpace([], throwingCount), /legacy coercion error/);

let failures = 0;
let checks = 0;

function check(actual, expected, message) {
  checks++;
  try {
    assert.deepStrictEqual(actual, expected, message);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${message}`);
    console.error(error.message);
  }
}

const inventory = [
  "DAGGER",
  "TOWN_PORTAL",
  "HEAL_POTION",
  "ANTIDOTE",
  "HEAL_POTION",
  "STR_POTION",
  "NOISE_BALL",
  "GREATER_HEAL",
  "MANA_POTION"
];

const inventorySnapshot = inventory.slice();
const sorted = getUsableInventoryItems(inventory);
assert.deepStrictEqual(inventory, inventorySnapshot, "usable sorting does not mutate source inventory");
assert.deepStrictEqual(Object.keys(sorted[0]), ["itemKey", "idx", "item"]);
assert.strictEqual(sorted[0].item, ITEMS.HEAL_POTION);
assert.equal(Object.isFrozen(sorted), false);
assert.equal(Object.isFrozen(sorted[0]), false);
check(
  sorted.map(({ itemKey, idx }) => [itemKey, idx]),
  [
    ["HEAL_POTION", 2],
    ["HEAL_POTION", 4],
    ["GREATER_HEAL", 7],
    ["MANA_POTION", 8],
    ["ANTIDOTE", 3],
    ["STR_POTION", 5],
    ["NOISE_BALL", 6],
    ["TOWN_PORTAL", 1]
  ],
  "usable inventory sorts by category, definition order, then original index"
);
check(
  sorted.every(({ item }) => item.type === "usable"),
  true,
  "equipment is excluded from usable inventory"
);

const equipmentRef = {
  kind: "equipment",
  instanceId: "eq-item-inventory",
  baseId: "HEAL_POTION",
  rarity: "magic",
  level: 1,
  identified: false,
  affixes: []
};
const invalidObject = { baseId: "HEAL_POTION" };
const identityResult = getUsableInventoryItems([equipmentRef, invalidObject, "MISSING_ITEM_DEFINITION"]);
check(identityResult.length, 1, "malformed object is fail closed");
check(identityResult[0].itemKey, equipmentRef, "valid object reference identity is preserved");
check(identityResult[0].itemKey === equipmentRef, true, "valid object reference is not cloned");
check(identityResult[0].item, ITEMS.HEAL_POTION, "object item key resolves to canonical definition reference");

const sparseInventory = new Array(5);
sparseInventory[1] = "HEAL_POTION";
sparseInventory[4] = "ANTIDOTE";
const sparseSnapshot = sparseInventory.slice();
const sparseResult = getUsableInventoryItems(sparseInventory);
check(sparseResult.map(({ idx }) => idx), [1, 4], "native map skips sparse holes");
check(Object.hasOwn(sparseInventory, 0), false, "sparse source hole stays a hole");
check(sparseInventory[1], sparseSnapshot[1], "source inventory values remain unchanged");
check(Object.isFrozen(sparseResult), false, "sparse result remains unfrozen");
check(getUsableInventoryItems(null), [], "non-array returns an empty array");
check(getUsableInventoryItems(null) === getUsableInventoryItems(null), false, "non-array returns fresh arrays");

const unregisteredItemKey = "TEST_UNREGISTERED_USABLE";
ITEMS[unregisteredItemKey] = { id: unregisteredItemKey, name: "テスト道具", type: "usable", desc: "テスト用道具" };
check(
  getUsableInventoryItems([unregisteredItemKey, "HEAL_POTION"]).map(({ itemKey }) => itemKey),
  ["HEAL_POTION", unregisteredItemKey],
  "usable item missing from category table falls after known categories"
);
delete ITEMS[unregisteredItemKey];

const lateItemKey = "TEST_LATE_DEFINITION_USABLE";
ITEMS[lateItemKey] = { id: lateItemKey, name: "後付け道具", type: "usable", desc: "テスト用道具" };
const lateResult = getUsableInventoryItems([lateItemKey, "HEAL_POTION", "NOISE_BALL"]);
check(
  lateResult.map(({ itemKey }) => itemKey),
  ["HEAL_POTION", "NOISE_BALL", lateItemKey],
  "module-load definition snapshot places runtime-added items in fallback"
);
check(lateResult.at(-1).item, ITEMS[lateItemKey], "runtime-added definition reference is preserved");
delete ITEMS[lateItemKey];

if (failures > 0) {
  console.error(`Item inventory tests failed: ${failures}/${checks}`);
  process.exit(1);
}

console.log(`Item inventory tests passed: ${checks}`);
