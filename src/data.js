// Re-exports for backward compatibility
export * from "./constants/directions.js";
export * from "./constants/map.js";
export * from "./constants/events.js";
export * from "./data/progression.js";
export * from "./rules/class_rules.js";
export * from "./rules/item_rules.js";
export * from "./rules/character_stats.js";
export * from "./rules/spell_rules.js";
export * from "./systems/leveling.js";

// Re-export constants/data with wrapper compatibility
import { ITEMS as STATIC_ITEMS } from "./data/items.js";
import { MONSTERS as STATIC_MONSTERS } from "./data/monsters.js";
import { SPELLS as STATIC_SPELLS } from "./data/spells.js";
import { ITEM_EFFECTS } from "./systems/item_effects.js";
import { SPELL_EFFECTS } from "./systems/spell_effects.js";
import { generateRandomEquipment as newGenerateRandomEquipment } from "./systems/equipment_generation.js";

export const MONSTERS = STATIC_MONSTERS;

// Build compatible SPELLS with inline .effect calls
export const SPELLS = {};
for (const [key, val] of Object.entries(STATIC_SPELLS)) {
  SPELLS[key] = {
    ...val,
    effect: (arg1, arg2) => {
      // arg1 is caster, arg2 is target, targets or state depending on spell type
      return SPELL_EFFECTS[key]({
        caster: arg1,
        target: arg2,
        rng: Math.random
      });
    }
  };
}

// Build compatible ITEMS with inline .effect calls
export const ITEMS = {};
for (const [key, val] of Object.entries(STATIC_ITEMS)) {
  ITEMS[key] = { ...val };
  if (ITEM_EFFECTS[key]) {
    ITEMS[key].effect = (char) => {
      return ITEM_EFFECTS[key]({ char, rng: Math.random });
    };
  }
}

let globalState = null;
export function registerState(stateObj) {
  globalState = stateObj;
}

export function generateRandomEquipment(floor, forceRarity = null, rng = Math.random) {
  return newGenerateRandomEquipment(floor, {
    forceRarity,
    rng,
    party: globalState ? globalState.party : null
  });
}
