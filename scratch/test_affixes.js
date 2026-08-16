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
import { ITEMS } from "../src/data/items.js";

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.strictEqual(SUPPORT_AFFIXES.length, 45, "support registry count");
assert.strictEqual(SUPPORT_AFFIXES.filter(affix => affix.enabled).length, 45, "enabled support count");
assert.deepStrictEqual(
  Object.fromEntries(["basic", "conditional", "trigger", "economy"].map(category => [
    category,
    SUPPORT_AFFIXES.filter(affix => affix.category === category).length
  ])),
  { basic: 25, conditional: 11, trigger: 6, economy: 3 }
);
SUPPORT_AFFIXES.forEach(affix => {
  assert.strictEqual(affix.kind, "support");
  assert.ok(affix.cost >= 1 && affix.cost <= 3, `${affix.id} support cost`);
  assert.strictEqual(affix.cost, AFFIX_BALANCE.supportCosts[affix.id]);
});

assert.strictEqual(CORE_AFFIXES.length, 17, "core registry count");
assert.ok(CORE_AFFIXES.every(affix => affix.kind === "core" && affix.cost === 10));
assert.ok(CORE_AFFIXES.every(affix => affix.enabled), "all registered cores are enabled");
assert.strictEqual(new Set(CORE_AFFIXES.map(affix => affix.id)).size, 17, "core IDs unique");
assert.ok(formatAffixText(CORE_AFFIXES[0]).startsWith("◆背水: HP40%以下"));
assert.ok(
  getAffixDefinition("guardian").desc.includes("HP25%以下"),
  "guardian description states its activation condition"
);

for (const [source, generator, expectedCounts] of [
  ["equipment", generateRandomEquipment, { magic: 1, rare: 2, epic: 3 }],
  ["accessory", generateRandomAccessory, { magic: 1, rare: 1, epic: 2 }]
]) {
  for (const [rarity, expectedCount] of Object.entries(expectedCounts)) {
    const item = generator(5, { forceRarity: rarity, rng: lcg(source.length + rarity.length), allowCores: false });
    assert.strictEqual(item.affixes.length, expectedCount, `${source} ${rarity} affix count`);
    assert.ok(item.affixes.every(affix => affix.kind === "support"), `${source} ${rarity} support only`);
    assert.ok(item.affixes.every(affix => affix.id && affix.type && Number.isFinite(affix.value)));
    assert.ok(
      item.affixes.filter(affix => affix.type === "trapBonus").length <= 1,
      `${source} ${rarity} does not roll duplicate trapBonus affixes`
    );
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

function findGeneratedAffix(generator, floor, type, maxSeed = 5000) {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const item = generator(floor, {
      forceRarity: "epic",
      rng: lcg(seed),
      allowCores: false
    });
    const affix = item.affixes.find(candidate => candidate.type === type);
    if (affix) return { item, affix };
  }
  return null;
}

function collectGeneratedAffixValues(generator, floor, type, maxSeed = 5000) {
  const values = new Set();
  for (let seed = 1; seed <= maxSeed; seed++) {
    const item = generator(floor, {
      forceRarity: "epic",
      rng: lcg(seed),
      allowCores: false
    });
    item.affixes
      .filter(affix => affix.type === type)
      .forEach(affix => values.add(affix.value));
  }
  return [...values].sort((a, b) => a - b);
}

for (const generator of [generateRandomEquipment, generateRandomAccessory]) {
  assert.strictEqual(
    findGeneratedAffix(generator, 1, "antiDemon"),
    null,
    "antiDemon is unavailable on B1"
  );
  assert.strictEqual(
    findGeneratedAffix(generator, 2, "antiDemon")?.affix.value,
    15,
    "antiDemon enters the B2 pool at 15%"
  );
  assert.strictEqual(
    findGeneratedAffix(generator, 4, "antiDemon")?.affix.value,
    25,
    "antiDemon scales to 25% on B4"
  );
}
const generatedAntiDemonEquipment = findGeneratedAffix(
  generateRandomEquipment,
  2,
  "antiDemon"
);
assert.strictEqual(
  ITEMS[generatedAntiDemonEquipment.item.baseId].type,
  "weapon",
  "equipment antiDemon is limited to weapons"
);

// #313: 毒刃は前衛が自力で状態異常を撒ける唯一の供給経路。武器限定で生成される。
const generatedPoisonAtk = findGeneratedAffix(generateRandomEquipment, 4, "poisonAtk");
assert.ok(generatedPoisonAtk, "poisonAtk enters the equipment pool");
assert.strictEqual(generatedPoisonAtk.affix.value, 12, "poisonAtk scales to 12% on B4");
assert.strictEqual(
  ITEMS[generatedPoisonAtk.item.baseId].type,
  "weapon",
  "poisonAtk is limited to weapons"
);
assert.strictEqual(
  findGeneratedAffix(generateRandomEquipment, 2, "poisonAtk"),
  null,
  "poisonAtk is unavailable before B3, matching the other trigger supports"
);
assert.strictEqual(
  findGeneratedAffix(generateRandomEquipment, 3, "poisonAtk")?.affix.value,
  8,
  "poisonAtk enters the B3 pool at 8%"
);
assert.strictEqual(
  findGeneratedAffix(generateRandomAccessory, 4, "poisonAtk"),
  null,
  "poisonAtk does not enter the accessory pool"
);
const trapBonusValues = [
  [generateRandomEquipment, 1, [5, 10]],
  [generateRandomEquipment, 3, [10, 15]],
  [generateRandomEquipment, 5, [15, 20]],
  [generateRandomAccessory, 1, [5, 10]],
  [generateRandomAccessory, 4, [10, 15]],
  [generateRandomAccessory, 5, [15]]
];
for (const [generator, floor, expected] of trapBonusValues) {
  assert.deepStrictEqual(
    collectGeneratedAffixValues(generator, floor, "trapBonus"),
    expected,
    `trapBonus values on B${floor}`
  );
}

console.log("[PASS] affix registry and budget generation");
