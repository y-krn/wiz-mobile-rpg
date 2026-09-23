// balance-impact: none — Phase 0 vocabulary only. This module must stay disconnected from
// production generation, affix calculation, combat, and UI paths.

export const CANONICAL_BASE_IDS = Object.freeze([
  "dagger",
  "sword",
  "mace",
  "greatsword",
  "wand",
  "staff",
  "lightArmor",
  "mediumArmor",
  "heavyArmor",
  "smallShield",
  "largeShield",
  "magicShield",
  "ring",
  "amulet"
]);

export const CANONICAL_BASES = Object.freeze({
  dagger: Object.freeze({ id: "dagger", slot: "weapon", hands: 1, load: "light", weaponProfile: "light" }),
  sword: Object.freeze({ id: "sword", slot: "weapon", hands: 1, load: "standard", weaponProfile: "blade" }),
  mace: Object.freeze({ id: "mace", slot: "weapon", hands: 1, load: "standard", weaponProfile: "impact" }),
  greatsword: Object.freeze({ id: "greatsword", slot: "weapon", hands: 2, load: "heavy", weaponProfile: "heavy" }),
  wand: Object.freeze({ id: "wand", slot: "weapon", hands: 1, load: "standard", weaponProfile: "medium", medium: true, runeSlots: 1 }),
  staff: Object.freeze({ id: "staff", slot: "weapon", hands: 2, load: "standard", weaponProfile: "medium", medium: true, runeSlots: 2 }),
  lightArmor: Object.freeze({ id: "lightArmor", slot: "armor", load: "light" }),
  mediumArmor: Object.freeze({ id: "mediumArmor", slot: "armor", load: "standard" }),
  heavyArmor: Object.freeze({ id: "heavyArmor", slot: "armor", load: "heavy" }),
  smallShield: Object.freeze({ id: "smallShield", slot: "shield", hands: 1, load: "light", guardProfile: "light" }),
  largeShield: Object.freeze({ id: "largeShield", slot: "shield", hands: 1, load: "heavy", guardProfile: "physical" }),
  magicShield: Object.freeze({ id: "magicShield", slot: "shield", hands: 1, load: "standard", guardProfile: "arcane" }),
  ring: Object.freeze({ id: "ring", slot: "accessory" }),
  amulet: Object.freeze({ id: "amulet", slot: "accessory" })
});

export const NAMED_RULE_IDS = Object.freeze([
  "venom_fang",
  "moonshadow",
  "flame_blade",
  "holy_oath",
  "muramasa",
  "excalibur",
  "archmage_staff",
  "aegis",
  "dragon_scale"
]);

export const NAMED_RULES = Object.freeze({
  venom_fang: Object.freeze({ id: "venom_fang", baseId: "dagger" }),
  moonshadow: Object.freeze({ id: "moonshadow", baseId: "dagger" }),
  flame_blade: Object.freeze({ id: "flame_blade", baseId: "sword" }),
  holy_oath: Object.freeze({ id: "holy_oath", baseId: "sword" }),
  muramasa: Object.freeze({ id: "muramasa", baseId: "greatsword" }),
  excalibur: Object.freeze({ id: "excalibur", baseId: "greatsword" }),
  archmage_staff: Object.freeze({ id: "archmage_staff", baseId: "staff" }),
  aegis: Object.freeze({ id: "aegis", baseId: "largeShield" }),
  dragon_scale: Object.freeze({ id: "dragon_scale", baseId: "heavyArmor" })
});

// Support vocabulary from the Phase 3a production audit. Values, rarity
// composition, and production eligibility remain future implementation work.
export const VNEXT_SUPPORT_IDS = Object.freeze([
  "hp", "mp", "def",
  "spellGuard", "statusResistance", "escapeChance", "trapBonus", "trapGuard",
  "treasureSense", "arcaneSense", "hearRange", "traceRead", "followUp",
  "arcane", "devotion", "guardian", "firstStrike", "physicalAccuracy", "spellAccuracy",
  "longFightDamage", "frontlineGuard", "rearEvasion", "fullHpDamage", "openingAttack",
  "firstStrikeDefense", "lowHpDamage", "highHpTargetDamage", "killHeal", "followUpMp",
  "hitFlinch", "poisonAtk", "bleedingAtk", "stairsHeal", "firstStrikeFollowUp",
  "identifyDiscount", "materialFind", "contractReward"
]);

