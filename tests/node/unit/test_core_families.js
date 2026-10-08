// Likely Core families (#2061): no floor gate on kinds, three likely families
// per dungeon shown where the dungeon is chosen, the redraw after a run that
// reached the third floor, the treasure's fixing of one family, and the first
// chest's two-likely-one-outside offer.
import { strict as assert } from "node:assert";
import { CORE_FAMILIES, CORE_FAMILY_IDS } from "../../../src/data/core_families.js";
import { BUILD_VNEXT_CORE_AFFIXES, CORE_AFFIXES } from "../../../src/data/affixes.js";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import {
  drawCoreFamilies,
  formatCoreFamilies,
  getAvailableCoreFamilyIds,
  getCoreFamilyForCore,
  pickSeedFamilies,
  pinCoreFamily
} from "../../../src/rules/core_families.js";
import {
  canPinCoreFamily,
  doesRunRedrawCoreFamilies,
  ensureCoreFamilyDraw,
  getDrawableCoreFamilyIds,
  getLikelyCoreFamilies,
  pinCoreFamilyForDungeon,
  settleCoreFamilyRedraw,
  takeCoreFamiliesForRun
} from "../../../src/systems/core_families.js";
import { carriesOutRepeatedTreasure } from "../../../src/systems/dungeon_progress.js";
import {
  generateRandomAccessory,
  generateRandomEquipment,
  getGeneratableCoreIds
} from "../../../src/systems/equipment_generation.js";
import { generateBuildSeedOffer } from "../../../src/systems/build_vnext_seed.js";
import {
  createDefaultCoreFamilyState,
  isNormalizedCoreFamilyState,
  normalizeCoreFamilyState
} from "../../../src/state/core_families_state.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR, ACCESSORY_CANDIDATES_BY_FLOOR } from "../../../src/data/equipment_tables.js";
import { createRng } from "../../../src/seed_rng.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

const NEW_SAVE_FAMILIES = ["technique", "guard", "blood", "curse", "stealth"];
const ALL_UNLOCKED = { ranks: { pool_blood_wand: 1, pool_trap_eater: 1, pool_tomb_raider: 1 }, lateralUnlocks: [] };
const coreOf = item => item?.affixes?.find(affix => affix.kind === "core")?.id || null;
const familyOf = item => getCoreFamilyForCore(coreOf(item))?.id || null;

function newState(seed = "S-1") {
  return {
    seed,
    workshop: { ranks: {}, lateralUnlocks: [] },
    unlockedMilestones: [],
    coreFamilies: createDefaultCoreFamilyState()
  };
}

check("every Core that can appear belongs to exactly one family", () => {
  assert.equal(new Set(CORE_FAMILY_IDS).size, CORE_FAMILY_IDS.length);
  const all = [...CORE_AFFIXES, ...BUILD_VNEXT_CORE_AFFIXES].map(affix => affix.id);
  const listed = CORE_FAMILIES.flatMap(family => family.coreIds);
  assert.equal(new Set(listed).size, listed.length, "a Core is in one family only");
  listed.forEach(id => assert.ok(all.includes(id), `${id} is a Core`));
  getGeneratableCoreIds(null).forEach(id => assert.ok(getCoreFamilyForCore(id), `${id} has a family`));
});

check("a family is drawn only while one of its Cores can appear", () => {
  assert.deepEqual(getAvailableCoreFamilyIds(getGeneratableCoreIds([])), NEW_SAVE_FAMILIES);
  assert.deepEqual(getAvailableCoreFamilyIds(getGeneratableCoreIds(null)), CORE_FAMILY_IDS);
  assert.deepEqual(getDrawableCoreFamilyIds(newState()), NEW_SAVE_FAMILIES);
  assert.deepEqual(getDrawableCoreFamilyIds({ ...newState(), workshop: ALL_UNLOCKED }), CORE_FAMILY_IDS);
});

check("the draw is three different families, the same for the same seed and draw", () => {
  const a = drawCoreFamilies("S-1", 0, "collapsed_mine", CORE_FAMILY_IDS);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(drawCoreFamilies("S-1", 0, "collapsed_mine", CORE_FAMILY_IDS), a);
  const seen = new Set();
  for (let draw = 0; draw < 30; draw += 1) {
    seen.add(drawCoreFamilies("S-1", draw, "collapsed_mine", CORE_FAMILY_IDS).slice().sort().join());
  }
  assert.ok(seen.size >= 8, `redraws move the board (${seen.size} distinct of 30)`);
  assert.equal(formatCoreFamilies(["technique", "guard", "curse"]), "技・構え・呪い");
  const avoided = drawCoreFamilies("S-1", 0, "forgotten_catacomb", CORE_FAMILY_IDS, [a]);
  assert.notDeepEqual([...avoided].sort(), [...a].sort(), "a draw equal to another dungeon's is drawn again");
});

