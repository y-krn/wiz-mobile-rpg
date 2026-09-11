import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  LOOT_BUILD_AXES,
  LOOT_BUILD_ROLES,
  LOOT_ROLE_SUPPLY_BY_BAND,
  SUPPORT_AFFIXES,
  getLootRoleSupply
} from "../../../src/data/affixes.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../../../src/data/equipment_tables.js";
import { RUNE_SUPPLY_BANDS, getRuneItemIdsByFloor } from "../../../src/data/magic.js";
import {
  generateRandomEquipment,
  rollLootBuildRole
} from "../../../src/systems/equipment_generation.js";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR,
  getChestItemCandidatesByFloor,
  getChestItemWeightsBySource,
  rollChestReward,
  selectChestItemCandidate
} from "../../../src/rules/chest_rules.js";
import { calculateChestInspectionChance, createChestLootHint } from "../../../src/chest/chest_domain.js";
import { ITEMS } from "../../../src/data/items.js";

const roleIds = new Set(Object.values(LOOT_BUILD_ROLES));

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.deepEqual(
  LOOT_ROLE_SUPPLY_BY_BAND.map(band => band.weights),
  [
    { reinforce: 75, convert: 20, pivot: 5 },
    { reinforce: 60, convert: 30, pivot: 10 },
    { reinforce: 55, convert: 30, pivot: 15 },
    { reinforce: 50, convert: 35, pivot: 15 },
    { reinforce: 45, convert: 35, pivot: 20 }
  ],
  "depth bands expose the canonical role supply targets"
);

for (let floor = 1; floor <= 30; floor += 1) {
  assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[floor], `B${floor} equipment candidates exist`);
  assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR[floor], `B${floor} chest candidates exist`);
  EQUIPMENT_CANDIDATES_BY_FLOOR[floor].forEach(baseId => {
    assert.ok(ITEMS[baseId], `B${floor} references known base ${baseId}`);
    assert.ok(["weapon", "armor", "shield"].includes(ITEMS[baseId].type));
  });
}
assert.notDeepEqual(EQUIPMENT_CANDIDATES_BY_FLOOR[6], EQUIPMENT_CANDIDATES_BY_FLOOR[5]);
assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[6].includes("HOLY_BLADE"));
assert.ok(EQUIPMENT_CANDIDATES_BY_FLOOR[11].includes("LEGENDARY_SWORD"));
assert.ok(CHEST_ITEM_CANDIDATES_BY_FLOOR[20].every(baseId => !RESTRICTED_CHEST_BASES.includes(baseId)));

for (const floor of [5, 10, 11, 20]) {
  const equipmentCandidates = EQUIPMENT_CANDIDATES_BY_FLOOR[floor];
  for (const profile of ["light", "blade", "impact", "heavy", "medium"]) {
    assert.ok(
      equipmentCandidates.some(baseId => ITEMS[baseId]?.behaviorProfile === profile),
      `B${floor} keeps ${profile} weapon choices`
    );
  }
  assert.ok(equipmentCandidates.some(baseId => ITEMS[baseId]?.type === "shield"), `B${floor} keeps shields`);
  assert.ok(equipmentCandidates.some(baseId => ITEMS[baseId]?.type === "armor"), `B${floor} keeps armor`);
  assert.ok(
    equipmentCandidates.some(baseId => ITEMS[baseId]?.type === "weapon" && ITEMS[baseId]?.hands === 2),
    `B${floor} keeps two-hand choices`
  );
  const chestEquipment = getChestItemCandidatesByFloor(floor)
    .filter(baseId => ["weapon", "armor", "shield"].includes(ITEMS[baseId]?.type));
  assert.ok(chestEquipment.some(baseId => ITEMS[baseId]?.behaviorProfile === "impact"), `B${floor} chest keeps impact`);
  assert.ok(chestEquipment.some(baseId => ITEMS[baseId]?.behaviorProfile === "heavy"), `B${floor} chest keeps heavy`);
  assert.ok(chestEquipment.some(baseId => ITEMS[baseId]?.behaviorProfile === "medium"), `B${floor} chest keeps medium`);
}

