import assert from "assert";
import {
  AFFIX_BALANCE,
  CORE_AFFIXES,
  SUPPORT_AFFIXES,
  formatAffixText,
  getAffixBudget,
  getAffixDefinition,
  getSupportValueByRarity
} from "../../../src/data/affixes.js";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../../../src/systems/equipment_generation.js";
import { ITEMS } from "../../../src/data/items.js";

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.strictEqual(SUPPORT_AFFIXES.length, 47, "support registry count");
assert.strictEqual(SUPPORT_AFFIXES.filter(affix => affix.enabled).length, 47, "enabled support count");
assert.deepStrictEqual(
  Object.fromEntries(["basic", "conditional", "trigger", "economy"].map(category => [
    category,
    SUPPORT_AFFIXES.filter(affix => affix.category === category).length
  ])),
  { basic: 26, conditional: 11, trigger: 7, economy: 3 }
);
SUPPORT_AFFIXES.forEach(affix => {
  assert.strictEqual(affix.kind, "support");
  assert.ok(affix.cost >= 1 && affix.cost <= 3, `${affix.id} support cost`);
  assert.strictEqual(affix.cost, AFFIX_BALANCE.supportCosts[affix.id]);
});

assert.strictEqual(CORE_AFFIXES.length, 18, "core registry count");
assert.ok(CORE_AFFIXES.every(affix => affix.kind === "core" && affix.cost === 10));
assert.ok(CORE_AFFIXES.every(affix => affix.enabled), "all registered cores are enabled");
assert.strictEqual(new Set(CORE_AFFIXES.map(affix => affix.id)).size, 18, "core IDs unique");
assert.ok(formatAffixText(CORE_AFFIXES[0]).startsWith("◆背水: HP40%以下"));
assert.deepStrictEqual(
  getAffixDefinition("CORE_PHYSICAL_ACCURACY"),
  {
    id: "CORE_PHYSICAL_ACCURACY",
    kind: "core",
    jpName: "必中",
    desc: "回避対象への物理攻撃が必ず命中する。",
    slot: "weapon",
    cost: 10,
    params: { hitChanceBonus: 1 },
    buildRole: "reinforce",
    poolGroup: "combat",
    enabled: true
  },
  "physical accuracy core keeps its canonical identity and value"
);
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

function findGeneratedAffix(generator, floor, type, maxSeed = 5000, rarity = "epic") {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const item = generator(floor, {
      forceRarity: rarity,
      rng: lcg(seed),
      allowCores: false
    });
    const affix = item.affixes.find(candidate => candidate.type === type);
    if (affix) return { item, affix };
  }
  return null;
}

for (const generator of [generateRandomEquipment, generateRandomAccessory]) {
  for (const [rarity, expectedValue] of Object.entries(AFFIX_BALANCE.spellPowerByRarity)) {
    const generated = findGeneratedAffix(generator, 2, "spellPower", 5000, rarity);
    assert.ok(generated, `${generator.name} should offer spellPower at B2 (${rarity})`);
    assert.strictEqual(generated.affix.value, expectedValue, `spellPower ${rarity} value`);
    const deeper = findGeneratedAffix(generator, 5, "spellPower", 5000, rarity);
    assert.ok(deeper, `${generator.name} should offer spellPower at B5 (${rarity})`);
    assert.strictEqual(deeper.affix.value, expectedValue, `spellPower ${rarity} must not scale by floor`);
  }
}

let generatedPhysicalAccuracyCore = null;
for (let seed = 1; seed <= 5000 && !generatedPhysicalAccuracyCore; seed++) {
  const item = generateRandomEquipment(5, { forceRarity: "epic", rng: lcg(seed) });
  if (item.affixes.some(affix => affix.id === "CORE_PHYSICAL_ACCURACY")) {
    generatedPhysicalAccuracyCore = item;
  }
}
assert.ok(generatedPhysicalAccuracyCore, "physical accuracy core enters the weapon generation pool");
assert.deepStrictEqual(
  generatedPhysicalAccuracyCore.affixes.find(affix => affix.id === "CORE_PHYSICAL_ACCURACY"),
  { id: "CORE_PHYSICAL_ACCURACY", kind: "core", type: "CORE_PHYSICAL_ACCURACY", value: 1, buildRole: "reinforce" },
  "generated physical accuracy core uses the canonical core payload"
);