check("a new save draws every dungeon on first use, from its own seed", () => {
  const state = newState("S-7");
  const mine = getLikelyCoreFamilies(state, "collapsed_mine");
  assert.equal(mine.length, 3);
  mine.forEach(id => assert.ok(NEW_SAVE_FAMILIES.includes(id)));
  DUNGEONS.forEach(dungeon => assert.equal(state.coreFamilies.byDungeon[dungeon.id].length, 3));
  for (let seed = 0; seed < 40; seed += 1) {
    const draw = ensureCoreFamilyDraw(newState(`seed-${seed}`)).byDungeon;
    assert.notEqual([...draw.collapsed_mine].sort().join(), [...draw.forgotten_catacomb].sort().join(), `seed-${seed}`);
  }
  assert.deepEqual(getLikelyCoreFamilies(newState("S-7"), "collapsed_mine"), mine);
  assert.ok(isNormalizedCoreFamilyState(state.coreFamilies));
});

check("only a run that reached the third floor of its dungeon redraws, whatever the outcome", () => {
  assert.equal(doesRunRedrawCoreFamilies({ deepestFloor: 2 }), false);
  assert.equal(doesRunRedrawCoreFamilies({ deepestFloor: 3 }), true);
  assert.equal(doesRunRedrawCoreFamilies({ deepestFloor: 7 }), false, "catacomb B2");
  assert.equal(doesRunRedrawCoreFamilies({ deepestFloor: 8 }), true, "catacomb B3");
  const state = newState();
  const before = JSON.stringify(ensureCoreFamilyDraw(state).byDungeon);
  assert.deepEqual(settleCoreFamilyRedraw(state, { deepestFloor: 2 }), { redrawn: false, treasurePin: false });
  assert.equal(JSON.stringify(state.coreFamilies.byDungeon), before);
  // Redraws until the board moves; the draw count always advances.
  let moved = false;
  for (let index = 1; index <= 5 && !moved; index += 1) {
    assert.deepEqual(settleCoreFamilyRedraw(state, { deepestFloor: 4, outcome: "death" }), { redrawn: true, treasurePin: false });
    assert.equal(state.coreFamilies.draws, index);
    moved = JSON.stringify(state.coreFamilies.byDungeon) !== before;
  }
  assert.ok(moved);
});

check("a run takes its dungeon's families and a later redraw does not change them", () => {
  const state = newState();
  const party = [{}];
  const taken = takeCoreFamiliesForRun(state, 6);
  party[0].likelyCoreFamilies = taken;
  assert.deepEqual(taken, state.coreFamilies.byDungeon.forgotten_catacomb);
  settleCoreFamilyRedraw(state, { deepestFloor: 3 });
  assert.deepEqual(party[0].likelyCoreFamilies, taken);
});

check("a treasure carried out again fixes one family of one open dungeon, once, before the next departure", () => {
  const state = { ...newState(), unlockedMilestones: [5] };
  assert.equal(carriesOutRepeatedTreasure(state, { defeatedMilestones: [5] }), true);
  assert.equal(carriesOutRepeatedTreasure(newState(), { defeatedMilestones: [5] }), false, "the first time opens a dungeon");
  assert.equal(carriesOutRepeatedTreasure(state, { defeatedMilestones: [5], roundTrip: { treasure: false } }), false);

  settleCoreFamilyRedraw(state, { deepestFloor: 5 }, { treasure: true });
  assert.equal(state.coreFamilies.treasurePin, true);
  assert.equal(canPinCoreFamily(state, "rift_nest"), false, "a closed dungeon cannot be fixed");
  assert.equal(pinCoreFamilyForDungeon(state, "forgotten_catacomb", "trap"), false, "a family that cannot appear");
  const drawn = [...state.coreFamilies.byDungeon.forgotten_catacomb];
  const outside = NEW_SAVE_FAMILIES.find(id => !drawn.includes(id));
  assert.equal(pinCoreFamilyForDungeon(state, "forgotten_catacomb", outside), true);
  assert.deepEqual(state.coreFamilies.byDungeon.forgotten_catacomb, [outside, drawn[0], drawn[1]]);
  assert.deepEqual(state.coreFamilies.pinned, { dungeonId: "forgotten_catacomb", familyId: outside });
  assert.equal(state.coreFamilies.treasurePin, false);
  assert.equal(pinCoreFamilyForDungeon(state, "collapsed_mine", outside), false, "only once");

  // Not used before departing: it is gone.
  settleCoreFamilyRedraw(state, { deepestFloor: 5 }, { treasure: true });
  assert.equal(state.coreFamilies.pinned, null);
  takeCoreFamiliesForRun(state, 1);
  assert.equal(state.coreFamilies.treasurePin, false);
  assert.deepEqual(pinCoreFamily(["a", "b", "c"], "b"), ["b", "a", "c"]);
});