for (const [index, band] of RUNE_SUPPLY_BANDS.entries()) {
  const expected = RUNE_SUPPLY_BANDS
    .slice(0, index + 1)
    .flatMap(supplyBand => supplyBand.spellKeys.map(spellKey => `RUNE_${spellKey}`));
  assert.deepEqual(getRuneItemIdsByFloor(band.minFloor), expected, `${band.id} Rune band is cumulative`);
}

assert.equal(getLootRoleSupply(1).id, "B1_5");
assert.equal(getLootRoleSupply(10).id, "B6_10");
assert.equal(getLootRoleSupply(30).id, "B21_PLUS");
assert.equal(rollLootBuildRole(1, () => 0), "reinforce");
assert.equal(rollLootBuildRole(1, () => 0.751), "convert");
assert.equal(rollLootBuildRole(1, () => 0.951), "pivot");

assert.deepEqual(getChestItemWeightsBySource(1), { HEAL_POTION: 2 });
assert.equal(getChestItemWeightsBySource(1, { fromDrop: true }), null);
assert.equal(
  selectChestItemCandidate(["HEAL_POTION", "ANTIDOTE"], () => 0, { HEAL_POTION: 2 }),
  "HEAL_POTION"
);
assert.equal(
  selectChestItemCandidate(["HEAL_POTION", "ANTIDOTE"], () => 0.99, { HEAL_POTION: 2 }),
  "ANTIDOTE"
);
assert.throws(
  () => selectChestItemCandidate(["HEAL_POTION"], () => 0, { HEAL_POTION: 0 }),
  /positive total weight/
);

CORE_AFFIXES.forEach(affix => assert.ok(roleIds.has(affix.buildRole), `${affix.id} has a loot role`));
CORE_AFFIXES.forEach(affix => assert.ok([LOOT_BUILD_AXES.MAIN, LOOT_BUILD_AXES.AUXILIARY].includes(affix.buildAxis), `${affix.id} has a core axis`));
SUPPORT_AFFIXES.forEach(affix => assert.ok(roleIds.has(affix.buildRole), `${affix.id} has a loot role`));
SUPPORT_AFFIXES.forEach(affix => assert.equal(affix.buildAxis, LOOT_BUILD_AXES.SUPPORT));

for (const floor of [1, 6, 11, 16, 21, 30]) {
  const item = generateRandomEquipment(floor, { forceRarity: "epic", rng: lcg(floor) });
  assert.ok(roleIds.has(item.buildRole), `B${floor} generated item has a role`);
  assert.ok(item.buildRoles.every(role => roleIds.has(role)));
}

const supportOnlyItem = generateRandomEquipment(1, {
  forceRarity: "magic",
  allowCores: false,
  rng: () => 0
});
assert.ok(supportOnlyItem.affixes.length > 0);
assert.ok(supportOnlyItem.affixes.every(affix => affix.kind === "support" && roleIds.has(affix.buildRole)));
assert.ok(supportOnlyItem.buildRoles.includes(supportOnlyItem.affixes[0].buildRole));

function collectAffixRoleRates(floor) {
  const counts = { reinforce: 0, convert: 0, pivot: 0 };
  let total = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const item = generateRandomEquipment(floor, { forceRarity: "epic", allowCores: false, rng: lcg(seed) });
    item.affixes.forEach(affix => {
      if (Object.hasOwn(counts, affix.buildRole)) {
        counts[affix.buildRole] += 1;
        total += 1;
      }
    });
  }
  return Object.fromEntries(Object.entries(counts).map(([role, count]) => [role, count / total]));
}

const shallowAffixRates = collectAffixRoleRates(1);
const deepAffixRates = collectAffixRoleRates(21);
assert.ok([...Object.values(shallowAffixRates), ...Object.values(deepAffixRates)].every(Number.isFinite), "loot role rates remain measurable");

