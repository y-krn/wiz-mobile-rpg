const stock = (entry) => Object.freeze({ ...entry, cost: Object.freeze(entry.cost) });

export const MILESTONE_MERCHANT_STOCK = Object.freeze([
  stock({ id: "identify_powder", kind: "identify", name: "鑑定粉", cost: { "霊粉": 2 } }),
  stock({ id: "heal_potion", kind: "item", itemId: "HEAL_POTION", name: "傷薬", cost: { "獣の牙": 1 } }),
  stock({ id: "antidote", kind: "item", itemId: "ANTIDOTE", name: "解毒薬", cost: { "毒腺": 1 } }),
  stock({ id: "wake_powder", kind: "item", itemId: "WAKE_POWDER", name: "覚醒薬", cost: { "霊粉": 1 } }),
  stock({ id: "paralyze_cure", kind: "item", itemId: "PARALYZE_CURE", name: "解痺薬", cost: { "硬い皮": 1 } }),
  stock({ id: "return_wing", kind: "item", itemId: "TOWN_PORTAL", name: "帰還の翼", cost: { "黒角": 36, "呪布": 27 } })
]);

export const MILESTONE_UNCURSE_COST = Object.freeze({ "霊粉": 5, "呪布": 3, "黒角": 1 });
