// 高級ベース: game-design.md に従い通常チェストからは排除し、
// 危険チェスト・レア敵・ボス・極低確率ソースへ寄せる。
export const RESTRICTED_CHEST_BASES = ["KATANA", "MOONSHADOW", "DRAGON_SCALE", "LEGENDARY_SWORD", "LEGENDARY_SHIELD"];

export const EQUIPMENT_CANDIDATES_BY_FLOOR = {
  1: ["DAGGER", "WAND", "MACE", "RAPIER", "BUCKLER", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK"],
  2: ["DAGGER", "WAND", "SHORT_SWORD", "RAPIER", "MACE", "SACRED_MACE", "SMALL_SHIELD", "BUCKLER", "ROBE", "LEATHER_ARMOR", "EXPLORER_CLOAK", "SCALE_MAIL", "MAGE_CLOAK"],
  3: ["SHORT_SWORD", "RAPIER", "NINJA_DAGGER", "VENOM_FANG", "LONG_SWORD", "MACE", "SACRED_MACE", "SAGE_STAFF", "SMALL_SHIELD", "LARGE_SHIELD", "MAGIC_SHIELD", "LEATHER_ARMOR", "EXPLORER_CLOAK", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL", "ARCANE_ROBE"],
  4: ["LONG_SWORD", "CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "HOLY_STAFF", "FLAME_SWORD", "NINJA_SUIT", "CHAIN_MAIL", "ARCANE_ROBE", "BATTLE_GARB"],
  5: ["LONG_SWORD", "CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "MAGIC_SHIELD", "KATANA", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "HOLY_STAFF", "FLAME_SWORD", "ARCH_WAND", "NINJA_SUIT", "BATTLE_GARB", "SORCERER_ROBE", "DRAGON_SCALE"]
};

// B5 was previously reused for every deeper floor. Keep earlier equipment in
// the pool, then widen the authored base space in later bands. This is a
// horizontal supply change: old gear remains eligible instead of being
// invalidated by a depth number.
const DEEP_EQUIPMENT_ADDITIONS = {
  6: ["HOLY_BLADE", "DRAGON_CHARM", "SEALED_EXCALIBUR"],
  11: ["LEGENDARY_SWORD", "LEGENDARY_SHIELD"]
};
for (let floor = 6; floor <= 30; floor += 1) {
  const additions = floor >= 11
    ? [...(DEEP_EQUIPMENT_ADDITIONS[6] || []), ...(DEEP_EQUIPMENT_ADDITIONS[11] || [])]
    : (DEEP_EQUIPMENT_ADDITIONS[6] || []);
  EQUIPMENT_CANDIDATES_BY_FLOOR[floor] = [...new Set([
    ...EQUIPMENT_CANDIDATES_BY_FLOOR[5],
    ...additions
  ])];
}

export const ACCESSORY_CANDIDATES_BY_FLOOR = {
  1: ["AMULET_HP", "RING_STR", "RING_AGI", "RING_LUK"],
  2: ["AMULET_HP", "AMULET_MP", "RING_STR", "RING_AGI", "RING_LUK", "THIEF_EYE"],
  3: ["AMULET_HP", "AMULET_MP", "RING_STR", "RING_AGI", "RING_LUK", "THIEF_EYE", "WARD_CHARM"],
  4: ["AMULET_HP", "AMULET_MP", "RING_STR", "RING_AGI", "RING_LUK", "THIEF_EYE", "WARD_CHARM", "HOLY_BAND", "SWIFT_BAND"],
  5: ["AMULET_HP", "AMULET_MP", "RING_STR", "RING_AGI", "RING_LUK", "THIEF_EYE", "WARD_CHARM", "DRAGON_RING", "HOLY_BAND", "SWIFT_BAND"]
};

// The accessory base set is already horizontal by B5. Deeper floors receive
// their new possibilities through role supply and affix composition, while
// retaining every established accessory as a valid find.
for (let floor = 6; floor <= 30; floor += 1) {
  ACCESSORY_CANDIDATES_BY_FLOOR[floor] = [...ACCESSORY_CANDIDATES_BY_FLOOR[5]];
}
