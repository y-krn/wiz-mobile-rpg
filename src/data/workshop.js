import { KEY_ITEMS } from "./key_items.js";

export const WORKSHOP_CATEGORIES = Object.freeze({
  startingGear: "開始武器",
  pools: "迷宮で見つかる品",
  milestoneBuild: "深層の型",
  abyssBuild: "深淵の型",
  convenience: "利便"
});

const WORKSHOP_BASE_NODES = [
  {
    id: "gear_rapier",
    category: "startingGear",
    name: "開始武器：レイピア",
    description: "冒険の始めに、レイピアを選べるようになる。",
    costs: [{ "獣の牙": 4, "鉄片": 2 }],
    grants: { startingGear: "RAPIER" }
  },
  {
    id: "gear_sage_staff",
    category: "startingGear",
    name: "開始武器：賢者の杖",
    description: "冒険の始めに、賢者の杖を選べるようになる。",
    costs: [{ "霊粉": 4, "魔石片": 2 }],
    grants: { startingGear: "SAGE_STAFF" }
  },
  {
    id: "gear_fighter_saber",
    category: "startingGear",
    name: "開始武器：鍛錬サーベル",
    description: "冒険の始めに、鍛錬サーベルを選べるようになる。",
    costs: [{ "獣の牙": 4, "鉄片": 2 }],
    grants: { startingGear: "FIGHTER_SABER" }
  },
  {
    id: "pool_blood_wand",
    category: "pools",
    name: "血杖の記憶",
    description: "迷宮で「血杖」の品が見つかるようになる。",
    costs: [{ "呪布": 5, "黒角": 2 }],
    grants: { affixIds: ["CORE_BLOOD_WAND"] }
  },
  {
    id: "pool_deep_spells",
    category: "pools",
    name: "深層呪文写本",
    description: "迷宮で高位の呪文のルーンが見つかるようになる。",
    costs: [{ "魔石片": 6, "霊粉": 4 }],
    grants: { spellIds: ["MADALTO", "DIALMA"] }
  },
  {
    id: "pool_trap_eater",
    category: "pools",
    name: "罠喰いの記憶",
    description: "迷宮で「罠喰い」の品が見つかるようになる。",
    costs: [{ "硬い皮": 7, "鉄片": 3 }],
    grants: { affixIds: ["CORE_TRAP_EATER"] }
  },
  {
    id: "pool_thorn_shield",
    category: "pools",
    name: "棘盾の記憶",
    description: "迷宮で「棘盾」の品が見つかるようになる。",
    costs: [{ "硬い皮": 7, "呪布": 3 }],
    grants: { affixIds: ["CORE_THORN_SHIELD"] }
  },
  {
    id: "pool_tomb_raider",
    category: "pools",
    name: "盗掘王の記憶",
    description: "迷宮で「盗掘王」の品が見つかるようになる。",
    costs: [{ "獣の牙": 7, "竜鱗": 3 }],
    grants: { affixIds: ["CORE_TOMB_RAIDER"] }
  },
  {
    id: "pool_scholar_eye",
    category: "pools",
    name: "学者の眼の記憶",
    description: "迷宮で「学者の眼」の品が見つかるようになる。",
    costs: [{ "霊粉": 7, "骨片": 3 }],
    grants: { affixIds: ["CORE_SCHOLAR_EYE"] }
  },
  {
    id: "pool_thin_ice_pact",
    category: "abyssBuild",
    name: "薄氷の誓約",
    description: "迷宮で、HPが低いほど攻撃も被害も増す品が見つかるようになる。",
    costs: [{ "黒角": 7, "竜鱗": 3 }],
    requiresKeyItem: KEY_ITEMS.ABYSS_SEAL,
    grants: { affixIds: ["CORE_THIN_ICE_PACT"] }
  },
  {
    id: "convenience_identify_powder",
    category: "convenience",
    name: "鑑定粉の備蓄",
    description: "冒険の始めに持つ鑑定粉が1個増える。",
    costs: [{ "霊粉": 5, "呪布": 2 }],
    grants: { identifyPowder: 1 }
  },
];

// 出発クラフトは冒険ごとに素材を支払う恒常シンク。個数上限は設けず、
// 支払い可能な素材残高だけを制約とする。

// 旧出発準備へ統合して撤去した買い切りノード。既存セーブのランクを消して素材を
// 返還するためだけに残す（`src/state/save_migrations.js`）。
export const RETIRED_WORKSHOP_NODES = Object.freeze([
  { id: "kit_identify_powder", costs: [{ "霊粉": 5, "呪布": 2 }] },
  { id: "kit_return_wing", costs: [{ "黒角": 4, "竜鱗": 1 }] }
]);

export const WORKSHOP_NODES = Object.freeze([...WORKSHOP_BASE_NODES]);

export const WORKSHOP_NODE_BY_ID = new Map(WORKSHOP_NODES.map(node => [node.id, node]));

// Return processing may open one existing side-grade pool automatically after
// a meaningful deep return. These are not new tiers or targeted drop boosts:
// they only make an already-authored possibility eligible in a future run.
// The depth gates prevent repeated shallow returns from farming the whole list.
export const WORKSHOP_LATERAL_UNLOCKS = Object.freeze([
  Object.freeze({
    nodeId: "pool_trap_eater",
    minDepth: 10,
    relatedCoreIds: ["CORE_TRAP_EATER"],
    relatedBuildRoles: ["convert"],
    relatedLootRoles: ["convert"],
    relatedTags: ["trap", "poison", "ward"],
    relatedTypes: ["accessory", "armor"],
    relatedKnowledgeStages: ["observation", "trial", "full"]
  }),
  Object.freeze({
    nodeId: "pool_tomb_raider",
    minDepth: 25,
    relatedCoreIds: ["CORE_TOMB_RAIDER"],
    relatedBuildRoles: ["convert"],
    relatedLootRoles: ["convert"],
    relatedTags: ["search", "treasure"],
    relatedTypes: ["accessory", "weapon"],
    relatedKnowledgeStages: ["trial", "full"]
  }),
  Object.freeze({
    nodeId: "pool_scholar_eye",
    minDepth: 30,
    relatedCoreIds: ["CORE_SCHOLAR_EYE"],
    relatedBuildRoles: ["pivot"],
    relatedLootRoles: ["pivot"],
    relatedTags: ["appraisal", "analysis", "spirit"],
    relatedTypes: ["weapon", "accessory"],
    relatedKnowledgeStages: ["trial", "full"]
  })
]);
