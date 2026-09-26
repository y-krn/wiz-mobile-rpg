import assert from "node:assert/strict";
import {
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { BUILD_VNEXT_CORE_AFFIXES } from "../../../src/data/affixes.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
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
import { TRIAL_PROFILES } from "../../../src/trial_profiles.js";

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

const TRIAL = TRIAL_PROFILES.PHASE3_EQUIPMENT;

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
  const item = generateRandomEquipment(1, { rng: lcg(seed), trialProfile: TRIAL });
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

// The normal profile keeps its unknown-by-default contract and has no grade
// or trial-only Cores.
for (let seed = 1; seed <= 200; seed++) {
  const item = generateRandomEquipment(5, { rng: lcg(seed) });
  assert.equal(item.identified, false);
  assert.equal(item.enhanceLevel, undefined);
  assert.ok(!item.affixes.some(affix => trialOnlyIds.has(affix.id)));
}

// Depth raises the grade of found weapon/armor/shield pieces.
const deepGrades = Array.from({ length: 60 }, (_, index) =>
  generateRandomEquipment(5, { rng: lcg(900 + index), trialProfile: TRIAL }).enhanceLevel || 0);
assert.ok(deepGrades.every(grade => grade >= 2), "B5 finds carry at least +2");

// Forced base/Core are a trial-only generation option.
const forced = generateRandomEquipment(1, {
  rng: lcg(7), trialProfile: TRIAL, forceRarity: "magic", forceBaseId: "MACE", forceCoreId: "CORE_TECH_CHAIN"
});
assert.equal(forced.baseId, "MACE");
assert.equal(forced.affixes[0].id, "CORE_TECH_CHAIN");
const ignored = generateRandomEquipment(1, { rng: lcg(7), forceRarity: "magic", forceBaseId: "MACE", forceCoreId: "CORE_TECH_CHAIN" });
assert.ok(!ignored.affixes.some(affix => affix.id === "CORE_TECH_CHAIN"), "normal profile ignores forced Cores");
const forcedAccessory = generateRandomAccessory(1, {
  rng: lcg(8), trialProfile: TRIAL, forceRarity: "magic", forceBaseId: "VNEXT_RING", forceCoreId: "CORE_TRAP_EATER"
});
assert.equal(forcedAccessory.affixes[0].id, "CORE_TRAP_EATER");

// Build seed offer: three identified, uncursed directions with one Core each.
state.party = [createStartingKitCharacter("vanguard")];
state.inventory = [];
state.floor = 1;
state.logs = [];
state.gameState = "explore";
state.currentRun = createDefaultCurrentRun();
state.currentRun.trialProfile = TRIAL;
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
state.currentRun.trialProfile = TRIAL_PROFILES.NORMAL;
assert.equal(shouldOfferBuildSeed(state), false, "normal runs never see the seed");
state.currentRun.trialProfile = TRIAL;
state.currentRun.buildSeedOffered = true;
assert.equal(shouldOfferBuildSeed(state), false, "the seed is offered once per run");

// Pick-one bundle: seed entries start left behind and at most one is kept.
state.currentRun = createDefaultCurrentRun();
state.currentRun.trialProfile = TRIAL;
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
