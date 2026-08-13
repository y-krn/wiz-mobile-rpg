export const KEY_ITEMS = Object.freeze({
  FORGE_SEAL: "FORGE_SEAL",
  ABYSS_SEAL: "ABYSS_SEAL"
});

export const KEY_ITEM_LABELS = Object.freeze({
  [KEY_ITEMS.FORGE_SEAL]: "鍛造殿の印",
  [KEY_ITEMS.ABYSS_SEAL]: "深淵の印"
});

export const KEY_ITEM_WORKSHOP_BRANCHES = Object.freeze({
  [KEY_ITEMS.FORGE_SEAL]: "深層ビルド",
  [KEY_ITEMS.ABYSS_SEAL]: "深淵ビルド"
});

export const MILESTONE_KEY_ITEMS = Object.freeze({
  5: KEY_ITEMS.FORGE_SEAL,
  10: KEY_ITEMS.ABYSS_SEAL
});
