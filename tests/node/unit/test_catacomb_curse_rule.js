// The catacomb's rule (#2063): finds are cursed more often and a cursed find
// is one grade better for it; the altar can lift one known curse, from a piece
// worn or carried. The mine keeps its own supply.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonCurseRule, getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { ALTAR_UNCURSE_MATERIAL_COST, getAltarCursedItems } from "../../../src/rules/special_rooms.js";
import { purifyEquipmentCurse } from "../../../src/systems/identification.js";

function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mine = DUNGEONS.find(dungeon => dungeon.id === "collapsed_mine");
const catacomb = DUNGEONS.find(dungeon => dungeon.id === "forgotten_catacomb");
const mineFloor = getDungeonEntryFloor(mine.index) + 2;
const catacombFloor = getDungeonEntryFloor(catacomb.index) + 2;

// One rule, in one line, only where it has been built.
assert.equal(getDungeonRule(catacombFloor)?.id, "curse");
assert.match(getDungeonRule(catacombFloor).line, /^呪い：/);
assert.equal(getDungeonCurseRule(mineFloor), null);
assert.equal(getDungeonRule(mineFloor)?.id, "noise");
assert.equal(getDungeonCurseRule(0), null);

function sample(generate, floor, count = 2000) {
  const rng = seededRng(2063);
  const finds = Array.from({ length: count }, () => generate(floor, { rng }));
  const cursed = finds.filter(item => item.curseEffectId);
  return { finds, cursed, share: cursed.length / finds.length };
}

for (const generate of [generateRandomEquipment, generateRandomAccessory]) {
  const inCatacomb = sample(generate, catacombFloor);
  const inMine = sample(generate, mineFloor);
  const rule = getDungeonCurseRule(catacombFloor);
  // Cursed about as often as the rule says, and clearly more than in the mine.
  assert.ok(Math.abs(inCatacomb.share - rule.curseChance) < 0.05, `${generate.name}: ${inCatacomb.share}`);
  assert.ok(inCatacomb.share > inMine.share + 0.2, `${generate.name}: catacomb ${inCatacomb.share} vs mine ${inMine.share}`);
  // A cursed find is one grade better: never the lowest grade.
  assert.ok(inCatacomb.cursed.every(item => item.rarity !== "magic"), `${generate.name}: a cursed magic find`);
  assert.ok(inCatacomb.finds.some(item => !item.curseEffectId && item.rarity === "magic"));
  // A forced grade is kept even when the find is cursed.
  const forced = Array.from({ length: 200 }, (_, index) =>
    generate(catacombFloor, { rng: seededRng(index + 1), forceRarity: "magic" }));
  assert.ok(forced.some(item => item.curseEffectId));
  assert.ok(forced.every(item => item.rarity === "magic"));
}

// The altar lists known curses, worn ones first, then carried ones; an
// unidentified piece is not known to be cursed and is not listed.
const cursedFind = sample(generateRandomEquipment, catacombFloor, 50).cursed;
const [worn, carried, hidden] = cursedFind.slice(0, 3).map(item => structuredClone(item));
worn.identified = true;
carried.identified = true;
hidden.identified = false;
const hero = { equipment: { weapon: worn } };
const listed = getAltarCursedItems(hero, ["HEAL_POTION", carried, hidden]);
assert.deepEqual(listed.map(entry => entry.item), [worn, carried]);
assert.equal(listed[0].slot, "weapon");
assert.equal(listed[1].index, 1);
assert.ok(ALTAR_UNCURSE_MATERIAL_COST > 0);

// Lifting the curse keeps the better grade and its affixes.
const before = { rarity: worn.rarity, affixes: structuredClone(worn.affixes) };
assert.equal(purifyEquipmentCurse(worn).ok, true);
assert.equal(worn.curseEffectId, null);
assert.equal(worn.rarity, before.rarity);
assert.deepEqual(worn.affixes, before.affixes);
assert.deepEqual(getAltarCursedItems(hero, []), []);

console.log("[PASS] the catacomb curses more finds, a cursed find is a grade better, and the altar lifts a known curse");
