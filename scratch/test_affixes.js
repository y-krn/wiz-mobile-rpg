import assert from "assert";
import {
  AFFIX_BALANCE,
  CORE_AFFIXES,
  SUPPORT_AFFIXES,
  formatAffixText,
  getAffixBudget,
  getAffixDefinition
} from "../src/data/affixes.js";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../src/systems/equipment_generation.js";

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.strictEqual(SUPPORT_AFFIXES.length, 44, "support registry count");
assert.strictEqual(SUPPORT_AFFIXES.filter(affix => affix.enabled).length, 44, "enabled support count");
assert.deepStrictEqual(
  Object.fromEntries(["basic", "conditional", "trigger", "economy"].map(category => [
    category,
    SUPPORT_AFFIXES.filter(affix => affix.category === category).length
  ])),
  { basic: 25, conditional: 11, trigger: 5, economy: 3 }
);
SUPPORT_AFFIXES.forEach(affix => {
  assert.strictEqual(affix.kind, "support");
  assert.ok(affix.cost >= 1 && affix.cost <= 3, `${affix.id} support cost`);
  assert.strictEqual(affix.cost, AFFIX_BALANCE.supportCosts[affix.id]);
});

assert.strictEqual(CORE_AFFIXES.length, 16, "core registry count");
assert.ok(CORE_AFFIXES.every(affix => affix.kind === "core" && affix.cost === 10));
assert.deepStrictEqual(
  CORE_AFFIXES.filter(affix => affix.enabled).map(affix => affix.id),
  CORE_AFFIXES.map(affix => affix.id),
  "Phase 3: all cores enabled"
);
assert.strictEqual(new Set(CORE_AFFIXES.map(affix => affix.id)).size, 16, "core IDs unique");
assert.ok(formatAffixText(CORE_AFFIXES[0]).startsWith("◆背水: HP25%以下"));

for (const [source, generator, expectedCounts] of [
  ["equipment", generateRandomEquipment, { magic: 1, rare: 2, epic: 3 }],
  ["accessory", generateRandomAccessory, { magic: 1, rare: 1, epic: 2 }]
]) {
  for (const [rarity, expectedCount] of Object.entries(expectedCounts)) {
    const item = generator(5, { forceRarity: rarity, rng: lcg(source.length + rarity.length), allowCores: false });
    assert.strictEqual(item.affixes.length, expectedCount, `${source} ${rarity} affix count`);
    assert.ok(item.affixes.every(affix => affix.kind === "support"), `${source} ${rarity} support only`);
    assert.ok(item.affixes.every(affix => affix.id && affix.type && Number.isFinite(affix.value)));
    const cost = item.affixes.reduce((sum, affix) => sum + getAffixDefinition(affix).cost, 0);
    assert.ok(cost <= getAffixBudget(rarity, 5), `${source} ${rarity} budget`);
  }
}

let generatedCore = null;
for (let seed = 1; seed <= 50 && !generatedCore; seed++) {
  const item = generateRandomEquipment(5, { forceRarity: "epic", rng: lcg(seed) });
  if (item.affixes.some(affix => affix.kind === "core")) generatedCore = item;
}
assert.ok(generatedCore, "enabled core enters compatible slot pool");
assert.strictEqual(generatedCore.affixes.filter(affix => affix.kind === "core").length, 1);
assert.strictEqual(generatedCore.affixes.filter(affix => affix.kind === "support").length, 2);

console.log("[PASS] affix registry and budget generation");
