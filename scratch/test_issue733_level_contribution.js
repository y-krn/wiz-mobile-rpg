import assert from "node:assert/strict";
import { CLASSES } from "../src/data/classes.js";
import { createSoloCharacter } from "../src/state/initial_state.js";
import { getCharDerivedStats, getCharWeaponAtk } from "../src/rules/character_stats.js";
import { getClassCriticalChance } from "../src/rules/class_rules.js";
import { getSpellStatBonus } from "../src/rules/spell_rules.js";
import { checkCharLevelUp } from "../src/systems/leveling.js";

const EXPECTED_MAIN_STATS = {
  Fighter: "str",
  Thief: "agi",
  Priest: "pie",
  Mage: "int",
  Samurai: "str",
  Bishop: "int",
  Ranger: "agi",
  Ninja: "agi"
};

function levelUpTo(character, targetLevel) {
  character.exp = 999999;
  while (character.level < targetLevel) {
    assert.equal(checkCharLevelUp(character, { rng: () => 0 }), true);
  }
}

function levelUpToWithRngCount(character, targetLevel, value = 0.999) {
  let rngCalls = 0;
  character.exp = 999999;
  while (character.level < targetLevel) {
    assert.equal(checkCharLevelUp(character, {
      rng: () => {
        rngCalls += 1;
        return value;
      }
    }), true);
  }
  return rngCalls;
}

const fighterRngProbe = createSoloCharacter("Fighter");
assert.equal(levelUpToWithRngCount(fighterRngProbe, 3), 3,
  "Fighter Lv1→Lv3 retains HP + one stat-growth RNG draw per level-up");
assert.equal(fighterRngProbe.str, 16,
  "Fighter main stat remains deterministic despite the consumed stat-growth RNG draw");

const unknownRngProbe = { ...createSoloCharacter("Fighter"), class: "Unknown" };
assert.equal(levelUpToWithRngCount(unknownRngProbe, 3), 1,
  "Unknown class retains one stat-growth RNG draw with no HP-growth draw");
assert.equal(unknownRngProbe.vit, 15, "Unknown class retains the vit fallback");

for (const [className, mainStat] of Object.entries(EXPECTED_MAIN_STATS)) {
  assert.equal(CLASSES[className].mainStat, mainStat, `${className} canonical main stat`);
  const character = createSoloCharacter(className);
  const initialStats = Object.fromEntries(
    ["str", "int", "pie", "vit", "agi", "luk"].map(stat => [stat, character[stat]])
  );

  levelUpTo(character, 3);
  assert.equal(character[mainStat], initialStats[mainStat] + 1, `${className} Lv3 main stat`);
  for (const stat of Object.keys(initialStats)) {
    if (stat !== mainStat) assert.equal(character[stat], initialStats[stat], `${className} Lv3 ${stat}`);
  }

  levelUpTo(character, 6);
  assert.equal(character[mainStat], initialStats[mainStat] + 2, `${className} Lv6 main stat`);
  for (const stat of Object.keys(initialStats)) {
    if (stat !== mainStat) assert.equal(character[stat], initialStats[stat], `${className} Lv6 ${stat}`);
  }
}

function levelFourCounterfactual(className, field) {
  const character = createSoloCharacter(className);
  const before = getCharDerivedStats(character)[field];
  levelUpTo(character, 4);
  const after = getCharDerivedStats(character)[field];
  return { before, after, character };
}

const fighter = levelFourCounterfactual("Fighter", "attack");
assert.equal(fighter.character.str, 16, "Fighter Lv1→Lv4 adds STR");
assert.equal(fighter.after - fighter.before, 1, "Fighter physical counterfactual uses STR growth");

const mage = levelFourCounterfactual("Mage", "magic");
assert.equal(mage.character.int, 17, "Mage Lv1→Lv4 adds INT");
assert.equal(mage.after - mage.before, 2, "Mage spell counterfactual uses INT growth");

const priest = levelFourCounterfactual("Priest", "healing");
assert.equal(priest.character.pie, 16, "Priest Lv1→Lv4 adds PIE");
assert.equal(priest.after - priest.before, 2, "Priest heal counterfactual uses PIE growth");

const ninja = createSoloCharacter("Ninja");
assert.equal(getCharWeaponAtk(ninja), 3, "Ninja Lv1 bare-hand weaponAtk is 3");
assert.ok(Math.abs(getClassCriticalChance(ninja) - 0.06) < 1e-12, "Ninja Lv1 critical chance is unchanged");
levelUpTo(ninja, 4);
assert.equal(getCharWeaponAtk(ninja), 12, "Ninja Lv4 bare-hand weaponAtk is exactly 3*level");
assert.ok(Math.abs(getClassCriticalChance(ninja) - 0.09) < 1e-12, "Ninja Lv4 critical chance is exactly the existing level term");
assert.equal(ninja.agi, 13, "Ninja level growth does not add a second weapon/critical level term");

assert.equal(getSpellStatBonus(29), 1.38, "spell stat bonus is below cap at stat 29");
assert.equal(getSpellStatBonus(30), 1.4, "spell stat bonus reaches +40% at stat 30");
assert.equal(getSpellStatBonus(40), 1.4, "spell stat bonus remains capped above stat 30");

console.log("[PASS] Issue #733 level contribution checks");
