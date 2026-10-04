import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { BUILD_VNEXT_CORE_AFFIXES } from "../../../src/data/affixes.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { isVNextDevotionWeapon, isVNextMediumWeapon } from "../../../src/rules/equipment_vnext_trial.js";
import {
  BUILD_VNEXT_SUPPLY,
  isBuildVNextGamble,
  rollBuildVNextGrade
} from "../../../src/rules/build_vnext_supply.js";
import {
  BUILD_SEED_CHOICE_ROLE,
  BUILD_SEED_DIRECTIONS,
  generateBuildSeedOffer,
  shouldOfferBuildSeed
} from "../../../src/systems/build_vnext_seed.js";
import { resolvePendingRewardBundle, stagePendingRewardBundle } from "../../../src/pending_rewards.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const dummyElement = () => ({
  style: {}, dataset: {}, className: "", innerHTML: "", textContent: "", children: [],
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild(child) { this.children.push(child); return child; },
  replaceChildren(...children) { this.children = children; },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  querySelector() { return null; }, querySelectorAll() { return []; }
});
globalThis.document = {
  getElementById: () => dummyElement(), querySelector: () => null, querySelectorAll: () => [],
  createElement: dummyElement,
  createTextNode: text => ({ textContent: text })
};

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}


// Grade: expected ≈ floor × gradePerFloor, one uniform draw, capped.
assert.equal(rollBuildVNextGrade(1, () => 0), 0);
assert.equal(rollBuildVNextGrade(1, () => 0.99), 1);
assert.equal(rollBuildVNextGrade(5, () => 0), 2);
assert.equal(rollBuildVNextGrade(30, () => 0.99), BUILD_VNEXT_SUPPLY.maxGrade);

// Legibility: ordinary trial finds are fully understood; gambles stay hidden.
let identified = 0;
let gambles = 0;
let cores = 0;
let trialOnlyCores = 0;
const trialOnlyIds = new Set(BUILD_VNEXT_CORE_AFFIXES.map(core => core.id));
for (let seed = 1; seed <= 300; seed++) {
  const item = generateRandomEquipment(1, { rng: lcg(seed) });
  assert.ok(item);
  if (isBuildVNextGamble(item)) {
    gambles++;
    assert.equal(item.identified, false, "epic or cursed finds stay a gamble");
  } else {
    identified++;
    assert.equal(item.identified, true, "ordinary trial finds are legible");
    assert.equal(item.knowledgeStage, "full");
  }
  const core = item.affixes.find(affix => affix.kind === "core");
  if (core) {
    cores++;
    if (trialOnlyIds.has(core.id)) trialOnlyCores++;
  }
}
assert.ok(identified > gambles, "most trial finds are identified");
assert.ok(cores >= 30, `Cores appear from B1 in the trial (saw ${cores}/300)`);
assert.ok(trialOnlyCores > 0, "technique Cores are part of the trial pool");

// Fixed-seed generator regression: unusable solo affixes are absent, and
// spell-related equipment effects stay on compatible weapon bases.
const forbiddenVNextSupports = new Set(["rearEvasion", "escapeChance"]);
for (const floor of [1, 3, 6, 11, 16, 26]) {
  for (let seed = 1; seed <= 250; seed++) {
    const item = generateRandomEquipment(floor, {
      rng: lcg(seed + floor * 1000), forceRarity: "epic"
    });
    assert.ok(item);
    assert.ok(!item.affixes.some(affix => forbiddenVNextSupports.has(affix.type)), `${item.baseId} has no inert solo Support`);
    if (item.affixes.some(affix => affix.type === "followUpMp")) {
      assert.ok(isVNextMediumWeapon(item.baseId), `followUpMp stays on medium weapons: ${item.baseId}`);
    }
    assert.ok(!item.affixes.some(affix => affix.id === "CORE_KEEN_EYE"), "KEEN_EYE stays out of Build vNext");
    if (item.affixes.some(affix => affix.type === "devotion")) {
      assert.ok(isVNextDevotionWeapon(item.baseId), `devotion stays on WAND/SAGE_STAFF: ${item.baseId}`);
    }
    if (!isVNextMediumWeapon(item.baseId)) {
      assert.ok(!item.affixes.some(affix => affix.id === "CORE_BLOOD_WAND"), `${item.baseId} cannot use BLOOD_WAND`);
      assert.ok(!item.affixes.some(affix => affix.type === "spellAccuracy"), `${item.baseId} cannot use spellAccuracy`);
    } else {
      assert.ok(!item.affixes.some(affix => affix.id === "CORE_TECH_CHAIN"), `${item.baseId} cannot use TECH_CHAIN`);
    }
  }
}

