import assert from "node:assert/strict";
import { STARTING_KITS, createDefaultCurrentRun, createStartingKitCharacter } from "../../../src/state.js";
import { ITEMS } from "../../../src/data/items.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR } from "../../../src/data/equipment_tables.js";
import { canEquipEquipment } from "../../../src/rules/equipment_rules.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { CORE_AFFIXES } from "../../../src/data/affixes.js";
import { getClassPassive } from "../../../src/rules/class_rules.js";
import { checkCharLevelUp } from "../../../src/systems/leveling.js";

assert.deepEqual(
  STARTING_KITS.map(kit => kit.id),
  ["vanguard", "scout", "devotion", "arcana"],
  "departure exposes four named starting kits"
);
assert.equal(createDefaultCurrentRun().startingKit, null);

const baselineKeys = ["name", "class", "level", "exp", "hp", "maxHp", "mp", "maxMp", "str", "int", "pie", "vit", "agi", "luk", "status", "spells"];
const baseline = createStartingKitCharacter(STARTING_KITS[0].id);
assert.equal(baseline.class, "Fighter", "starting kits use a registered compatibility class for legacy progression");
const baselinePassive = getClassPassive(baseline);
for (const kit of STARTING_KITS) {
  const character = createStartingKitCharacter(kit.id);
  assert.equal(character.startingKit, kit.id);
  assert.ok(kit.gear.every(itemId => Object.hasOwn(ITEMS, itemId)), `${kit.id} gear must use known items`);
  assert.ok(
    kit.gear.every(itemId => Object.values(EQUIPMENT_CANDIDATES_BY_FLOOR).some(candidates => candidates.includes(itemId))),
    `${kit.id} gear must come from the regular equipment tables`
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(character.equipment).filter(([, itemId]) => itemId)),
    Object.fromEntries(kit.gear.map(itemId => [ITEMS[itemId].type, itemId])),
    `${kit.id} gear must populate the character equipment slots`
  );
  assert.deepEqual(
    Object.fromEntries(baselineKeys.map(key => [key, character[key]])),
    Object.fromEntries(baselineKeys.map(key => [key, baseline[key]])),
    `${kit.id} must use the common neutral character baseline`
  );
  assert.deepEqual(getClassPassive(character), baselinePassive, `${kit.id} must use the common compatibility passive`);
}

const levelledCharacters = STARTING_KITS.map(kit => {
  const character = createStartingKitCharacter(kit.id);
  character.exp = Number.MAX_SAFE_INTEGER;
  assert.equal(checkCharLevelUp(character, { rng: () => 0.5 }), true, `${kit.id} must reach level 2`);
  assert.equal(checkCharLevelUp(character, { rng: () => 0.5 }), true, `${kit.id} must reach level 3`);
  return Object.fromEntries(baselineKeys.map(key => [key, character[key]]));
});
levelledCharacters.slice(1).forEach(character => assert.deepEqual(character, levelledCharacters[0], "kit choice must not change level growth"));
assert.equal(levelledCharacters[0].level, 3);
assert.equal(levelledCharacters[0].maxHp, 30, "level 2→3 uses the universal +5 HP baseline");
assert.equal(levelledCharacters[0].str, 10, "level up must not grow the compatibility main stat");
assert.equal(levelledCharacters[0].mp, 1, "level up must not grow universal base MP");
assert.deepEqual(levelledCharacters[0].spells, [], "level up must not grant spells");

const fighter = createStartingKitCharacter("vanguard");
assert.equal(canEquipEquipment(fighter, "ARCH_WAND").ok, true, "equipment permission is no longer class-owned");

const mageParty = [createStartingKitCharacter("arcana")];
const crossClassWeapon = generateRandomEquipment(5, {
  forceRarity: "magic",
  rng: () => 0.99,
  party: mageParty,
  allowCores: false
});
assert.equal(crossClassWeapon.baseId, "DRAGON_SCALE", "loot keeps the complete floor pool instead of pruning by class");

const crossClassAccessory = generateRandomAccessory(5, {
  forceRarity: "magic",
  rng: () => 0.7,
  party: mageParty,
  allowCores: false
});
assert.equal(crossClassAccessory.baseId, "DRAGON_RING", "accessory loot is also not pruned by class");
assert.equal(CORE_AFFIXES.some(affix => Object.hasOwn(affix, "allowedClasses")), false, "Core candidates have no class allowlist");

console.log("[PASS] Build vNext class dependency boundary");
