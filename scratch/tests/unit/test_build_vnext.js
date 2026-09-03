import assert from "node:assert/strict";
import { STARTING_KITS, createDefaultCurrentRun, createStartingKitCharacter } from "../../../src/state.js";
import { ITEMS } from "../../../src/data/items.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR } from "../../../src/data/equipment_tables.js";
import { canEquipEquipment } from "../../../src/rules/equipment_rules.js";
import { generateRandomAccessory, generateRandomEquipment } from "../../../src/systems/equipment_generation.js";
import { CORE_AFFIXES } from "../../../src/data/affixes.js";

assert.deepEqual(
  STARTING_KITS.map(kit => kit.id),
  ["vanguard", "scout", "devotion", "arcana"],
  "departure exposes four named starting kits"
);
assert.equal(createDefaultCurrentRun().startingKit, null);

for (const kit of STARTING_KITS) {
  const character = createStartingKitCharacter(kit.id);
  assert.equal(character.startingKit, kit.id);
  assert.ok(kit.gear.every(itemId => Object.hasOwn(ITEMS, itemId)), `${kit.id} gear must use known items`);
  assert.ok(
    kit.gear.every(itemId => Object.values(EQUIPMENT_CANDIDATES_BY_FLOOR).some(candidates => candidates.includes(itemId))),
    `${kit.id} gear must come from the regular equipment tables`
  );
}

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
