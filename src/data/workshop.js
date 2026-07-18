const statCosts = material => [1, 2, 3, 4, 5].map(quantity => ({ [material]: quantity }));

export const WORKSHOP_CATEGORIES = Object.freeze({
  startingGear: "初期装備候補",
  pools: "抽選プール",
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
  {
    id: "kit_identify_powder",
    category: "convenience",
    name: "鑑定粉の小袋",
    description: "潜行開始時の鑑定粉を1個増やす。",
    costs: [{ "霊粉": 5, "呪布": 2 }],
    grants: { identifyPowder: 1 }
  },
  {
    id: "kit_return_wing",
    category: "convenience",
    name: "帰還の翼支給",
    description: "潜行開始時に帰還の翼を1個持つ。暫定帰還手段。",
    costs: [{ "黒角": 4, "竜鱗": 1 }],
    grants: { returnItem: "TOWN_PORTAL" }
  }
];

// 全クラス開放済み。将来は同じshapeのnode追加だけで拡張できる。
export const WORKSHOP_CLASS_NODES = Object.freeze([]);

export const WORKSHOP_NODES = Object.freeze([...WORKSHOP_BASE_NODES, ...WORKSHOP_CLASS_NODES]);

export const WORKSHOP_NODE_BY_ID = new Map(WORKSHOP_NODES.map(node => [node.id, node]));
