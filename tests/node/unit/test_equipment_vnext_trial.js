import assert from "node:assert/strict";
import {
  CANONICAL_BASE_IDS,
  VNEXT_BASE_ITEM_AUDIT,
  VNEXT_CORE_AUDIT,
  VNEXT_SUPPORT_AUDIT
} from "../../../src/data/equipment_vnext.js";
import { ITEMS } from "../../../src/data/items.js";
import { ACCESSORY_CANDIDATES_BY_FLOOR, EQUIPMENT_CANDIDATES_BY_FLOOR } from "../../../src/data/equipment_tables.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { getVNextTrialBaseId, getVNextTrialCandidates, getVNextTrialChestCandidates, isVNextDevotionWeapon, isVNextMediumWeapon, isVNextTrialCore, isVNextTrialSupport, VNEXT_CANONICAL_BASE_REPRESENTATIVES } from "../../../src/rules/equipment_vnext_trial.js";
import { SAVE_KEYS } from "../../../src/save_keys.js";
import { getChestItemCandidatesByFloor, rollChestReward } from "../../../src/rules/chest_rules.js";
import { BUILD_VNEXT_CORE_AFFIXES } from "../../../src/data/affixes.js";

const BUILD_VNEXT_CORE_IDS = new Set(BUILD_VNEXT_CORE_AFFIXES.map(core => core.id));

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.equal(Object.keys(VNEXT_SUPPORT_AUDIT).length, 47);
assert.equal(Object.keys(VNEXT_CORE_AUDIT).length, 13);
assert.equal(VNEXT_SUPPORT_AUDIT.escapeChance.disposition, "retire");
assert.equal(VNEXT_SUPPORT_AUDIT.rearEvasion.disposition, "retire");
assert.equal(VNEXT_SUPPORT_AUDIT.followUpMp.disposition, "keep");
assert.equal(VNEXT_SUPPORT_AUDIT.followUpMp.vnextSupplyConstraint, "medium_weapon_only");
assert.equal(isVNextTrialSupport("followUpMp", { slot: "weapon", baseId: "WAND" }), true);
assert.equal(isVNextTrialSupport("followUpMp", { slot: "weapon", baseId: "MACE" }), false);
assert.equal(isVNextTrialSupport("followUpMp", { slot: "accessory", baseId: "VNEXT_RING" }), false);
assert.equal(VNEXT_SUPPORT_AUDIT.devotion.vnextSupplyConstraint, "wand_or_sage_staff_weapon_only");
assert.equal(VNEXT_SUPPORT_AUDIT.spellAccuracy.vnextSupplyConstraint, "weapon_slot_requires_medium");
assert.equal(VNEXT_CORE_AUDIT.CORE_KEEN_EYE.disposition, "retire");
assert.equal(VNEXT_CORE_AUDIT.CORE_BLOOD_WAND.vnextSupplyConstraint, "medium_weapon_only");
assert.equal(Object.keys(VNEXT_BASE_ITEM_AUDIT).length, 50);
assert.deepEqual(
  Object.values(ITEMS).filter(item => item.trialOnly).map(item => item.id).sort(),
  ["VNEXT_AMULET", "VNEXT_RING"],
  "synthetic canonical accessories stay explicitly trial-only"
);
assert.equal(Object.keys(VNEXT_CANONICAL_BASE_REPRESENTATIVES).length, 14);
assert.deepEqual(Object.keys(VNEXT_CANONICAL_BASE_REPRESENTATIVES).sort(), [...CANONICAL_BASE_IDS].sort());
assert.equal(new Set(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES)).size, 14);
assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).every(id => ITEMS[id]));
assert.deepEqual(
  Object.fromEntries(["keep", "merge", "named", "retire"].map(disposition => [
    disposition,
    Object.values(VNEXT_BASE_ITEM_AUDIT).filter(row => row.disposition === disposition).length
  ])),
  { keep: 14, merge: 24, named: 10, retire: 2 }
);
for (const [id, row] of Object.entries(VNEXT_BASE_ITEM_AUDIT)) {
  if (["keep", "merge"].includes(row.disposition)) {
    assert.ok(getVNextTrialBaseId(id), `${id} maps to an audited canonical Base`);
  } else {
    assert.equal(getVNextTrialBaseId(id), null, `${id} stays out of trial supply`);
  }
}

