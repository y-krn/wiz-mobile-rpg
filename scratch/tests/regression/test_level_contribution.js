import assert from "node:assert/strict";
import { STARTING_KITS, createStartingKitCharacter } from "../../../src/state.js";
import { getCharDerivedStats, getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import { getClassCriticalChance, getClassPassiveBonus } from "../../../src/rules/class_rules.js";
import { getSpellStatBonus } from "../../../src/rules/spell_rules.js";
import { checkCharLevelUp } from "../../../src/systems/leveling.js";

function levelUpTo(character, targetLevel) {
  character.exp = Number.MAX_SAFE_INTEGER;
  while (character.level < targetLevel) {
    assert.equal(checkCharLevelUp(character, { rng: () => 0.999 }), true);
  }
}

const levelledCharacters = STARTING_KITS.map(kit => {
  const character = createStartingKitCharacter(kit.id);
  const initial = {
    stats: Object.fromEntries(["str", "int", "pie", "vit", "agi", "luk"].map(stat => [stat, character[stat]])),
    mp: character.mp,
    spells: [...character.spells]
  };
  levelUpTo(character, 6);
  assert.equal(character.maxHp, 45, `${kit.id} gets five universal HP gains`);
  assert.deepEqual(
    Object.fromEntries(["str", "int", "pie", "vit", "agi", "luk"].map(stat => [stat, character[stat]])),
    initial.stats,
    `${kit.id} level-up must not grow base stats`
  );
  assert.equal(character.mp, initial.mp, `${kit.id} level-up must not grow MP`);
  assert.deepEqual(character.spells, initial.spells, `${kit.id} level-up must not grant spells`);
  assert.equal(getClassPassiveBonus(character, "killHeal"), 0, `${kit.id} has no class passive`);
  assert.equal(getClassCriticalChance(character), 0, `${kit.id} has no class critical chance`);
  return character;
});

levelledCharacters.slice(1).forEach(character => {
  assert.equal(character.maxHp, levelledCharacters[0].maxHp, "all starting kits share HP growth");
});

const counterfactual = createStartingKitCharacter("vanguard");
counterfactual.equipment = { weapon: null, shield: null, armor: null, accessory: null, accessory2: null };
counterfactual.class = "Ninja";
const before = getCharDerivedStats(counterfactual);
levelUpTo(counterfactual, 4);
const after = getCharDerivedStats(counterfactual);
assert.equal(getCharWeaponAtk(counterfactual), 0, "compatibility class must not add level-scaled bare-hand attack");
assert.equal(getClassCriticalChance(counterfactual), 0, "compatibility class must not add critical chance");
assert.equal(after.attack, before.attack, "level must not add a combat stat contribution");
assert.equal(after.magic, before.magic, "level must not add magic stat contribution");
assert.equal(after.healing, before.healing, "level must not add healing stat contribution");

assert.equal(getSpellStatBonus(29), 1.38, "spell stat bonus is below cap at stat 29");
assert.equal(getSpellStatBonus(30), 1.4, "spell stat bonus reaches +40% at stat 30");
assert.equal(getSpellStatBonus(40), 1.4, "spell stat bonus remains capped above stat 30");

console.log("[PASS] Issue #1044 universal level contribution checks");
