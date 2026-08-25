const stock = (entry) => Object.freeze({ ...entry, cost: Object.freeze(entry.cost) });

export const MILESTONE_MERCHANT_STOCK = Object.freeze([
  stock({ id: "identify_powder", kind: "identify", name: "鑑定粉", cost: { "霊粉": 2 } }),
  stock({ id: "heal_potion", kind: "item", itemId: "HEAL_POTION", name: "傷薬", cost: { "獣の牙": 1 } }),
  stock({ id: "antidote", kind: "item", itemId: "ANTIDOTE", name: "解毒薬", cost: { "毒腺": 1 } }),
  stock({ id: "eye_drops", kind: "item", itemId: "EYE_DROPS", name: "目薬", cost: { "霊粉": 1 } }),
  stock({ id: "wake_powder", kind: "item", itemId: "WAKE_POWDER", name: "覚醒薬", cost: { "霊粉": 1 } }),
  stock({ id: "paralyze_cure", kind: "item", itemId: "PARALYZE_CURE", name: "解痺薬", cost: { "硬い皮": 1 } }),
  // #271: マイルストーン商人はボスと同じ階に確定配置される。深く潜るほど
  // 買い足せる=深さが供給条件、という形でボス戦の対策手段を供給する。
  stock({ id: "guard_potion", kind: "item", itemId: "GUARD_POTION", name: "守りの薬", cost: { "硬い皮": 2 } }),
  // #304: 実装済みだが全供給経路に未登録だった攻勢バフ2種。守りの薬と同じく
  // ボス戦の対策手段として、深さを供給条件にする。
  stock({ id: "str_potion", kind: "item", itemId: "STR_POTION", name: "剛力の薬", cost: { "獣の牙": 2 } }),
  stock({ id: "haste_potion", kind: "item", itemId: "HASTE_POTION", name: "疾風の薬", cost: { "毒腺": 2 } }),
  stock({ id: "return_wing", kind: "item", itemId: "TOWN_PORTAL", name: "帰還の翼", cost: { "黒角": 36, "呪布": 27 } }),
  stock({ id: "trap_kit", kind: "item", itemId: "TRAP_KIT", name: "罠外しキット", cost: { "骨片": 2 } }),
  stock({ id: "trap_sense_stone", kind: "item", itemId: "TRAP_SENSE_STONE", name: "探知石", cost: { "魔石片": 2 } })
]);

export const MILESTONE_UNCURSE_COST = Object.freeze({ "霊粉": 5, "呪布": 3, "黒角": 1 });
