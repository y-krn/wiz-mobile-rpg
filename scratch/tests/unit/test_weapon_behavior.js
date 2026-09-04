import assert from "node:assert/strict";
import {
  ITEMS,
  WEAPON_BEHAVIOR_PROFILES,
  getPhysicalHitChance,
  getWeaponBehaviorProfile,
  resolveWeaponAttack
} from "../../../src/data.js";

const expectedByProfile = {
  light: ["DAGGER", "RAPIER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW"],
  blade: ["SHORT_SWORD", "FIGHTER_SABER", "LONG_SWORD", "FLAME_SWORD", "HOLY_BLADE"],
  impact: ["MACE", "SACRED_MACE"],
  heavy: ["CLAYMORE", "KATANA", "LEGENDARY_SWORD", "SEALED_EXCALIBUR"],
  medium: ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF"]
};

const weaponIds = Object.values(ITEMS)
  .filter(item => item.type === "weapon")
  .map(item => item.id);
assert.equal(weaponIds.length, 21);
assert.deepEqual(
  Object.fromEntries(Object.entries(expectedByProfile).map(([profile, ids]) => [
    profile,
    weaponIds.filter(id => ITEMS[id].behaviorProfile === profile)
  ])),
  expectedByProfile,
  "every weapon is assigned to one authored profile"
);
assert.deepEqual(Object.keys(WEAPON_BEHAVIOR_PROFILES).sort(), ["blade", "heavy", "impact", "light", "medium"]);

function character(weapon) {
  return {
    class: "Fighter",
    level: 1,
    str: 10,
    equipment: { weapon, shield: null, armor: null, accessory: null, accessory2: null }
  };
}

const target = { traits: ["evasive"], evasionChance: 0.2 };
assert.equal(getWeaponBehaviorProfile(character("DAGGER")).id, "light");
assert.equal(getWeaponBehaviorProfile(character("SHORT_SWORD")).id, "blade");
assert.equal(getWeaponBehaviorProfile(character("MACE")).id, "impact");
assert.equal(getWeaponBehaviorProfile(character("CLAYMORE")).id, "heavy");
assert.equal(getWeaponBehaviorProfile(character("WAND")).id, "medium");
assert.equal(getPhysicalHitChance(character("DAGGER"), target), 0.88);
assert.equal(getPhysicalHitChance(character("SHORT_SWORD"), target), 0.8);
assert.equal(getPhysicalHitChance(character("CLAYMORE"), target), 0.75);

const commonInputs = { weaponAtk: 20, str: 10, randRoll: 2, def: 100 };
const blade = resolveWeaponAttack({ char: character("SHORT_SWORD"), ...commonInputs });
const impact = resolveWeaponAttack({ char: character("MACE"), ...commonInputs });
const heavy = resolveWeaponAttack({ char: character("CLAYMORE"), ...commonInputs });
const medium = resolveWeaponAttack({ char: character("WAND"), ...commonInputs });
assert.equal(blade.behaviorProfileId, "blade");
assert.ok(impact.defResistance < blade.defResistance, "impact pays less DEF resistance");
assert.ok(impact.damage > blade.damage, "impact advantage reaches high DEF combat");
assert.ok(heavy.formulaRaw > blade.formulaRaw, "heavy has higher single-hit pressure");
assert.ok(medium.formulaRaw < blade.formulaRaw, "medium is not the physical damage profile");
assert.equal(heavy.behavior.rawDamageMultiplier, 1.1);
assert.equal(impact.behavior.physicalDefenseScale, 52);

console.log("[PASS] weapon behavior profiles and shared resolver");

