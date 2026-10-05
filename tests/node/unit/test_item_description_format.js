import assert from "node:assert/strict";
import { getItemData } from "../../../src/rules/item_rules.js";
import { ITEMS } from "../../../src/data/items.js";

// Identified equipment reads as description, effects, then one closing aside
// for rarity, tags and curse (#2034) — no "[Magic] <系統: …> … […]" brackets.
const plain = getItemData({ kind: "equipment", baseId: "DAGGER", identified: true, affixes: [] });
assert.equal(plain.desc, ITEMS.DAGGER.desc, "no effects and no aside leave the base description as it is");
assert.ok(!plain.desc.includes("[]"), "an item without effects shows no empty brackets");

const magic = getItemData({
  kind: "equipment",
  baseId: "ROBE",
  identified: true,
  rarity: "magic",
  tags: ["spirit", "ward"],
  affixes: [{ type: "mp", value: 1 }]
});
assert.ok(magic.desc.startsWith(ITEMS.ROBE.desc), "the base description comes first");
assert.match(magic.desc, / ／ 最大MP\+1（魔法／系統: 霊・守勢）$/);
assert.doesNotMatch(magic.desc, /\[Magic\]|<系統|Magic|Rare|Epic/);

const rare = getItemData({
  kind: "equipment",
  baseId: "SHORT_SWORD",
  identified: true,
  rarity: "rare",
  tags: ["iron"],
  affixes: [{ type: "atk", value: 2 }, { type: "hp", value: 3 }]
});
assert.match(rare.desc, /（希少／系統: 鉄）$/);
assert.equal(rare.desc.split(" ／ ").length, 3, "each effect is its own segment after the description");

assert.match(
  getItemData({ kind: "equipment", baseId: "SHORT_SWORD", identified: true, rarity: "epic", affixes: [] }).desc,
  /（逸品）$/
);
console.log("[PASS] identified equipment description format");