export const VNEXT_SUPPORTS = Object.freeze(Object.fromEntries(
  VNEXT_SUPPORT_IDS.map(id => [id, Object.freeze({ id })])
));

// Candidate vocabulary is intentionally separate from the adopted Phase 0
// vocabulary. Adoption requires the later Support/Core boundary decision.
export const VNEXT_SUPPORT_CANDIDATE_IDS = Object.freeze([
  "guardCounter", "guardFortify", "guardRuneBoost", "attackRuneBoost", "runeAttackBoost",
  "longFightDefense"
]);

export const VNEXT_SUPPORT_CANDIDATES = Object.freeze(Object.fromEntries(
  VNEXT_SUPPORT_CANDIDATE_IDS.map(id => [id, Object.freeze({ id })])
));

// Production inventory review for Equipment vNext Phase 3a. Design data only:
// keep this module disconnected from generation, affix calculation, combat,
// exploration, and economy runtime paths.
export const VNEXT_SUPPORT_AUDIT = Object.freeze({
  atk: { productionId: "atk", disposition: "retire", reasonCode: "raw_atk_vertical_upgrade", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js"] },
  def: { productionId: "def", disposition: "keep", reasonCode: "small_defensive_filler", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js"] },
  hp: { productionId: "hp", disposition: "keep", reasonCode: "resource_capacity_filler", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js"] },
  mp: { productionId: "mp", disposition: "keep", reasonCode: "resource_capacity_filler", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js"] },
  antiUndead: { productionId: "antiUndead", disposition: "retire", reasonCode: "enemy_tag_entry_ticket", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  antiDragon: { productionId: "antiDragon", disposition: "retire", reasonCode: "enemy_tag_entry_ticket", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/combat_logic/damage.js"] },
  antiDemon: { productionId: "antiDemon", disposition: "retire", reasonCode: "enemy_tag_entry_ticket", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  poisonWard: { productionId: "poisonWard", disposition: "retire", targetId: "statusResistance", reasonCode: "narrow_resistance_duplicate", currentStatus: "duplicate", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js", "src/chest.js"] },
  spellGuard: { productionId: "spellGuard", disposition: "keep", reasonCode: "incoming_spell_mitigation", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/damage.js"] },
  trapBonus: { productionId: "trapBonus", disposition: "keep", reasonCode: "trap_interaction_support", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js", "src/movement.js"] },
  trapGuard: { productionId: "trapGuard", disposition: "keep", reasonCode: "trap_risk_mitigation", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/systems/traps.js", "src/chest.js"] },
  treasureSense: { productionId: "treasureSense", disposition: "keep", reasonCode: "exploration_information", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js", "src/chest/chest_domain.ts"] },
  arcaneSense: { productionId: "arcaneSense", disposition: "keep", reasonCode: "secret_route_information", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/menu/explore_actions.js", "src/state/renderer_view.ts"] },
  hearRange: { productionId: "hearRange", disposition: "keep", reasonCode: "exploration_information", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/movement.js"] },
  traceRead: { productionId: "traceRead", disposition: "keep", reasonCode: "exploration_information", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/systems/traps.js"] },
  followUp: { productionId: "followUp", disposition: "keep", reasonCode: "extra_action_chance", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  spellPower: { productionId: "spellPower", disposition: "retire", reasonCode: "broad_spell_power_overlaps_specializations", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js", "src/systems/spell_effects.js"] },
  arcane: { productionId: "arcane", disposition: "keep", reasonCode: "offensive_spell_specialization", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js", "src/systems/spell_effects.js"] },
  devotion: { productionId: "devotion", disposition: "keep", reasonCode: "healing_spell_specialization", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js", "src/systems/spell_effects.js"] },
  guardian: { productionId: "guardian", disposition: "keep", reasonCode: "low_health_defense_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/damage.js"] },
  firstStrike: { productionId: "firstStrike", disposition: "keep", reasonCode: "initiative_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/turn_order.js"] },
  physicalAccuracy: { productionId: "physicalAccuracy", disposition: "keep", reasonCode: "evasion_answer", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/character_stats.js"] },
  escapeChance: { productionId: "escapeChance", disposition: "keep", reasonCode: "retreat_success_support", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/item_resolution.js"] },
  deepAssault: { productionId: "deepAssault", disposition: "change", targetId: "longFightDamage", reasonCode: "depth_gate_is_not_combat_condition", currentStatus: "legacy", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  frontGuard: { productionId: "frontGuard", disposition: "change", targetId: "frontlineGuard", reasonCode: "position_condition_needs_role_semantic", currentStatus: "legacy", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  rearEvasion: { productionId: "rearEvasion", disposition: "keep", reasonCode: "formation_position_defense", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  fullHpDamage: { productionId: "fullHpDamage", disposition: "keep", reasonCode: "high_health_damage_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  firstTurnAttack: { productionId: "firstTurnAttack", disposition: "change", targetId: "openingAttack", reasonCode: "turn_index_is_legacy_condition", currentStatus: "legacy", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  antiBeast: { productionId: "antiBeast", disposition: "retire", reasonCode: "enemy_tag_entry_ticket", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  antiSpirit: { productionId: "antiSpirit", disposition: "retire", reasonCode: "enemy_tag_entry_ticket", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  firstStrikeDefense: { productionId: "firstStrikeDefense", disposition: "keep", reasonCode: "opening_defense_synergy", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  statusResistance: { productionId: "statusResistance", disposition: "keep", reasonCode: "broad_status_mitigation", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  spellAccuracy: { productionId: "spellAccuracy", disposition: "keep", reasonCode: "spell_hit_specialization", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  lowHpDamage: { productionId: "lowHpDamage", disposition: "keep", reasonCode: "low_health_damage_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  highHpTargetDamage: { productionId: "highHpTargetDamage", disposition: "keep", reasonCode: "durable_target_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  bossDamage: { productionId: "bossDamage", disposition: "retire", reasonCode: "boss_only_target_condition", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  killHeal: { productionId: "killHeal", disposition: "keep", reasonCode: "defeat_triggered_recovery", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/damage.js"] },
  followUpMp: { productionId: "followUpMp", disposition: "keep", reasonCode: "action_resource_exchange", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  hitFlinch: { productionId: "hitFlinch", disposition: "keep", reasonCode: "received_hit_control_trigger", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/damage.js"] },
  poisonAtk: { productionId: "poisonAtk", disposition: "keep", reasonCode: "status_application_trigger", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  bleedingAtk: { productionId: "bleedingAtk", disposition: "keep", reasonCode: "status_application_trigger", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/round.js"] },
  victoryMaterial: { productionId: "victoryMaterial", disposition: "retire", reasonCode: "duplicate_material_acquisition", currentStatus: "duplicate", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/rewards.js"] },
  stairsHeal: { productionId: "stairsHeal", disposition: "keep", reasonCode: "exploration_progress_recovery", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/movement.js"] },
  firstStrikeFollowUp: { productionId: "firstStrikeFollowUp", disposition: "keep", reasonCode: "opening_action_synergy", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js"] },
  identifyDiscount: { productionId: "identifyDiscount", disposition: "keep", reasonCode: "equipment_identification_economy", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/systems/identification.ts"] },
  materialFind: { productionId: "materialFind", disposition: "keep", reasonCode: "material_discovery_economy", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/rewards.js"] },
  contractReward: { productionId: "contractReward", disposition: "keep", reasonCode: "contract_progress_economy", currentStatus: "active", productionSupply: true, productionConsumer: true, consumerEvidence: ["src/combat_logic/rewards.js", "src/result.js"] }
});

export const VNEXT_CORE_IDS = Object.freeze([
  "blood_wand",
  "trap_eater",
  "curse_keeper",
  "thorn_shield",
  "executioner",
  "thin_ice_pact",
  "sneak_step",
  "tomb_raider",
  "keen_eye",
  "purify_ring"
]);

export const VNEXT_CORES = Object.freeze(Object.fromEntries(
  VNEXT_CORE_IDS.map(id => [id, Object.freeze({ id })])
));

export const VNEXT_CORE_CANDIDATE_IDS = Object.freeze([
  "overmix",
  "discarded_baggage_smoke"
]);

export const VNEXT_CORE_CANDIDATES = Object.freeze(Object.fromEntries(
  VNEXT_CORE_CANDIDATE_IDS.map(id => [id, Object.freeze({ id })])
));

const ITEM_ID_TO_CANONICAL_BASE = Object.freeze({
  DAGGER: "dagger",
  RAPIER: "dagger",
  NINJA_DAGGER: "dagger",
  NINJA_BLADE: "dagger",
  VENOM_FANG: "dagger",
  MOONSHADOW: "dagger",
  SHORT_SWORD: "sword",
  FIGHTER_SABER: "sword",
  LONG_SWORD: "sword",
  FLAME_SWORD: "sword",
  HOLY_BLADE: "sword",
  MACE: "mace",
  SACRED_MACE: "mace",
  CLAYMORE: "greatsword",
  KATANA: "greatsword",
  LEGENDARY_SWORD: "greatsword",
  SEALED_EXCALIBUR: "greatsword",
  WAND: "wand",
  HOLY_STAFF: "wand",
  SAGE_STAFF: "staff",
  ARCH_WAND: "staff",
  ROBE: "lightArmor",
  MAGE_CLOAK: "lightArmor",
  ARCANE_ROBE: "lightArmor",
  SORCERER_ROBE: "lightArmor",
  EXPLORER_CLOAK: "lightArmor",
  NINJA_SUIT: "lightArmor",
  BATTLE_GARB: "lightArmor",
  LEATHER_ARMOR: "mediumArmor",
  SCALE_MAIL: "mediumArmor",
  CHAIN_MAIL: "mediumArmor",
  PRIEST_ROBE: "mediumArmor",
  PLATE_MAIL: "heavyArmor",
  DRAGON_SCALE: "heavyArmor",
  SMALL_SHIELD: "smallShield",
  BUCKLER: "smallShield",
  LARGE_SHIELD: "largeShield",
  KNIGHT_SHIELD: "largeShield",
  MAGIC_SHIELD: "magicShield",
  LEGENDARY_SHIELD: "largeShield",
  DRAGON_CHARM: "magicShield",
  AMULET_HP: "amulet",
  AMULET_MP: "amulet",
  RING_STR: "ring",
  RING_AGI: "ring",
  THIEF_EYE: "ring",
  WARD_CHARM: "amulet",
  DRAGON_RING: "ring",
  HOLY_BAND: "ring",
  SWIFT_BAND: "ring"
});

const ITEM_ID_TO_NAMED_RULE = Object.freeze({
  VENOM_FANG: "venom_fang",
  MOONSHADOW: "moonshadow",
  FLAME_SWORD: "flame_blade",
  HOLY_BLADE: "holy_oath",
  KATANA: "muramasa",
  LEGENDARY_SWORD: "excalibur",
  SEALED_EXCALIBUR: "excalibur",
  ARCH_WAND: "archmage_staff",
  LEGENDARY_SHIELD: "aegis",
  DRAGON_SCALE: "dragon_scale"
});

// The map is data, not an adapter in any production item or loot path.
export const ITEM_ID_TO_VNEXT_BASE = ITEM_ID_TO_CANONICAL_BASE;
export const ITEM_ID_TO_VNEXT_NAMED_RULE = ITEM_ID_TO_NAMED_RULE;

const PRODUCTION_CORE_TO_VNEXT = Object.freeze({
  CORE_BLOOD_WAND: "blood_wand",
  CORE_TRAP_EATER: "trap_eater",
  CORE_CURSE_KEEPER: "curse_keeper",
  CORE_THORN_SHIELD: "thorn_shield",
  CORE_EXECUTIONER: "executioner",
  CORE_THIN_ICE_PACT: "thin_ice_pact",
  CORE_SNEAK_STEP: "sneak_step",
  CORE_TOMB_RAIDER: "tomb_raider",
  CORE_KEEN_EYE: "keen_eye",
  CORE_PURIFY_RING: "purify_ring"
});

export function getEquipmentIdentityId(itemOrId) {
  if (typeof itemOrId === "string") return itemOrId;
  if (!itemOrId || typeof itemOrId !== "object") return "";
  return itemOrId.baseId || itemOrId.key || itemOrId.id || "";
}

export function getCanonicalBaseId(itemOrId) {
  return ITEM_ID_TO_CANONICAL_BASE[getEquipmentIdentityId(itemOrId)] || null;
}

export function getNamedRuleId(itemOrId) {
  const explicitId = itemOrId && typeof itemOrId === "object" ? itemOrId.namedRuleId : null;
  if (NAMED_RULE_IDS.includes(explicitId)) return explicitId;
  return ITEM_ID_TO_NAMED_RULE[getEquipmentIdentityId(itemOrId)] || null;
}

export function getVNextCoreId(id) {
  if (VNEXT_CORE_IDS.includes(id)) return id;
  return PRODUCTION_CORE_TO_VNEXT[id] || null;
}

export function isVNextSupportId(id) {
  return VNEXT_SUPPORT_IDS.includes(id);
}
