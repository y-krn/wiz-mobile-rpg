import { KEY_ITEMS } from "./key_items.js";

const statCosts = material => [1, 2, 3, 4, 5].map(quantity => ({ [material]: quantity }));

export const WORKSHOP_CATEGORIES = Object.freeze({
  startingGear: "初期装備候補",
  pools: "抽選プール",
  milestoneBuild: "深層ビルド",
  abyssBuild: "深淵ビルド",
  permanentStats: "恒久ステータス",
  convenience: "利便",
  classes: "クラス"
});

const WORKSHOP_BASE_NODES = [
  {
    id: "gear_rapier",
    category: "startingGear",
    name: "軽量武器候補",
    description: "潜行開始時にレイピアを選べる。",
    costs: [{ "獣の牙": 4, "鉄片": 2 }],
    grants: { startingGear: "RAPIER" }
  },
  {
    id: "gear_sage_staff",
    category: "startingGear",
    name: "術者武器候補",
    description: "潜行開始時に賢者の杖を選べる。",
    costs: [{ "霊粉": 4, "魔石片": 2 }],
    grants: { startingGear: "SAGE_STAFF" }
  },
  {
    id: "gear_fighter_saber",
    category: "startingGear",
    name: "戦士武器候補",
    description: "潜行開始時に鍛錬サーベルを選べる。",
    costs: [{ "獣の牙": 4, "鉄片": 2 }],
    grants: { startingGear: "FIGHTER_SABER" }
  },
  {
    id: "pool_blood_wand",
    category: "pools",
    name: "血杖の記憶",
    description: "血杖コアをラン内抽選へ追加する。",
    costs: [{ "呪布": 5, "黒角": 2 }],
    grants: { affixIds: ["CORE_BLOOD_WAND"] }
  },
  {
    id: "pool_deep_spells",
    category: "pools",
    name: "深層呪文写本",
    description: "高位スペルをラン内抽選へ追加する。",
    costs: [{ "魔石片": 6, "霊粉": 4 }],
    grants: { spellIds: ["MADALTO", "DIALMA"] }
  },
  {
    id: "pool_opener",
    category: "pools",
    name: "先手必勝の記憶",
    description: "先手必勝コアをラン内抽選へ追加する。",
    costs: [{ "鉄片": 7, "毒腺": 3 }],
    grants: { affixIds: ["CORE_OPENER"] }
  },
  {
    id: "pool_trap_eater",
    category: "pools",
    name: "罠喰いの記憶",
    description: "罠喰いコアをラン内抽選へ追加する。",
    costs: [{ "硬い皮": 7, "鉄片": 3 }],
    grants: { affixIds: ["CORE_TRAP_EATER"] }
  },
  {
    id: "pool_giant_slayer",
    category: "pools",
    name: "巨人殺しの記憶",
    description: "巨人殺しコアをラン内抽選へ追加する。",
    costs: [{ "獣の牙": 7, "黒角": 3 }],
    grants: { affixIds: ["CORE_GIANT_SLAYER"] }
  },
  {
    id: "pool_thorn_shield",
    category: "pools",
    name: "棘盾の記憶",
    description: "棘盾コアをラン内抽選へ追加する。",
    costs: [{ "硬い皮": 7, "呪布": 3 }],
    grants: { affixIds: ["CORE_THORN_SHIELD"] }
  },
  {
    id: "pool_tomb_raider",
    category: "pools",
    name: "盗掘王の記憶",
    description: "盗掘王コアをラン内抽選へ追加する。",
    costs: [{ "獣の牙": 7, "竜鱗": 3 }],
    grants: { affixIds: ["CORE_TOMB_RAIDER"] }
  },
  {
    id: "pool_scholar_eye",
    category: "pools",
    name: "学者の眼の記憶",
    description: "学者の眼コアをラン内抽選へ追加する。",
    costs: [{ "霊粉": 7, "骨片": 3 }],
    grants: { affixIds: ["CORE_SCHOLAR_EYE"] }
  },
  {
    id: "pool_milestone_breaker",
    category: "milestoneBuild",
    name: "節目破りの記憶",
    description: "節目ボス特化コアをラン内抽選へ追加する。",
    costs: [{ "鉄片": 7, "竜鱗": 3 }],
    requiresKeyItem: KEY_ITEMS.FORGE_SEAL,
    grants: { affixIds: ["CORE_MILESTONE_BREAKER"] }
  },
  {
    id: "pool_thin_ice_pact",
    category: "abyssBuild",
    name: "薄氷の誓約",
    description: "低HP時に攻撃と被害が増すコアを抽選へ追加する。",
    costs: [{ "黒角": 7, "竜鱗": 3 }],
    requiresKeyItem: KEY_ITEMS.ABYSS_SEAL,
    grants: { affixIds: ["CORE_THIN_ICE_PACT"] }
  },
  {
    id: "convenience_identify_powder",
    category: "convenience",
    name: "鑑定粉の備蓄",
    description: "ラン開始時の鑑定粉が1個増える。",
    costs: [{ "霊粉": 5, "呪布": 2 }],
    grants: { identifyPowder: 1 }
  },
  ...[
    ["str", "力", "獣の牙"],
    ["int", "知恵", "魔石片"],
    ["pie", "信仰", "霊粉"],
    ["vit", "生命", "硬い皮"],
    ["agi", "素早さ", "毒腺"],
    ["luk", "運", "骨片"]
  ].map(([stat, label, material]) => ({
    id: `stat_${stat}`,
    category: "permanentStats",
    name: `${label}鍛錬`,
    description: `${label}を1増加する。上限5段。`,
    maxRank: 5,
    costs: statCosts(material),
    grants: { stat, amount: 1 }
  })),
];

// 出発クラフトは潜行ごとに素材を支払う恒常シンク。個数上限は設けず、
// 支払い可能な素材残高だけを制約とする。

// 旧出発準備へ統合して撤去した買い切りノード。既存セーブのランクを消して素材を
// 返還するためだけに残す（`src/state/save_migrations.js`）。
export const RETIRED_WORKSHOP_NODES = Object.freeze([
  { id: "kit_identify_powder", costs: [{ "霊粉": 5, "呪布": 2 }] },
  { id: "kit_return_wing", costs: [{ "黒角": 4, "竜鱗": 1 }] }
]);

// 全クラス開放済み。将来は同じshapeのnode追加だけで拡張できる。
export const WORKSHOP_CLASS_NODES = Object.freeze([]);

export const WORKSHOP_NODES = Object.freeze([...WORKSHOP_BASE_NODES, ...WORKSHOP_CLASS_NODES]);

export const WORKSHOP_NODE_BY_ID = new Map(WORKSHOP_NODES.map(node => [node.id, node]));