const coreRates = {};
for (const rarity of ["magic", "rare"]) {
  let coreItems = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const item = generateRandomEquipment(5, { forceRarity: rarity, rng: lcg(seed) });
    const coreCount = item.affixes.filter(affix => affix.kind === "core").length;
    assert.ok(coreCount <= 1, `${rarity} item never carries multiple Cores`);
    coreItems += Number(coreCount > 0);
  }
  coreRates[rarity] = coreItems / 1000;
}
assert.ok(coreRates.magic > 0 && coreRates.magic < 0.25, "Magic Core remains a meaningful minority");
assert.ok(coreRates.rare > 0 && coreRates.rare < 0.50, "Rare Core does not fill the removed Core hole");

function createBuildVariant({ startingKit, treasureSense, hp, mp }) {
  return [{
    startingKit,
    status: "ok",
    hp,
    maxHp: 100,
    mp,
    maxMp: 20,
    equipment: {
      weapon: {
        baseId: "WAND",
        identified: true,
        affixes: treasureSense ? [{ id: "treasureSense", type: "treasureSense", kind: "support", value: treasureSense }] : []
      },
      shield: { baseId: "SMALL_SHIELD", identified: true, affixes: [] },
      armor: { baseId: "LEATHER_ARMOR", identified: true, affixes: [] }
    }
  }];
}

const buildA = createBuildVariant({ startingKit: "arcana", treasureSense: 5, hp: 1, mp: 0 });
const buildB = createBuildVariant({ startingKit: "vanguard", treasureSense: 0, hp: 100, mp: 20 });
const sensedInspection = calculateChestInspectionChance({ party: buildA });
const baselineInspection = calculateChestInspectionChance({ party: buildB });
assert.ok(
  sensedInspection.chance > baselineInspection.chance,
  "treasureSense must improve chest trap inspection reliability"
);
assert.equal(baselineInspection.chance, 0.30);
assert.equal(sensedInspection.chance, 0.35);

const hintedEquipment = {
  kind: "equipment",
  rarity: "rare",
  affixes: [{ type: "trapBonus", value: 5 }]
};
const sensedLootHint = createChestLootHint({
  item: hintedEquipment,
  party: buildA,
  rng: () => 0.99
});
const baselineLootHint = createChestLootHint({
  item: hintedEquipment,
  party: buildB,
  rng: () => 0.99
});
assert.match(sensedLootHint.label, /気配:技巧/);
assert.equal(baselineLootHint.label, "装備品の反応あり");

const chestRunState = { chestsOpened: 1, equipmentFound: [{}], b1ChestsOpened: 1, b1EquipFound: 1 };
const chestResultFor = (party, seed) => rollChestReward({
  floor: 3,
  rng: lcg(seed),
  party,
  currentRun: chestRunState,
  trap: "none"
});
const chestSequenceFor = party => Array.from({ length: 500 }, (_, index) => {
  const result = chestResultFor(party, 1078 + index);
  return result.item && typeof result.item === "object"
    ? { baseId: result.item.baseId, rarity: result.item.rarity, affixes: result.item.affixes, lootRole: result.item.lootRole }
    : result.item;
});
assert.deepEqual(
  chestSequenceFor(buildA),
  chestSequenceFor(buildB),
  "chest candidates and replacement weights are invariant to current build, HP/MP, and starting kit"
);

const emptyLoadout = [{
  status: "ok",
  equipment: { weapon: null, shield: null, armor: null }
}];
const occupiedLoadout = [{
  status: "ok",
  equipment: { weapon: { baseId: "SHORT_SWORD" }, shield: null, armor: null }
}];
const sameSeedEmpty = generateRandomEquipment(12, { rng: lcg(991), party: emptyLoadout });
const sameSeedOccupied = generateRandomEquipment(12, { rng: lcg(991), party: occupiedLoadout });
assert.deepEqual(
  sameSeedEmpty,
  sameSeedOccupied,
  "loot generation must not adapt to the currently equipped loadout"
);

console.log("[PASS] B1-B30 loot supply, role bands, deterministic generation, and non-adaptive selection verified.");
