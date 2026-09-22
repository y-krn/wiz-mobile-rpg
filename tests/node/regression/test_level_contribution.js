import assert from "node:assert/strict";
import { STARTING_KITS, createStartingKitCharacter } from "../../../src/state.js";
import { EXP_LEVELS } from "../../../src/data/progression.js";
import { getCharDerivedStats, getCharMaxHp, getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import {
  checkCharLevelUp,
  UNIVERSAL_HP_GROWTH,
  UNIVERSAL_LEVEL_UP_EXTRA_HEAL
} from "../../../src/systems/leveling.js";
import * as levelingFacade from "../../../src/systems/leveling.js";
import * as levelingOwner from "../../../src/systems/leveling.ts";

assert.strictEqual(levelingFacade.checkCharLevelUp, levelingOwner.checkCharLevelUp);
assert.strictEqual(levelingFacade.UNIVERSAL_HP_GROWTH, levelingOwner.UNIVERSAL_HP_GROWTH);
assert.strictEqual(levelingFacade.UNIVERSAL_LEVEL_UP_EXTRA_HEAL, levelingOwner.UNIVERSAL_LEVEL_UP_EXTRA_HEAL);

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
  };
  levelUpTo(character, 6);
  assert.equal(character.maxHp, 45, `${kit.id} gets five universal HP gains`);
  assert.deepEqual(
    Object.fromEntries(["str", "int", "pie", "vit", "agi", "luk"].map(stat => [stat, character[stat]])),
    initial.stats,
    `${kit.id} level-up must not grow base stats`
  );
  assert.equal(character.mp, initial.mp, `${kit.id} level-up must not grow MP`);
  assert.equal(Object.hasOwn(character, "spells"), false, `${kit.id} has no legacy spell list`);
  return character;
});

levelledCharacters.slice(1).forEach(character => {
  assert.equal(character.maxHp, levelledCharacters[0].maxHp, "all starting kits share HP growth");
});

const sufficientlyInjured = createStartingKitCharacter("vanguard");
sufficientlyInjured.hp = 10;
sufficientlyInjured.exp = Number.MAX_SAFE_INTEGER;
assert.equal(checkCharLevelUp(sufficientlyInjured), true);
assert.equal(sufficientlyInjured.maxHp, 25);
assert.equal(sufficientlyInjured.hp, 20, "natural +5 and extra +5 recovery both apply");
assert.ok(sufficientlyInjured.hp <= 25, "level-up recovery must not exceed new max HP");

const nearMax = createStartingKitCharacter("vanguard");
nearMax.hp = 18;
nearMax.exp = Number.MAX_SAFE_INTEGER;
assert.equal(checkCharLevelUp(nearMax), true);
assert.equal(nearMax.hp, 25, "extra recovery caps at the remaining 2 HP");

const fullHp = createStartingKitCharacter("vanguard");
fullHp.exp = Number.MAX_SAFE_INTEGER;
assert.equal(checkCharLevelUp(fullHp), true);
assert.equal(fullHp.hp, fullHp.maxHp, "full HP receives natural growth to the new maximum only");
assert.equal(fullHp.hp, 25);

const noLevelUp = createStartingKitCharacter("vanguard");
assert.equal(checkCharLevelUp(noLevelUp), false);
const thresholdBefore = createStartingKitCharacter("vanguard");
thresholdBefore.exp = EXP_LEVELS[2] - 1;
assert.equal(checkCharLevelUp(thresholdBefore), false, "threshold below requirement does not level up");
assert.equal(thresholdBefore.level, 1);
const thresholdExact = createStartingKitCharacter("vanguard");
thresholdExact.exp = EXP_LEVELS[2];
assert.equal(checkCharLevelUp(thresholdExact), true, "threshold equality levels up");
assert.equal(thresholdExact.level, 2);
const hugeExp = createStartingKitCharacter("vanguard");
hugeExp.exp = Number.MAX_SAFE_INTEGER;
assert.equal(checkCharLevelUp(hugeExp), true, "huge EXP still levels once per call");
assert.equal(hugeExp.level, 2);
const maxLevel = createStartingKitCharacter("vanguard");
maxLevel.level = EXP_LEVELS.length - 1;
maxLevel.exp = Number.MAX_SAFE_INTEGER;
assert.equal(checkCharLevelUp(maxLevel), false, "max-level boolean contract remains false");

const derivedHp = createStartingKitCharacter("vanguard");
derivedHp.equipment.accessory = "AMULET_HP";
derivedHp.hp = 10;
derivedHp.exp = EXP_LEVELS[2];
const derivedMaxHpBefore = getCharMaxHp(derivedHp);
assert.equal(checkCharLevelUp(derivedHp), true);
assert.equal(getCharMaxHp(derivedHp) - derivedMaxHpBefore, UNIVERSAL_HP_GROWTH);
assert.equal(derivedHp.hp, 10 + UNIVERSAL_HP_GROWTH + UNIVERSAL_LEVEL_UP_EXTRA_HEAL);

const counterfactual = createStartingKitCharacter("vanguard");
counterfactual.equipment = { weapon: null, shield: null, armor: null, accessory: null, accessory2: null };
const before = getCharDerivedStats(counterfactual);
levelUpTo(counterfactual, 4);
const after = getCharDerivedStats(counterfactual);
assert.equal(getCharWeaponAtk(counterfactual), 0, "compatibility class must not add level-scaled bare-hand attack");
assert.equal(after.attack, before.attack, "level must not add a combat stat contribution");
assert.equal(after.magic, before.magic, "level must not add magic stat contribution");
assert.equal(after.healing, before.healing, "level must not add healing stat contribution");


console.log("[PASS] Issue #1044 universal level contribution checks");
