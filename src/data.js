// Re-exports for backward compatibility
export * from "./constants/directions.js";
export * from "./constants/map.js";
export * from "./constants/events.js";
export * from "./data/progression.js";
export * from "./data/magic.js";
export * from "./data/weapon_behavior_profiles.js";
export * from "./rules/magic_rules.js";
export {
  getItemBaseId,
  isSpecialOrQuestItem,
  getEffectiveHealAmount,
  getCharAffixSum,
  getPartyMaxAffix,
  getEquippedItemData
} from "./rules/item_rules.js";
export * from "./rules/character_stats.js";
export * from "./rules/affix_rules.js";
export * from "./rules/identification_rules.js";
export * from "./rules/spell_rules.js";
export * from "./rules/boss_rules.js";
export * from "./systems/leveling.js";
export * from "./data/affixes.js";
export * from "./data/key_items.js";
export * from "./data/status_treatments.js";
export * from "./data/floor_templates.js";
export * from "./data/encounters.js";
export * from "./data/floor_trials.js";
export * from "./data/biomes.js";
export {
  getBandIndexForFloor,
  getFloorRole,
  getBandTrialForRun,
  getBandTrialForFloor,
  getStoredBandTrial,
  getTrialAffinityWeight,
  getTrialAffinityMatches,
  getTrialEncounterSizeWeights,
  getTrialRareWeight,
  getBandClue,
  getTrialGuardianPressures
} from "./rules/floor_trials.js";
export * from "./rules/depth_scaling.js";
export * from "./rules/equipment_hands.js";
export * from "./rules/guard_rules.js";


import { MONSTERS as STATIC_MONSTERS } from "./data/monsters.js";
import { ITEM_EFFECTS } from "./systems/item_effects.js";
import { generateRandomAccessory as newGenerateRandomAccessory, generateRandomEquipment as newGenerateRandomEquipment } from "./systems/equipment_generation.js";
import { getItemData as baseGetItemData, getItemBaseId } from "./rules/item_rules.js";

export const MONSTERS = STATIC_MONSTERS;
export { ITEMS } from "./data/items.js";
export { SPELLS } from "./data/spells.js";
export {
  describeMonsterTraits,
  describeMonsterResistances,
  getMonsterResistanceStatus,
  getMonsterResistanceTier,
  getMonsterPhysicalResistance,
  MONSTER_TRAIT_LABELS,
  MONSTER_STATUS_ATTACK_PATTERNS
} from "./data/monsters.js";

// Legacy positional facade kept for scratch simulations and compatibility.
// Production callers should import systems/equipment_generation.js and pass
// one options object.
// Pass `party` explicitly for lateral unlock and build-role generation state;
// callers holding state should pass state.party.
export function generateRandomEquipment(floor, forceRarity = null, rng = Math.random, party = null, excludeHighEnd = false, allowCores = true) {
  return newGenerateRandomEquipment(floor, { forceRarity, rng, party, excludeHighEnd, allowCores });
}

export function generateRandomAccessory(floor, forceRarity = null, rng = Math.random, party = null, allowCores = true) {
  return newGenerateRandomAccessory(floor, { forceRarity, rng, party, allowCores });
}

export function getItemData(itemOrKey) {
  const item = baseGetItemData(itemOrKey);
  if (!item) return null;
  const baseId = getItemBaseId(itemOrKey);
  if (ITEM_EFFECTS[baseId]) {
    return {
      ...item,
      effect: (char, party = null, options = {}) => {
        return ITEM_EFFECTS[baseId]({ char, rng: options?.rng || Math.random, party });
      }
    };
  }
  return item;
}