for (const floor of [1, 3, 6, 11, 16, 26]) {
  for (let seed = 1; seed <= 250; seed++) {
    const item = generateRandomAccessory(floor, {
      rng: lcg(seed + floor * 2000), forceRarity: "epic"
    });
    assert.ok(item);
    assert.ok(!item.affixes.some(affix => forbiddenVNextSupports.has(affix.type)), `${item.baseId} accessory has no excluded solo Support`);
    assert.ok(!item.affixes.some(affix => affix.type === "followUpMp"), `${item.baseId} accessory cannot use followUpMp`);
    assert.ok(!item.affixes.some(affix => affix.id === "CORE_KEEN_EYE"), `${item.baseId} accessory has no KEEN_EYE`);
  }
}

// Depth raises the grade of found weapon/armor/shield pieces.
const deepGrades = Array.from({ length: 60 }, (_, index) =>
  generateRandomEquipment(5, { rng: lcg(900 + index) }).enhanceLevel || 0);
assert.ok(deepGrades.every(grade => grade >= 2), "B5 finds carry at least +2");

// Forced base/Core are a generation option used by the build seed.
const forced = generateRandomEquipment(1, {
  rng: lcg(7), forceRarity: "magic", forceBaseId: "MACE", forceCoreId: "CORE_TECH_CHAIN"
});
assert.equal(forced.baseId, "MACE");
assert.equal(forced.affixes[0].id, "CORE_TECH_CHAIN");
const forcedBloodWandOnMace = generateRandomEquipment(1, {
  rng: lcg(9), forceRarity: "magic", forceBaseId: "MACE", forceCoreId: "CORE_BLOOD_WAND"
});
assert.ok(!forcedBloodWandOnMace.affixes.some(affix => affix.id === "CORE_BLOOD_WAND"));
const forcedBloodWandOnMedium = generateRandomEquipment(1, {
  rng: lcg(10), forceRarity: "magic", forceBaseId: "WAND", forceCoreId: "CORE_BLOOD_WAND"
});
assert.equal(forcedBloodWandOnMedium.affixes[0].id, "CORE_BLOOD_WAND");
const forcedChainOnMedium = generateRandomEquipment(1, {
  rng: lcg(11), forceRarity: "magic", forceBaseId: "SAGE_STAFF", forceCoreId: "CORE_TECH_CHAIN"
});
assert.ok(!forcedChainOnMedium.affixes.some(affix => affix.id === "CORE_TECH_CHAIN"));
const forcedAccessory = generateRandomAccessory(1, {
  rng: lcg(8), forceRarity: "magic", forceBaseId: "VNEXT_RING", forceCoreId: "CORE_TRAP_EATER"
});
assert.equal(forcedAccessory.affixes[0].id, "CORE_TRAP_EATER");

// Build seed offer: three identified, uncursed directions with one Core each.
state.party = [createStartingKitCharacter("vanguard")];
state.inventory = [];
state.floor = 1;
state.logs = [];
state.gameState = "explore";
state.currentRun = createDefaultCurrentRun();
assert.equal(shouldOfferBuildSeed(state), true);
assert.equal(shouldOfferBuildSeed(state, { fromDrop: true }), false, "monster-drop chests never carry the seed");
for (let seed = 1; seed <= 20; seed++) {
  const offer = generateBuildSeedOffer(state, lcg(seed));
  assert.equal(offer.length, BUILD_SEED_DIRECTIONS.length);
  offer.forEach((item, index) => {
    assert.equal(item.identified, true);
    assert.equal(item.curseEffectId, null);
    assert.equal(item.affixes.filter(affix => affix.kind === "core").length, 1);
    const allowed = BUILD_SEED_DIRECTIONS[index].options.map(option => option.baseId);
    assert.ok(allowed.includes(item.baseId), `${item.baseId} belongs to direction ${BUILD_SEED_DIRECTIONS[index].id}`);
  });
}
state.currentRun.buildSeedOffered = true;
assert.equal(shouldOfferBuildSeed(state), false, "the seed is offered once per run");

// Pick-one bundle: seed entries start left behind and at most one is kept.
state.currentRun = createDefaultCurrentRun();
const offer = generateBuildSeedOffer(state, lcg(3));
const bundle = stagePendingRewardBundle(state, [
  { item: "HEAL_POTION", role: "main" },
  ...offer.map(item => ({ item, role: BUILD_SEED_CHOICE_ROLE }))
], { choiceRole: BUILD_SEED_CHOICE_ROLE, choiceLimit: 1 });
assert.equal(bundle.choiceLimit, 1);
assert.deepEqual(bundle.entries.map(entry => entry.decision), ["take", "leave", "leave", "leave"]);
bundle.entries[1].decision = "take";
bundle.entries[2].decision = "take";
const rejected = resolvePendingRewardBundle(state);
assert.equal(rejected.ok, false);
assert.match(rejected.reason, /1つだけ/);
bundle.entries[2].decision = "leave";
const accepted = resolvePendingRewardBundle(state);
assert.equal(accepted.ok, true);
assert.equal(state.inventory.length, 2, "the potion and exactly one seed entered the bag");

console.log("[PASS] Build vNext supply: grade, legibility, trial Cores, build seed choice");