check("the saved draw normalizes, and a save without one loads as not drawn yet", () => {
  assert.deepEqual(normalizeCoreFamilyState(undefined), createDefaultCoreFamilyState());
  assert.deepEqual(normalizeCoreFamilyState({
    draws: 2,
    byDungeon: { collapsed_mine: ["technique", "guard", "curse"], nowhere: ["technique"], forgotten_catacomb: ["x"] },
    treasurePin: true,
    pinned: { dungeonId: "collapsed_mine", familyId: "technique" }
  }), {
    draws: 2,
    byDungeon: { collapsed_mine: ["technique", "guard", "curse"] },
    treasurePin: true,
    pinned: { dungeonId: "collapsed_mine", familyId: "technique" }
  });
  assert.equal(isNormalizedCoreFamilyState({ draws: -1, byDungeon: {}, treasurePin: false, pinned: null }), false);
});

check("no floor gate on kinds: every base and Support can appear on the first floor", () => {
  for (let floor = 1; floor <= 5; floor += 1) {
    assert.deepEqual(EQUIPMENT_CANDIDATES_BY_FLOOR[floor], EQUIPMENT_CANDIDATES_BY_FLOOR[5]);
    assert.deepEqual(ACCESSORY_CANDIDATES_BY_FLOOR[floor], ACCESSORY_CANDIDATES_BY_FLOOR[5]);
  }
  const rng = createRng("no-gate");
  const bases = new Set();
  const supports = new Set();
  for (let index = 0; index < 4000; index += 1) {
    const item = generateRandomEquipment(1, { rng, allowCores: false });
    bases.add(item.baseId);
    item.affixes.forEach(affix => supports.add(affix.type));
    generateRandomAccessory(1, { rng, allowCores: false }).affixes.forEach(affix => supports.add(affix.type));
  }
  ["CLAYMORE", "PLATE_MAIL", "SAGE_STAFF", "LARGE_SHIELD", "MAGIC_SHIELD"].forEach(base => assert.ok(bases.has(base), `${base} on B1`));
  ["guardian", "followUp", "killHeal", "poisonAtk", "bleedingAtk", "arcane"].forEach(type => assert.ok(supports.has(type), `${type} on B1`));
});

function familyCounts(likelyCoreFamilies, seed) {
  const rng = createRng(seed);
  const counts = {};
  const party = [{ unlockedAffixIds: [], likelyCoreFamilies }];
  for (let index = 0; index < 6000; index += 1) {
    const item = index % 3 === 0
      ? generateRandomAccessory(2, { rng, party })
      : generateRandomEquipment(2, { rng, party });
    const family = familyOf(item);
    if (family) counts[family] = (counts[family] || 0) + 1;
  }
  return counts;
}

check("the likely families come more often, and the others still come", () => {
  const plain = familyCounts(null, "families");
  const likely = familyCounts(["blood", "stealth", "curse"], "families");
  const other = familyCounts(["technique", "guard", "curse"], "families");
  ["blood", "stealth"].forEach(id => {
    assert.ok(likely[id] > other[id] * 1.8, `${id}: likely ${likely[id]} vs not ${other[id]}`);
    assert.ok(other[id] > 0, `${id} still appears when not likely`);
  });
  ["technique", "guard"].forEach(id => assert.ok(other[id] > likely[id] * 1.8, `${id}`));
  const total = counts => Object.values(counts).reduce((sum, value) => sum + value, 0);
  const ratio = total(likely) / total(plain);
  assert.ok(ratio > 0.75 && ratio < 1.25, `about as many Cores overall (${ratio.toFixed(2)})`);
});

check("the first chest offers two likely families and one from outside them", () => {
  const likely = ["technique", "guard", "blood"];
  for (let index = 0; index < 200; index += 1) {
    const rng = createRng(`seed-offer-${index}`);
    const picked = pickSeedFamilies(likely, NEW_SAVE_FAMILIES, rng);
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked).size, 3);
    assert.equal(picked.filter(id => likely.includes(id)).length, 2);
  }
  const state = { floor: 1, party: [{ unlockedAffixIds: [], likelyCoreFamilies: likely }] };
  const outsiders = new Set();
  for (let index = 0; index < 60; index += 1) {
    const offer = generateBuildSeedOffer(state, createRng(`offer-${index}`));
    assert.equal(offer.length, 3);
    const families = offer.map(familyOf);
    assert.equal(families.filter(id => likely.includes(id)).length, 2, families.join());
    families.filter(id => !likely.includes(id)).forEach(id => outsiders.add(id));
    assert.ok(!families.includes("trap"), "a Core still locked by the Workshop is not offered");
  }
  assert.deepEqual([...outsiders].sort(), ["curse", "stealth"]);
  // A run saved before #2061 keeps the old weapon / defense / accessory offer.
  const legacy = generateBuildSeedOffer({ floor: 1, party: [{}] }, createRng("legacy"));
  assert.deepEqual(legacy.map(item => coreOf(item) !== null), [true, true, true]);
});

if (failures > 0) {
  console.error(`${failures} core family check(s) failed`);
  process.exit(1);
}
console.log("core family checks passed");
