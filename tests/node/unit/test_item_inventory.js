import assert from "assert";
import { ITEMS } from "../../../src/data/items.js";
import { getUsableInventoryItems } from "../../../src/rules/item_inventory.js";

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

const sorted = getUsableInventoryItems(inventory);
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
const identityResult = getUsableInventoryItems([equipmentRef, invalidObject]);
check(identityResult.length, 1, "malformed object is fail closed");
check(identityResult[0].itemKey, equipmentRef, "valid object reference identity is preserved");
check(identityResult[0].itemKey === equipmentRef, true, "valid object reference is not cloned");

const unregisteredItemKey = "TEST_UNREGISTERED_USABLE";
ITEMS[unregisteredItemKey] = { id: unregisteredItemKey, name: "テスト道具", type: "usable", desc: "テスト用道具" };
check(
  getUsableInventoryItems([unregisteredItemKey, "HEAL_POTION"]).map(({ itemKey }) => itemKey),
  ["HEAL_POTION", unregisteredItemKey],
  "usable item missing from category table falls after known categories"
);
delete ITEMS[unregisteredItemKey];

if (failures > 0) {
  console.error(`Item inventory tests failed: ${failures}/${checks}`);
  process.exit(1);
}

console.log(`Item inventory tests passed: ${checks}`);
