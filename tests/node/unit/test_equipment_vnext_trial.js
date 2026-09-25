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
import { getVNextTrialBaseId, getVNextTrialCandidates, getVNextTrialChestCandidates, isVNextTrialCore, isVNextTrialSupport, VNEXT_CANONICAL_BASE_REPRESENTATIVES } from "../../../src/rules/equipment_vnext_trial.js";
import { TRIAL_PROFILES, TRIAL_SAVE_NAMESPACE, getTrialSaveNamespace, isTrialProfile, isTrialStorageSelected } from "../../../src/trial_profiles.js";
import { getChestItemCandidatesByFloor, rollChestReward } from "../../../src/rules/chest_rules.js";

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

assert.equal(Object.keys(VNEXT_SUPPORT_AUDIT).length, 47);
assert.equal(Object.keys(VNEXT_CORE_AUDIT).length, 13);
assert.equal(Object.keys(VNEXT_BASE_ITEM_AUDIT).length, 50);
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
  const candidates = getVNextTrialChestCandidates(getChestItemCandidatesByFloor(floor, { includeRunes: true }));
  const equipmentCandidates = candidates.filter(id => ITEMS[id]?.type === "weapon" || ITEMS[id]?.type === "armor" || ITEMS[id]?.type === "shield" || ITEMS[id]?.type === "accessory");
  assert.ok(candidates.some(id => !VNEXT_BASE_ITEM_AUDIT[id]), `non-equipment reward retained at B${floor}`);
  assert.ok(equipmentCandidates.length > 0, `canonical chest gear remains at B${floor}`);
  assert.ok(equipmentCandidates.every(id => id === "VNEXT_RING" || id === "VNEXT_AMULET" || Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(id)));
}

assert.equal(ITEMS.VNEXT_RING.hpBonus, undefined);
assert.equal(ITEMS.VNEXT_RING.affixBonus, undefined);
assert.equal(ITEMS.VNEXT_AMULET.hpBonus, undefined);
assert.equal(ITEMS.VNEXT_AMULET.mpBonus, undefined);
assert.equal(isTrialProfile(TRIAL_PROFILES.PHASE3_EQUIPMENT), true);
assert.equal(isTrialProfile(TRIAL_PROFILES.NORMAL), false);
assert.equal(isTrialStorageSelected("?tryout=vnext"), true);
assert.equal(isTrialStorageSelected(""), false);
assert.equal(getTrialSaveNamespace({ search: "" }), TRIAL_SAVE_NAMESPACE.normal);
assert.equal(getTrialSaveNamespace({ search: "?tryout=vnext" }), TRIAL_SAVE_NAMESPACE.trial);
assert.equal(getTrialSaveNamespace({ search: "", trialProfile: TRIAL_PROFILES.PHASE3_EQUIPMENT }), TRIAL_SAVE_NAMESPACE.trial);
assert.notEqual(TRIAL_SAVE_NAMESPACE.normal.save, TRIAL_SAVE_NAMESPACE.trial.save);
assert.notEqual(TRIAL_SAVE_NAMESPACE.normal.backup, TRIAL_SAVE_NAMESPACE.trial.backup);

for (let seed = 1; seed <= 80; seed += 1) {
  const options = { rng: lcg(seed), forceRarity: "epic", trialProfile: TRIAL_PROFILES.PHASE3_EQUIPMENT };
  const equipment = generateRandomEquipment(30, options);
  const accessory = generateRandomAccessory(30, options);
  assert.ok(equipment, `phase 3 equipment generated for seed ${seed}`);
  assert.ok(accessory, `phase 3 accessory generated for seed ${seed}`);
  assert.equal(equipment.rarity, "epic");
  assert.equal(accessory.rarity, "epic");
  assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(equipment.baseId));
  assert.ok(["VNEXT_RING", "VNEXT_AMULET"].includes(accessory.baseId));
  for (const affix of [...equipment.affixes, ...accessory.affixes]) {
    if (affix.kind === "core") assert.equal(isVNextTrialCore(affix.id), true, affix.id);
    else assert.equal(isVNextTrialSupport(affix.type), true, affix.type);
  }
}

for (const floor of [1, 10, 20]) {
  const options = { rng: lcg(100 + floor), forceRarity: "magic", trialProfile: TRIAL_PROFILES.PHASE3_EQUIPMENT };
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
  currentRun: { trialProfile: TRIAL_PROFILES.PHASE3_EQUIPMENT },
  trap: "none"
});
assert.ok(firstTrialChest.item);
assert.ok(Object.values(VNEXT_CANONICAL_BASE_REPRESENTATIVES).includes(firstTrialChest.item.baseId));
assert.equal(firstTrialChest.item.rarity, "magic");

const normalEquipment = generateRandomEquipment(5, { rng: lcg(55), forceRarity: "magic" });
const normalAccessory = generateRandomAccessory(5, { rng: lcg(55), forceRarity: "magic" });
assert.ok(normalEquipment && !normalEquipment.baseId.startsWith("VNEXT_"));
assert.ok(normalAccessory && !normalAccessory.baseId.startsWith("VNEXT_"));

console.log("PASS Equipment vNext trial profile, pool, Support/Core, and Base regressions");
