// Role-based treatment groups. Keep this catalog separate from runtime state so
// balance reviews can compare supply routes without adding one item per status.
const freezeRole = role => Object.freeze({
  ...role,
  statusIds: Object.freeze([...role.statusIds]),
  itemIds: Object.freeze([...role.itemIds]),
  supplyNotes: Object.freeze({ ...role.supplyNotes })
});

export const STATUS_TREATMENT_ROLES = Object.freeze({
  PERSISTENT_HAZARD: freezeRole({
    id: "persistent_hazard",
    label: "継続ハザード",
    statusIds: ["poisoned"],
    itemIds: ["ANTIDOTE", "HOLY_WATER"],
    supplyNotes: {
      ANTIDOTE: "stable-preparation",
      HOLY_WATER: "rare-found"
    }
  }),
  BROAD_CLEANSE: freezeRole({
    id: "broad_cleanse",
    label: "汎用クリーン",
    statusIds: ["poisoned", "blind", "paralyzed", "sleep"],
    itemIds: ["PANACEA"],
    supplyNotes: { PANACEA: "rare-found" }
  }),
  TARGETED_FALLBACK: freezeRole({
    id: "targeted_fallback",
    label: "戦闘状態の個別対応（既存）",
    statusIds: ["blind", "paralyzed", "sleep"],
    itemIds: ["EYE_DROPS", "PARALYZE_CURE", "WAKE_POWDER"],
    supplyNotes: {
      EYE_DROPS: "craft-or-merchant",
      PARALYZE_CURE: "merchant-or-found",
      WAKE_POWDER: "merchant-or-found"
    }
  })
});

export const STATUS_TREATMENT_ROLE_LIST = Object.freeze(
  Object.values(STATUS_TREATMENT_ROLES)
);

export const STATUS_TREATMENT_ITEM_ROLE = Object.freeze(
  Object.fromEntries(
    STATUS_TREATMENT_ROLE_LIST.flatMap(role =>
      role.itemIds.map(itemId => [itemId, role.id])
    )
  )
);
