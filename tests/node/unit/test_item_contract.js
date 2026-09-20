import assert from "node:assert/strict";
import { ITEMS } from "../../../src/data/items.js";
import {
  isItemDefinition,
  isItemRef,
  isItemType,
  isRuntimeItemRef,
  resolveItemDefinition
} from "../../../src/state/item.js";
import { isLegacyEquipmentRef } from "../../../src/state/equipment.js";

const validEquipment = {
  kind: "equipment",
  instanceId: "eq-item-contract",
  baseId: "WAND",
  rarity: "magic",
  level: 1,
  identified: false,
  affixes: []
};

assert.equal(isItemType("weapon"), true);
assert.equal(isItemType("rune"), true);
assert.equal(isItemType("material"), false, "unsupported ItemType rejected");
assert.equal(isItemDefinition(ITEMS.WAND), true, "valid ItemDefinition accepted");
assert.equal(isItemDefinition(ITEMS.RUNE_HALITO), true, "rune definition accepted");

for (const field of ["id", "name", "type", "desc"]) {
  const malformed = { ...ITEMS.WAND, [field]: field === "type" ? "unsupported" : "" };
  assert.equal(isItemDefinition(malformed), false, `malformed ${field} rejected`);
}
assert.equal(isItemDefinition({ ...ITEMS.WAND, type: "unsupported" }), false);
assert.equal(isItemDefinition(null), false);
assert.equal(isItemDefinition([]), false);

assert.equal(isItemRef("HEAL_POTION"), true, "non-empty item ID accepted");
assert.equal(isItemRef("UNKNOWN_ITEM_ID"), true, "unknown ID passes shape guard");
assert.equal(isItemRef(""), false, "empty string rejected");
assert.equal(isItemRef("   "), false, "whitespace-only string rejected");
assert.equal(isItemRef(validEquipment), true, "EquipmentInstance accepted as ItemRef");
const legacyEquipment = { baseId: "WAND", instanceId: "legacy-item-contract", affixes: [] };
assert.equal(isItemRef(legacyEquipment), false, "legacy equipment stays outside ItemRef");
assert.equal(isLegacyEquipmentRef(legacyEquipment), true, "supported legacy equipment accepted");
assert.equal(isRuntimeItemRef(legacyEquipment), true, "legacy equipment accepted as RuntimeItemRef");
assert.equal(isLegacyEquipmentRef({ ...legacyEquipment, affixes: [null] }), false, "malformed legacy affix rejected");
assert.equal(isLegacyEquipmentRef({ ...legacyEquipment, level: "floor-3" }), false, "malformed legacy level rejected");
assert.equal(isItemRef({ baseId: "HEAL_POTION" }), false, "malformed EquipmentInstance rejected");
assert.equal(isItemRef({ ...validEquipment, affixes: [null] }), false, "malformed EquipmentInstance affix rejected");
assert.equal(isItemRef({ ...validEquipment, kind: "item" }), false, "malformed EquipmentInstance kind rejected");

assert.equal(resolveItemDefinition("HEAL_POTION", ITEMS), ITEMS.HEAL_POTION);
assert.equal(resolveItemDefinition("UNKNOWN_ITEM_ID", ITEMS), null, "unknown ID misses known lookup");
assert.equal(resolveItemDefinition("", ITEMS), null);
assert.equal(resolveItemDefinition({ baseId: "HEAL_POTION" }, ITEMS), null);

for (const [itemId, item] of Object.entries(ITEMS)) {
  assert.equal(isItemDefinition(item), true, `${itemId} satisfies ItemDefinition common core`);
  assert.equal(item.id, itemId, `${itemId} definition ID matches key`);
}

console.log(`[PASS] ItemDefinition/ItemRef contracts and ${Object.keys(ITEMS).length} ITEMS entries`);
