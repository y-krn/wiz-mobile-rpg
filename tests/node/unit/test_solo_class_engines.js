import assert from "node:assert/strict";
import { getCharAffixSum, getCharDerivedStats } from "../../../src/data.js";
import { getActiveSpellKeys } from "../../../src/rules/magic_rules.js";
import { calculateChestDisarmChance } from "../../../src/rules/trap_rules.js";
import { checkCharLevelUp } from "../../../src/systems/leveling.js";
import { createStartingKitCharacter } from "../../../src/state.js";

const kitIds = ["vanguard", "scout", "devotion", "arcana"];
const characters = kitIds.map(createStartingKitCharacter);

for (const character of characters) {
  assert.equal(Object.hasOwn(character, "class"), false);
  assert.equal(Object.hasOwn(character, "spells"), false);
  assert.equal(getCharDerivedStats(character, { floor: 5 }).trap, 64);
  assert.equal(calculateChestDisarmChance({ className: "legacy" }), 0.25);
}

assert.equal(getCharAffixSum(characters[0], "trapBonus"), 0);
assert.deepEqual(getActiveSpellKeys(characters[0]), []);
assert.deepEqual(getActiveSpellKeys(characters[3]), ["HALITO"]);

for (const character of characters) {
  const beforeHp = character.maxHp;
  const beforeStats = [character.str, character.int, character.pie, character.vit, character.agi, character.luk];
  character.exp = 999999;
  assert.equal(checkCharLevelUp(character, { rng: () => 0 }), true);
  assert.equal(character.maxHp - beforeHp, 5);
  assert.deepEqual(
    [character.str, character.int, character.pie, character.vit, character.agi, character.luk],
    beforeStats
  );
}

console.log("[PASS] classless starting kits, Rune spell access, and universal level growth");
