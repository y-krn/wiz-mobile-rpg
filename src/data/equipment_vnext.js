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
  "executioner",
  "thin_ice_pact",
  "sneak_step",
  "tomb_raider",
  "keen_eye",
  "scholar_eye"
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

// Production Core inventory audit for Equipment vNext Phase 3b. Design data
// only: this module stays disconnected from production generation and effects.
export const VNEXT_CORE_AUDIT = Object.freeze({
  CORE_BLOOD_WAND: { productionId: "CORE_BLOOD_WAND", disposition: "keep", reasonCode: "spell_hp_resource_exchange", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/combat_logic/spell_resolution.js", "src/spell_menu.js"], currentSemantic: "When MP is short, pay 2x spell MP cost in HP.", identityOverlap: ["Support mp/spellPower: adjacent resource and output stats, not the same exchange", "Named/Base: no direct semantic duplicate"] },
  CORE_PURIFY_RING: { productionId: "CORE_PURIFY_RING", disposition: "support", targetId: "killHeal", reasonCode: "enemy_tag_auto_recovery", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/purify_rules.js", "src/combat_logic/damage.js"], currentSemantic: "On undead/spirit/demon defeat, recover 1 MP, or 2 HP at full MP.", identityOverlap: ["Support killHeal: defeat-triggered automatic recovery", "Named/Base: no direct semantic duplicate"] },
  CORE_TRAP_EATER: { productionId: "CORE_TRAP_EATER", disposition: "keep", reasonCode: "trap_disarm_risk_reward", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/data/workshop.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/rules/character_stats.js", "src/chest.js"], currentSemantic: "Successful chest-trap disarms add run-long attack, capped at 20.", identityOverlap: ["Support trapBonus/trapGuard: disarm skill and mitigation, not risk-reward conversion", "Named/Base: no direct semantic duplicate"] },
  CORE_CURSE_KEEPER: { productionId: "CORE_CURSE_KEEPER", disposition: "keep", reasonCode: "curse_power_tradeoff", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/item_rules.js", "src/rules/character_stats.js"], currentSemantic: "Each equipped cursed item adds 3% attack and spell power.", identityOverlap: ["Support atk/spellPower: flat affix stats, not curse-scaled tradeoff", "Named/Base: no direct semantic duplicate"] },
  CORE_THORN_SHIELD: { productionId: "CORE_THORN_SHIELD", disposition: "support", reasonCode: "passive_counterattack_proc", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/data/workshop.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/combat_logic/damage.js"], currentSemantic: "On hit, 30% chance to counter at 50% power.", identityOverlap: ["Support candidates guardCounter/guardFortify: adjacent shield vocabulary; neither is adopted or exact", "Named/Base: shield slot and guard profile remain separate"] },
  CORE_EXECUTIONER: { productionId: "CORE_EXECUTIONER", disposition: "change", targetId: "status_setup_consume", reasonCode: "automatic_status_and_multiplier", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/combat_logic/status_effects.js", "src/combat_logic/round.js"], currentSemantic: "Before attack, 35% chance to poison; deal 1.4x damage to status-afflicted targets.", targetSemantic: "Choose when to set up poison, then choose when to consume the status for burst damage.", identityOverlap: ["Support poisonAtk/bleedingAtk: status application triggers, not player-controlled setup/consume", "Named/Base: no direct semantic duplicate"] },
  CORE_THIN_ICE_PACT: { productionId: "CORE_THIN_ICE_PACT", disposition: "change", targetId: "voluntary_hp_risk", reasonCode: "automatic_low_hp_tradeoff", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/data/workshop.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/combat_logic/damage.js"], currentSemantic: "At or below 50% HP, deal 1.35x and take 1.2x damage.", targetSemantic: "Choose an HP payment to amplify the next action and accept explicit incoming risk.", identityOverlap: ["Support lowHpDamage: low-HP damage bonus without the pact's incoming-risk exchange", "Named/Base: no direct semantic duplicate"] },
  CORE_SNEAK_STEP: { productionId: "CORE_SNEAK_STEP", disposition: "keep", reasonCode: "exploration_detection_control", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/movement.js"], currentSemantic: "Halves gatekeeper/boss detection and extends aura detection by one tile.", identityOverlap: ["Support hearRange/arcaneSense: information range, not enemy detection pressure", "Named/Base: no direct semantic duplicate"] },
  CORE_TOMB_RAIDER: { productionId: "CORE_TOMB_RAIDER", disposition: "keep", reasonCode: "chest_material_trap_exchange", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/data/workshop.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/chest.js"], currentSemantic: "Chest adds one material and raises trap tier by one.", identityOverlap: ["Support trapBonus/trapGuard: trap interaction and mitigation, not chest reward-risk exchange", "Named/Base: no direct semantic duplicate"] },
  CORE_KEEN_EYE: { productionId: "CORE_KEEN_EYE", disposition: "keep", reasonCode: "unidentified_equipment_gamble", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/rules/item_rules.js"], currentSemantic: "Equip unidentified items with effects active but hidden until identification.", identityOverlap: ["Support identifyDiscount: identification cost only, not blind equip/effect disclosure", "Named/Base: item identity stays concealed"] },
  CORE_CAMP_MASTER: { productionId: "CORE_CAMP_MASTER", disposition: "support", reasonCode: "passive_recovery_multiplier", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/systems/camp_rest.ts", "src/menu/explore_actions.js"], currentSemantic: "Doubles HP/MP recovery when choosing camp rest.", identityOverlap: ["Support hp/mp: capacity, not recovery received at the rest-versus-continue decision", "Named/Base: no direct semantic duplicate"] },
  CORE_BOUNTY_HUNTER: { productionId: "CORE_BOUNTY_HUNTER", disposition: "support", targetId: "contractReward", reasonCode: "automatic_contract_progress_multiplier", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/rules/affix_rules.js", "src/combat_logic/rewards.js"], currentSemantic: "Doubles matching contract-target defeat progress.", identityOverlap: ["Support contractReward: objective reward economy; adjacent, not the same progress effect", "Named/Base: no direct semantic duplicate"] },
  CORE_SCHOLAR_EYE: { productionId: "CORE_SCHOLAR_EYE", disposition: "change", targetId: "unknown_enemy_study", reasonCode: "automatic_unknown_enemy_drop", currentStatus: "active", productionSupply: true, supplyEvidence: ["src/data/affixes.js", "src/data/workshop.js", "src/systems/equipment_generation.js"], productionConsumer: true, consumerEvidence: ["src/combat_logic/rewards.js"], currentSemantic: "Guarantees a material drop from uncatalogued enemies.", targetSemantic: "Choose to study an unknown enemy and weigh the material opportunity against encounter risk.", identityOverlap: ["Support materialFind: general material chance, not a deliberate knowledge/risk choice", "Named/Base: no direct semantic duplicate"] }
});

// Phase 3c audit rows retain source evidence and current production semantics.
// This pure design inventory has no production consumer.
const VNEXT_BASE_ITEM_AUDIT_ROWS = [
  ["DAGGER", "weapon", "keep", "dagger", null, "canonical_light_weapon", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H light profile; no fixed effect.", "Light; 1H; atk 3; rand 1-3."],
  ["RAPIER", "weapon", "merge", "dagger", null, "same_light_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light/1H profile as dagger; thrust wording and stats add no owned rule.", "Light; 1H; atk 12."],
  ["NINJA_DAGGER", "weapon", "merge", "dagger", null, "same_light_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light/1H profile; ambush/poison tags feed Support eligibility only.", "Light; 1H; atk 13.5."],
  ["NINJA_BLADE", "weapon", "merge", "dagger", null, "same_light_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light/1H profile; tags and atk add no distinct tactic.", "Light; 1H; atk 21."],
  ["VENOM_FANG", "weapon", "named", "dagger", "venom_fang", "poison_suppression_build_entry", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "#1536 proposes a Poison/Suppression build entry; rule should make status control a build choice beyond additive poisonAtk Support or automatic status Core.", "Production has light/1H profile and poison/ambush tags, but no intrinsic poison rule yet; atk 13.5; rand 0-4."],
  ["MOONSHADOW", "weapon", "named", "dagger", "moonshadow", "initiative_opening_build_entry", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "#1536 proposes an initiative/opening build entry; Named should change opening action choices beyond a numeric firstStrike Support bonus.", "Production has light/1H profile and evasion tag, but no intrinsic initiative/opening rule yet; atk 30."],
  ["SHORT_SWORD", "weapon", "keep", "sword", null, "canonical_blade_weapon", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H blade profile anchors sword; no unique fixed effect.", "Blade; standard; 1H; atk 9."],
  ["FIGHTER_SABER", "weapon", "merge", "sword", null, "starting_weapon_vertical_duplicate", "starting_only", ["src/data/workshop.js#gear_fighter_saber startingGear"], "Same standard 1H blade and iron/blade tags as SHORT_SWORD; only stats/range differ.", "Workshop startingGear grant; blade; 1H; atk 12."],
  ["LONG_SWORD", "weapon", "merge", "sword", null, "same_blade_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same 1H blade profile; attack stat is vertical progression.", "Blade; standard; 1H; atk 18."],
  ["FLAME_SWORD", "weapon", "named", "sword", "flame_blade", "heat_accumulation_burst_rule", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "#1536 proposes attack-driven heat accumulation followed by an explosion threshold; a burst cycle creates a distinct sword rule beyond Support stat bonuses.", "Production has blade/1H profile and fire tag, but no heat accumulation or explosion rule yet; atk 21."],
  ["HOLY_BLADE", "weapon", "named", "sword", "holy_oath", "guard_followup_attack_rule", "active", ["src/data/equipment_tables.js#floor 6+ additions", "src/rules/chest_rules.js#floor equipment supply"], "#1536 proposes empowering the next attack after Guard, creating a sword-and-shield action loop rather than enemy-tag damage or passive defense Support.", "Production currently grants fixed antiUndead/antiDemon +20, retired in Phase 3a; the Guard-follow-up Named rule is not implemented."],
  ["MACE", "weapon", "keep", "mace", null, "canonical_impact_weapon", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Impact profile establishes blunt-weapon tactic.", "Impact; standard; 1H; atk 7.5."],
  ["SACRED_MACE", "weapon", "merge", "mace", null, "enemy_tag_support_overlap", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same impact/1H profile; holy/spirit lore has no owned rule.", "Impact; standard; 1H; atk 10.5; holy/spirit tags."],
  ["CLAYMORE", "weapon", "keep", "greatsword", null, "canonical_two_hand_heavy", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "2H heavy profile establishes greatsword; profile, not atk, is identity.", "Heavy; 2H; atk 27."],
  ["KATANA", "weapon", "named", "greatsword", "muramasa", "cursed_blood_tradeoff", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply", "src/systems/equipment_generation.js#guaranteed curse roll"], "Guaranteed curse roll and blood/curse identity support a voluntary risk/reward rule, distinct from passive Curse Keeper Core.", "Heavy; 2H; atk 37.5; guaranteed curseEffectId roll."],
  ["LEGENDARY_SWORD", "weapon", "named", "greatsword", "excalibur", "special_reward_artifact", "special_supply", ["src/data/equipment_tables.js#floor 11+ additions", "src/rules/chest_rules.js#CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR"], "Artifact/quest reward identity anchors Excalibur; high atk is not the reason.", "Heavy; 2H; atk 60; holy; special/quest item."],
  ["SEALED_EXCALIBUR", "weapon", "named", "greatsword", "excalibur", "excalibur_state_variant", "active", ["src/data/equipment_tables.js#floor 6+ additions", "src/rules/chest_rules.js#floor equipment supply", "src/systems/equipment_generation.js#guaranteed curse roll"], "Same Excalibur rule as LEGENDARY_SWORD; sealed state variant with guaranteed curse roll, not another Base/rule.", "Heavy; 2H; atk 39; guaranteed curseEffectId roll."],
  ["WAND", "weapon", "keep", "wand", null, "canonical_one_hand_medium", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H medium; one Rune slot distinguishes wand structure; fixed arcane +10 is Support-like.", "Medium; 1H; runeSlots 1; maxMp +2; arcane +10."],
  ["HOLY_STAFF", "weapon", "merge", "wand", null, "same_one_hand_medium", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same 1H medium structure as wand; holy tag and atk add no rule.", "Medium; 1H; runeSlots 1; atk 9."],
  ["SAGE_STAFF", "weapon", "keep", "staff", null, "canonical_two_hand_medium", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "2H medium and two Rune slots establish staff configuration.", "Medium; 2H; runeSlots 2; maxMp +3; atk 3."],
  ["ARCH_WAND", "weapon", "named", "staff", "archmage_staff", "three_rune_configuration", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "2H medium; third Rune slot beyond staff's two supports distinct multi-Rune loadout; atk is not identity.", "Medium; 2H; runeSlots 3; maxMp +4; atk 4.5."],

  ["ROBE", "armor", "keep", "lightArmor", null, "canonical_light_armor", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Light load anchors lightArmor; tags are generation eligibility only.", "Light; def 1."],
  ["MAGE_CLOAK", "armor", "merge", "lightArmor", null, "same_light_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light load; def-only vertical increase.", "Light; def 4."],
  ["ARCANE_ROBE", "armor", "merge", "lightArmor", null, "same_light_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light load; spell Support eligibility is not armor Base identity.", "Light; def 5."],
  ["SORCERER_ROBE", "armor", "merge", "lightArmor", null, "same_light_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same light load; def-only vertical increase.", "Light; def 6."],
  ["EXPLORER_CLOAK", "armor", "merge", "lightArmor", null, "support_overlap_no_rule", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Trap/poison tags and eligibility belong to Support, not intrinsic armor identity.", "Light; def 3; trap/poison tags."],
  ["NINJA_SUIT", "armor", "merge", "lightArmor", null, "support_overlap_no_rule", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Ambush/evasion tags influence Support eligibility only.", "Light; def 5; ambush/evasion tags."],
  ["BATTLE_GARB", "armor", "merge", "lightArmor", null, "support_overlap_no_rule", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Ambush/followUp eligibility belongs to Support; same light load.", "Light; def 6; ambush/ward tags."],
  ["LEATHER_ARMOR", "armor", "keep", "mediumArmor", null, "canonical_medium_armor", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Standard load anchors mediumArmor; no fixed effect.", "Standard; def 4."],
  ["SCALE_MAIL", "armor", "merge", "mediumArmor", null, "same_standard_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same standard load; def is vertical; guardian eligibility is Support-owned.", "Standard; def 6."],
  ["CHAIN_MAIL", "armor", "merge", "mediumArmor", null, "same_standard_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same standard load; def is vertical; guardian eligibility is Support-owned.", "Standard; def 8."],
  ["PRIEST_ROBE", "armor", "merge", "mediumArmor", null, "same_standard_load", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same standard load; holy/spirit tags add no independent defense rule.", "Standard; def 8."],
  ["PLATE_MAIL", "armor", "keep", "heavyArmor", null, "canonical_heavy_armor", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Heavy load anchors heavyArmor; pure def does not split Base.", "Heavy; def 16."],
  ["DRAGON_SCALE", "armor", "named", "heavyArmor", "dragon_scale", "adaptive_attack_type_defense_rule", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "#1536 proposes adaptation to incoming attack type rather than a dragon-only answer; situational defense gives heavy armor a distinct rule beyond flat Guardian Support.", "Production is heavy armor with def 12 and a dragon tag; adaptive defense rule is not implemented."],

  ["SMALL_SHIELD", "shield", "merge", "smallShield", null, "same_light_guard_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Light guard; BUCKLER is same guard at lighter load, so no separate identity.", "1H; standard; light guard; def 2."],
  ["BUCKLER", "shield", "keep", "smallShield", null, "canonical_light_guard", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H light load/light guard anchors smallShield.", "1H; light; light guard; def 2."],
  ["LARGE_SHIELD", "shield", "keep", "largeShield", null, "canonical_physical_guard", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H heavy load/physical guard anchors largeShield.", "1H; heavy; physical guard; def 5."],
  ["KNIGHT_SHIELD", "shield", "merge", "largeShield", null, "same_physical_guard_profile", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "Same 1H heavy/physical guard; def-only increase.", "1H; heavy; physical guard; def 8."],
  ["MAGIC_SHIELD", "shield", "keep", "magicShield", null, "canonical_arcane_guard", "active", ["src/data/equipment_tables.js#floor 1-30 pool", "src/rules/chest_rules.js#floor equipment supply"], "1H standard load/arcane guard anchors magicShield; spellGuard eligibility is Support-owned.", "1H; standard; arcane guard; def 4."],
  ["LEGENDARY_SHIELD", "shield", "named", "largeShield", "aegis", "distinct_aegis_guard_profile", "special_supply", ["src/data/equipment_tables.js#floor 11+ additions", "src/rules/chest_rules.js#CHEST_SPECIAL_REWARD_CHANCE_BY_FLOOR"], "Unique aegis guardProfile and special reward identity; def is not reason.", "1H; heavy; aegis guard; def 15; special/quest reward."],
  ["DRAGON_CHARM", "shield", "merge", "magicShield", null, "retired_enemy_tag_effect", "active", ["src/data/equipment_tables.js#floor 6+ additions", "src/rules/chest_rules.js#floor equipment supply"], "Dragon guard/fixed antiDragon is narrow enemy-tag identity; Phase 3a retires antiDragon, ordinary shield body merges to magicShield.", "1H; standard; dragon guard; def 2; fixed antiDragon +30."],

  ["AMULET_HP", "accessory", "keep", "amulet", null, "canonical_amulet", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Amulet anchor; hp capacity moves to Phase 3a Support hp ownership.", "Accessory; fixed hpBonus +10."],
  ["AMULET_MP", "accessory", "merge", "amulet", null, "support_owned_capacity", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Same amulet; mp capacity belongs to Phase 3a Support mp.", "Accessory; fixed mpBonus +3."],
  ["RING_STR", "accessory", "merge", "ring", null, "retired_atk_support", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Fixed atk belongs to Phase 3a RETIRE Support atk; no remaining identity.", "Accessory; fixed atk +2."],
  ["RING_AGI", "accessory", "keep", "ring", null, "canonical_ring", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Ring anchor; physicalAccuracy is Phase 3a Support ownership.", "Accessory; fixed physicalAccuracy +5."],
  ["THIEF_EYE", "accessory", "merge", "ring", null, "support_owned_trap_effect", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Fixed trapBonus belongs to Phase 3a Support ownership.", "Accessory; trapBonus +10."],
  ["WARD_CHARM", "accessory", "merge", "amulet", null, "support_owned_spell_guard", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Fixed spellGuard belongs to Phase 3a Support ownership.", "Accessory; spellGuard +15."],
  ["DRAGON_RING", "accessory", "retire", null, null, "retired_enemy_tag_only", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Only antiDragon effect; Phase 3a RETIRE Support; no remaining identity to merge.", "Accessory; antiDragon +20."],
  ["HOLY_BAND", "accessory", "retire", null, null, "retired_enemy_tag_only", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Only antiUndead effect; Phase 3a RETIRE Support; no remaining identity to merge.", "Accessory; antiUndead +20."],
  ["SWIFT_BAND", "accessory", "merge", "ring", null, "support_owned_initiative", "active", ["src/data/equipment_tables.js#accessory floor 1-30", "src/rules/chest_rules.js#accessory supply"], "Fixed firstStrike belongs to Phase 3a Support ownership.", "Accessory; firstStrike +5."]
];

export const VNEXT_BASE_ITEM_AUDIT = Object.freeze(Object.fromEntries(
  VNEXT_BASE_ITEM_AUDIT_ROWS.map(([productionId, slot, disposition, targetBaseId, namedRuleId, reasonCode, currentStatus, supplyEvidence, identityEvidence, currentSemantic]) => [
    productionId,
    Object.freeze({ productionId, slot, disposition, ...(targetBaseId ? { targetBaseId } : {}), ...(namedRuleId ? { namedRuleId } : {}), reasonCode, currentStatus, supplyEvidence: Object.freeze(supplyEvidence), identityEvidence, currentSemantic })
  ])
));

const ITEM_ID_TO_CANONICAL_BASE = Object.freeze(Object.fromEntries(
  Object.values(VNEXT_BASE_ITEM_AUDIT).filter(({ disposition }) => disposition !== "retire").map(({ productionId, targetBaseId }) => [productionId, targetBaseId])
));
const ITEM_ID_TO_NAMED_RULE = Object.freeze(Object.fromEntries(
  Object.values(VNEXT_BASE_ITEM_AUDIT).filter(({ disposition }) => disposition === "named").map(({ productionId, namedRuleId }) => [productionId, namedRuleId])
));

// The map is data, not an adapter in any production item or loot path.
export const ITEM_ID_TO_VNEXT_BASE = ITEM_ID_TO_CANONICAL_BASE;
export const ITEM_ID_TO_VNEXT_NAMED_RULE = ITEM_ID_TO_NAMED_RULE;

const PRODUCTION_CORE_TO_VNEXT = Object.freeze({
  CORE_BLOOD_WAND: "blood_wand",
  CORE_TRAP_EATER: "trap_eater",
  CORE_CURSE_KEEPER: "curse_keeper",
  CORE_EXECUTIONER: "executioner",
  CORE_THIN_ICE_PACT: "thin_ice_pact",
  CORE_SNEAK_STEP: "sneak_step",
  CORE_TOMB_RAIDER: "tomb_raider",
  CORE_KEEN_EYE: "keen_eye",
  CORE_SCHOLAR_EYE: "scholar_eye"
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
