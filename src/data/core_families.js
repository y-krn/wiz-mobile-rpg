// Core families (#2058, #2061). Every dungeon holds a draw of three families
// whose Cores are more likely there; the others still appear. A family names
// a way of playing, never a build. The player reads it as the family name
// beside each dungeon where the dungeon is chosen.
//
// `coreIds` may list Cores that the current rules do not hand out (retired,
// changed, or locked by the Workshop). A family is drawn only while at least
// one of its Cores can actually appear (`src/rules/core_families.js`).
//
// `seedOptions` are what the first chest of a run may offer for the family:
// a base paired with the Core that changes how that base is played.

export const LIKELY_CORE_FAMILY_COUNT = 3;

export const CORE_FAMILIES = Object.freeze([
  Object.freeze({
    id: "technique",
    name: "技",
    coreIds: Object.freeze(["CORE_TECH_CHAIN", "CORE_TECH_HONE"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "DAGGER", coreId: "CORE_TECH_HONE" }),
      Object.freeze({ baseId: "SHORT_SWORD", coreId: "CORE_TECH_CHAIN" }),
      Object.freeze({ baseId: "MACE", coreId: "CORE_TECH_CHAIN" }),
      Object.freeze({ baseId: "CLAYMORE", coreId: "CORE_TECH_HONE" })
    ])
  }),
  Object.freeze({
    id: "guard",
    name: "構え",
    coreIds: Object.freeze(["CORE_GUARD_RIPOSTE", "CORE_THORN_SHIELD"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "BUCKLER", coreId: "CORE_GUARD_RIPOSTE" }),
      Object.freeze({ baseId: "LARGE_SHIELD", coreId: "CORE_GUARD_RIPOSTE" })
    ])
  }),
  Object.freeze({
    id: "blood",
    name: "血",
    coreIds: Object.freeze(["CORE_BLOOD_TECH", "CORE_BLOOD_WAND", "CORE_THIN_ICE_PACT"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "LEATHER_ARMOR", coreId: "CORE_BLOOD_TECH" }),
      Object.freeze({ baseId: "PLATE_MAIL", coreId: "CORE_BLOOD_TECH" }),
      Object.freeze({ baseId: "SAGE_STAFF", coreId: "CORE_BLOOD_WAND" })
    ])
  }),
  Object.freeze({
    id: "curse",
    name: "呪い",
    coreIds: Object.freeze(["CORE_CURSE_KEEPER"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "VNEXT_RING", coreId: "CORE_CURSE_KEEPER" }),
      Object.freeze({ baseId: "VNEXT_AMULET", coreId: "CORE_CURSE_KEEPER" })
    ])
  }),
  Object.freeze({
    id: "trap",
    name: "罠",
    coreIds: Object.freeze(["CORE_TRAP_EATER", "CORE_TOMB_RAIDER"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "VNEXT_RING", coreId: "CORE_TRAP_EATER" }),
      Object.freeze({ baseId: "VNEXT_AMULET", coreId: "CORE_TRAP_EATER" }),
      Object.freeze({ baseId: "VNEXT_RING", coreId: "CORE_TOMB_RAIDER" })
    ])
  }),
  Object.freeze({
    id: "stealth",
    name: "忍び",
    coreIds: Object.freeze(["CORE_SNEAK_STEP", "CORE_SCHOLAR_EYE"]),
    seedOptions: Object.freeze([
      Object.freeze({ baseId: "LEATHER_ARMOR", coreId: "CORE_SNEAK_STEP" }),
      Object.freeze({ baseId: "ROBE", coreId: "CORE_SNEAK_STEP" })
    ])
  })
]);

export const CORE_FAMILY_IDS = Object.freeze(CORE_FAMILIES.map(family => family.id));