for (const [floor, candidates] of Object.entries(EQUIPMENT_CANDIDATES_BY_FLOOR)) {
  const canonical = getVNextTrialCandidates(candidates);
  assert.ok(canonical.length > 0, `equipment pool remains nonempty at B${floor}`);
  assert.ok(canonical.every(id => Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(id)));
}
for (const [floor, candidates] of Object.entries(ACCESSORY_CANDIDATES_BY_FLOOR)) {
  const canonical = getVNextTrialCandidates(candidates);
  assert.ok(canonical.length > 0, `accessory pool remains nonempty at B${floor}`);
  assert.ok(canonical.every(id => id === "VNEXT_RING" || id === "VNEXT_AMULET"));
}
for (const floor of [1, 3, 5, 11, 30]) {
  const legacyCandidates = getChestItemCandidatesByFloor(floor, { includeRunes: true });
  const candidates = getVNextTrialChestCandidates(legacyCandidates);
  for (const unavailable of ["WAKE_POWDER", "PARALYZE_CURE", "RUNE_DIALKO"]) {
    assert.ok(!candidates.includes(unavailable), `${unavailable} stays out of Build vNext chest supply`);
  }
  const equipmentCandidates = candidates.filter(id => ITEMS[id]?.type === "weapon" || ITEMS[id]?.type === "armor" || ITEMS[id]?.type === "shield" || ITEMS[id]?.type === "accessory");
  assert.ok(candidates.some(id => !VNEXT_BASE_ITEM_AUDIT[id]), `non-equipment reward retained at B${floor}`);
  assert.ok(equipmentCandidates.length > 0, `canonical chest gear remains at B${floor}`);
  assert.ok(equipmentCandidates.every(id => id === "VNEXT_RING" || id === "VNEXT_AMULET" || Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(id)));
}
assert.ok(getChestItemCandidatesByFloor(1, { includeRunes: true }).includes("WAKE_POWDER"));
assert.ok(getChestItemCandidatesByFloor(2, { includeRunes: true }).includes("PARALYZE_CURE"));
assert.ok(getChestItemCandidatesByFloor(3, { includeRunes: true }).includes("RUNE_DIALKO"));
for (const [floor, excluded] of [[2, "WAKE_POWDER"], [2, "PARALYZE_CURE"], [3, "RUNE_DIALKO"]]) {
  const trialReward = rollChestReward({
    floor, rng: () => 0.1, party: [], currentRun: {},
    trap: "none", itemCandidates: [excluded], includeRunes: true,
    itemCandidateFilter: candidate => candidate === excluded
  });
  assert.equal(trialReward.item, null, `${excluded} is filtered from Build vNext chest rolls`);
}

assert.equal(ITEMS.VNEXT_RING.hpBonus, undefined);
assert.equal(ITEMS.VNEXT_RING.affixBonus, undefined);
assert.equal(ITEMS.VNEXT_AMULET.hpBonus, undefined);
assert.equal(ITEMS.VNEXT_AMULET.mpBonus, undefined);
assert.equal(SAVE_KEYS.save, "mobile_wiz_rpg_autosave");
assert.equal(SAVE_KEYS.backup, "mobile_wiz_rpg_backup");

for (let seed = 1; seed <= 80; seed += 1) {
  const options = { rng: lcg(seed), forceRarity: "epic" };
  const equipment = generateRandomEquipment(30, options);
  const accessory = generateRandomAccessory(30, options);
  assert.ok(equipment, `phase 3 equipment generated for seed ${seed}`);
  assert.ok(accessory, `phase 3 accessory generated for seed ${seed}`);
  assert.equal(equipment.rarity, "epic");
  assert.equal(accessory.rarity, "epic");
  assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(equipment.baseId));
  assert.ok(["VNEXT_RING", "VNEXT_AMULET"].includes(accessory.baseId));
  for (const [item, slot] of [[equipment, "weapon"], [accessory, "accessory"]]) {
    for (const affix of item.affixes) {
      if (affix.kind === "core") assert.ok(isVNextTrialCore(affix.id) || BUILD_VNEXT_CORE_IDS.has(affix.id), affix.id);
      else assert.equal(isVNextTrialSupport(affix.type, { slot, baseId: item.baseId }), true, affix.type);
    }
  }
}

for (const floor of [1, 10, 20]) {
  const options = { rng: lcg(100 + floor), forceRarity: "magic" };
  const equipment = generateRandomEquipment(floor, options);
  const accessory = generateRandomAccessory(floor, options);
  assert.ok(equipment, `Phase 3 Base generated on a B${floor} run`);
  assert.ok(accessory, `Phase 3 accessory generated on a B${floor} run`);
  assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(equipment.baseId));
  assert.ok(["VNEXT_RING", "VNEXT_AMULET"].includes(accessory.baseId));
}

const firstTrialChest = rollChestReward({
  floor: 1,
  rng: lcg(203),
  party: [],
  currentRun: {},
  trap: "none"
});
assert.ok(firstTrialChest.item);
assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(firstTrialChest.item.baseId));
assert.equal(firstTrialChest.item.rarity, "magic");

// Generation needs no profile option: the vNext pool is the only pool.
const defaultEquipment = generateRandomEquipment(5, { rng: lcg(55), forceRarity: "magic" });
const defaultAccessory = generateRandomAccessory(5, { rng: lcg(55), forceRarity: "magic" });
assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(defaultEquipment.baseId));
assert.ok(["VNEXT_RING", "VNEXT_AMULET"].includes(defaultAccessory.baseId));

console.log("PASS Equipment vNext pool, Support/Core, and Base regressions");
