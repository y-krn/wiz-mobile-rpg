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
  wand: Object.freeze({ id: "wand", slot: "weapon", hands: 1, load: "standard", medium: true, runeSlots: 1 }),
  staff: Object.freeze({ id: "staff", slot: "weapon", hands: 2, load: "standard", medium: true, runeSlots: 2 }),
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

// Support IDs describe candidate vocabulary only. Values, rarity composition,
// and production eligibility belong to a later vNext implementation phase.
export const VNEXT_SUPPORT_IDS = Object.freeze([
  "hp", "mp",
  "poisonWard", "spellGuard", "statusResistance", "physicalAccuracy", "spellAccuracy", "escapeChance",
  "trapBonus", "trapGuard", "treasureSense", "arcaneSense", "hearRange", "traceRead",
  "poisonAtk", "bleedingAtk", "followUp", "firstStrike", "firstStrikeFollowUp",
  "fullHpDamage", "lowHpDamage", "highHpTargetDamage",
  "killHeal", "followUpMp", "hitFlinch", "stairsHeal",
  "identifyDiscount", "materialFind", "victoryMaterial", "contractReward",
  "guardCounter", "guardFortify", "guardRuneBoost", "attackRuneBoost", "runeAttackBoost",
  "longFightDamage", "longFightDefense"
]);

export const VNEXT_SUPPORTS = Object.freeze(Object.fromEntries(
  VNEXT_SUPPORT_IDS.map(id => [id, Object.freeze({ id })])
));

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
  "purify_ring",
  "overmix",
  "discarded_baggage_smoke"
]);

export const VNEXT_CORES = Object.freeze(Object.fromEntries(
  VNEXT_CORE_IDS.map(id => [id, Object.freeze({ id })])
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