for (const generator of [generateRandomEquipment, generateRandomAccessory]) {
  assert.strictEqual(findGeneratedAffix(generator, 1, "antiDemon"), null, "antiDemon is unavailable on B1");
  for (const rarity of ["magic", "rare", "epic"]) {
    assert.strictEqual(
      findGeneratedAffix(generator, 2, "antiDemon", 5000, rarity)?.affix.value,
      getSupportValueByRarity("antiDemon", rarity),
      `antiDemon ${rarity} uses its rarity value`
    );
    assert.strictEqual(
      findGeneratedAffix(generator, 4, "antiDemon", 5000, rarity)?.affix.value,
      getSupportValueByRarity("antiDemon", rarity),
      `antiDemon ${rarity} is floor-independent`
    );
  }
}

for (const rarity of ["magic", "rare", "epic"]) {
  const antiValues = [
    findGeneratedAffix(generateRandomEquipment, 3, "antiUndead", 5000, rarity)?.affix.value,
    findGeneratedAffix(generateRandomAccessory, 4, "antiDragon", 5000, rarity)?.affix.value,
    findGeneratedAffix(generateRandomEquipment, 2, "antiDemon", 5000, rarity)?.affix.value
  ];
  assert.deepStrictEqual(
    antiValues,
    [
      getSupportValueByRarity("antiUndead", rarity),
      getSupportValueByRarity("antiDragon", rarity),
      getSupportValueByRarity("antiDemon", rarity)
    ],
    `antiUndead/antiDragon/antiDemon share the ${rarity} rule`
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
  findGeneratedAffix(generateRandomEquipment, 3, "poisonAtk", 5000, "magic")?.affix.value,
  8,
  "poisonAtk enters the B3 pool at its magic value"
);
assert.strictEqual(
  findGeneratedAffix(generateRandomAccessory, 4, "poisonAtk"),
  null,
  "poisonAtk does not enter the accessory pool"
);
const generatedBleedingAtk = findGeneratedAffix(generateRandomEquipment, 4, "bleedingAtk");
assert.ok(generatedBleedingAtk, "bleedingAtk enters the weapon pool");
assert.strictEqual(generatedBleedingAtk.affix.value, 12, "bleedingAtk scales to 12% on B4");
assert.equal(
  findGeneratedAffix(generateRandomEquipment, 2, "bleedingAtk"),
  null,
  "bleedingAtk is unavailable before B3"
);
assert.equal(
  findGeneratedAffix(generateRandomAccessory, 4, "bleedingAtk"),
  null,
  "bleedingAtk does not enter the accessory pool"
);
const trapBonusValues = [
  [generateRandomEquipment, 1],
  [generateRandomEquipment, 3],
  [generateRandomEquipment, 5],
  [generateRandomAccessory, 1],
  [generateRandomAccessory, 4],
  [generateRandomAccessory, 5]
];
for (const [generator, floor] of trapBonusValues) {
  for (const rarity of ["magic", "rare", "epic"]) {
    const shallow = findGeneratedAffix(generator, floor, "trapBonus", 5000, rarity);
    const deep = findGeneratedAffix(generator, 5, "trapBonus", 5000, rarity);
    assert.strictEqual(shallow?.affix.value, getSupportValueByRarity("trapBonus", rarity), `trapBonus ${rarity} on B${floor}`);
    assert.strictEqual(deep?.affix.value, shallow?.affix.value, `trapBonus ${rarity} is floor-independent`);
  }
}

for (const rarity of ["magic", "rare", "epic"]) {
  const shallow = findGeneratedAffix(generateRandomEquipment, 3, "treasureSense", 5000, rarity);
  const deep = findGeneratedAffix(generateRandomEquipment, 5, "treasureSense", 5000, rarity);
  assert.strictEqual(shallow?.affix.value, getSupportValueByRarity("treasureSense", rarity), `equipment treasureSense ${rarity} value`);
  assert.strictEqual(deep?.affix.value, shallow?.affix.value, `equipment treasureSense ${rarity} is floor-independent`);
}

console.log("[PASS] affix registry and budget generation");
