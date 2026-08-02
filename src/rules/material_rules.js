import { MATERIAL_DROP_BALANCE, MATERIAL_TYPES, createEmptyMaterialBalance } from "../data/materials.js";

export const BANKING_RATES = Object.freeze({ retreat: 1, death: 0.3 });

// Measurement-only comparator for the pre-#380 predicate order.
export function getLegacyMonsterGroupClassification(monster = {}) {
  const name = String(monster.name || "").replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  if (tags.includes("dragon") || spriteType === "dragon") {
    return { group: "dragon", source: "legacy" };
  }
  if (tags.includes("demon") || spriteType === "flack") {
    return { group: "demon", source: "legacy" };
  }
  if (
    name.includes("鎧") ||
    name.includes("石") ||
    name.includes("アイアン") ||
    name.includes("ストーン") ||
    name.includes("ゴーレム")
  ) {
    return { group: "armor", source: "legacy" };
  }
  if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女") || name.includes("術士")) {
    return { group: "caster", source: "legacy" };
  }
  if (tags.includes("spirit") || spriteType === "spirit" || spriteType === "wisp") {
    return { group: "spirit", source: "legacy" };
  }
  if (tags.includes("undead") || spriteType === "skeleton" || spriteType === "zombie") {
    return { group: "undead", source: "legacy" };
  }
  if (monster.isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒") || name.includes("腐")) {
    return { group: "poison", source: "legacy" };
  }
  return { group: "beast", source: "legacy" };
}

export function getMonsterGroupClassification(monster = {}) {
  const name = String(monster.name || "").replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  if (tags.includes("dragon")) return { group: "dragon", source: "tag" };
  if (tags.includes("demon")) return { group: "demon", source: "tag" };
  if (tags.includes("spirit")) return { group: "spirit", source: "tag" };
  if (tags.includes("undead")) return { group: "undead", source: "tag" };
  if (monster.isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒") || name.includes("腐")) {
    return { group: "poison", source: "predicate" };
  }
  if (tags.includes("beast")) return { group: "beast", source: "tag" };
  if (monster.spell) return { group: "caster", source: "spell" };
  if (spriteType === "dragon") return { group: "dragon", source: "spriteType" };
  if (spriteType === "flack") return { group: "demon", source: "spriteType" };
  if (name.includes("鎧") || name.includes("石") || name.includes("アイアン") || name.includes("ストーン") || name.includes("ゴーレム") || name.includes("鉄皮")) {
    return { group: "armor", source: "predicate" };
  }
  if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女") || name.includes("術士")) {
    return { group: "caster", source: "predicate" };
  }
  if (spriteType === "spirit" || spriteType === "wisp") {
    return { group: "spirit", source: "spriteType" };
  }
  if (spriteType === "skeleton" || spriteType === "zombie") {
    return { group: "undead", source: "spriteType" };
  }
  return { group: "beast", source: "fallback" };
}

export function getMonsterGroup(monster) {
  return getMonsterGroupClassification(monster).group;
}

export function getRareMaterialForFloor(
  floor,
  { rareMaterialFloor = MATERIAL_DROP_BALANCE.rareMaterialFloor } = {}
) {
  return Math.max(1, Math.floor(Number(floor) || 1)) >= rareMaterialFloor
    ? "竜鱗"
    : "黒角";
}

const CHEST_MATERIAL_POOLS = Object.freeze({
  default: Object.freeze({
    floor1: Object.freeze(["獣の牙", "硬い皮"]),
    floor2: Object.freeze(["獣の牙", "硬い皮", "毒腺", "骨片"]),
    floor3: Object.freeze(["骨片", "霊粉", "魔石片", "呪布"]),
    floor4: Object.freeze(["魔石片", "鉄片", "呪布", "黒角"]),
    deep: Object.freeze(["鉄片", "黒角", "竜鱗"])
  }),
  "early-rare": Object.freeze({
    floor1: Object.freeze(["獣の牙", "硬い皮"]),
    floor2: Object.freeze(["獣の牙", "硬い皮", "毒腺", "骨片", "鉄片", "竜鱗"]),
    floor3: Object.freeze(["骨片", "霊粉", "魔石片", "呪布"]),
    floor4: Object.freeze(["魔石片", "鉄片", "呪布", "黒角"]),
    deep: Object.freeze(["鉄片", "黒角", "竜鱗"])
  }),
  "early-balanced": Object.freeze({
    floor1: Object.freeze(["獣の牙", "硬い皮", "霊粉", "魔石片"]),
    floor2: Object.freeze(["獣の牙", "硬い皮", "毒腺", "骨片", "霊粉", "魔石片", "鉄片", "竜鱗"]),
    floor3: Object.freeze(["骨片", "霊粉", "魔石片", "呪布"]),
    floor4: Object.freeze(["魔石片", "鉄片", "呪布", "黒角"]),
    deep: Object.freeze(["鉄片", "黒角", "竜鱗"])
  })
});

const SCARCE_SECONDARY_MATERIALS = Object.freeze({
  beast: Object.freeze(["魔石片", "呪布"]),
  poison: Object.freeze(["霊粉", "呪布"]),
  undead: Object.freeze(["霊粉", "呪布"]),
  spirit: Object.freeze(["魔石片", "呪布"]),
  caster: Object.freeze(["霊粉", "呪布"]),
  armor: Object.freeze(["魔石片", "呪布"]),
  demon: Object.freeze(["魔石片", "呪布"]),
  dragon: Object.freeze(["鉄片", "獣の牙"])
});
const LEGACY_BEAST_SECONDARY_MATERIALS = Object.freeze(["硬い皮", "毒腺"]);

export function getMonsterSecondaryMaterialPool(
  group,
  defaultPool,
  { profile = MATERIAL_DROP_BALANCE.secondaryMaterialProfile } = {}
) {
  if ((profile === "default" || profile === "legacy") && group === "beast") {
    return LEGACY_BEAST_SECONDARY_MATERIALS;
  }
  if (profile === "arcane" && group === "beast") {
    return ["魔石片", "呪布"];
  }
  if (profile === "magic" && group === "beast") {
    return ["魔石片", "硬い皮"];
  }
  if (profile === "magic-poison" && group === "beast") {
    return ["魔石片", "毒腺"];
  }
  if (profile !== "scarce") return defaultPool;
  return SCARCE_SECONDARY_MATERIALS[group] || defaultPool;
}

export function getChestMaterialPool(
  floor,
  { profile = MATERIAL_DROP_BALANCE.chestMaterialProfile } = {}
) {
  const pools = CHEST_MATERIAL_POOLS[profile] || CHEST_MATERIAL_POOLS.default;
  if (floor === 1) return pools.floor1;
  if (floor === 2) return pools.floor2;
  if (floor === 3) return pools.floor3;
  if (floor === 4) return pools.floor4;
  return pools.deep;
}

export function normalizeMaterialBalance(balance = {}) {
  const normalized = createEmptyMaterialBalance();
  MATERIAL_TYPES.forEach(name => {
    normalized[name] = Math.max(0, Math.floor(Number(balance[name]) || 0));
  });
  return normalized;
}

export function addMaterials(balance, additions) {
  const next = normalizeMaterialBalance(balance);
  Object.entries(additions || {}).forEach(([name, quantity]) => {
    if (!MATERIAL_TYPES.includes(name)) return;
    next[name] += Math.max(0, Math.floor(Number(quantity) || 0));
  });
  return next;
}

export function getBankedMaterials(runMaterials, outcome) {
  const rate = outcome === "death" ? BANKING_RATES.death : BANKING_RATES.retreat;
  return Object.fromEntries(MATERIAL_TYPES.map(name => [
    name,
    Math.floor((Number(runMaterials?.[name]) || 0) * rate)
  ]));
}

export function bankRunMaterials(metaMaterials, runMaterials, outcome) {
  const banked = getBankedMaterials(runMaterials, outcome);
  return { banked, balance: addMaterials(metaMaterials, banked) };
}

export function getDepthMaterialExpectedQuantity(depth, { startFloor = 1 } = {}) {
  const floor = Math.max(1, Math.floor(Number(depth) || 1));
  const milestoneTier = Math.floor((floor - 1) / 5);
  const raw = (1 + (floor - 1) * MATERIAL_DROP_BALANCE.depthQuantityPerFloor)
    * (1 + milestoneTier * 0.08);
  return startFloor > 1 ? raw * MATERIAL_DROP_BALANCE.milestoneStartMultiplier : raw;
}

export function getDepthMaterialQuantity(depth, { startFloor = 1 } = {}) {
  return Math.max(1, Math.floor(getDepthMaterialExpectedQuantity(depth, { startFloor })));
}

export function rollDepthMaterialQuantity(depth, rng = Math.random, { startFloor = 1 } = {}) {
  const expected = getDepthMaterialExpectedQuantity(depth, { startFloor });
  const base = Math.max(1, Math.floor(expected));
  return base + (rng() < expected - Math.floor(expected) ? 1 : 0);
}

export function getDepthMaterialDropChance(depth) {
  return Math.min(
    MATERIAL_DROP_BALANCE.maxChance,
    MATERIAL_DROP_BALANCE.baseChance + Math.max(0, depth - 1) * MATERIAL_DROP_BALANCE.depthChancePerFloor
  );
}

export function getScholarMaterialBonus(monster, floor, { startFloor = 1 } = {}) {
  const normalDropChance = monster.isBoss
    ? 1
    : (monster.isRare ? 0.9 : getDepthMaterialDropChance(floor));
  const quantity = getDepthMaterialExpectedQuantity(floor, { startFloor });
  const primaryQuantity = quantity +
    (monster.isRare ? MATERIAL_DROP_BALANCE.rareBonus : 0) +
    (monster.isBoss ? MATERIAL_DROP_BALANCE.bossBonus : 0);
  const secondaryChance = (monster.isBoss || monster.isRare)
    ? 1
    : MATERIAL_DROP_BALANCE.secondaryChance;
  const secondaryQuantity = Math.max(1, Math.floor(quantity / 2));
  return (1 - normalDropChance) * (primaryQuantity + secondaryChance * secondaryQuantity);
}

export function canAffordMaterials(balance, cost) {
  return Object.entries(cost || {}).every(([name, quantity]) => (balance?.[name] || 0) >= quantity);
}

export function getTotalMaterialCount(balance) {
  const normalized = normalizeMaterialBalance(balance);
  return MATERIAL_TYPES.reduce((sum, name) => sum + normalized[name], 0);
}

// 種別を問わず合計 total 個を支払う。在庫の多い素材から削るので、偏った余剰から
// 先に減る。種別固定のコストでは需要のない素材が無価値のまま残るため、恒常シンクは
// この形で受け取る（#234）。
export function spendAnyMaterials(balance, total) {
  const required = Math.max(0, Math.floor(Number(total) || 0));
  const next = normalizeMaterialBalance(balance);
  if (getTotalMaterialCount(next) < required) return null;
  const spent = createEmptyMaterialBalance();
  let remaining = required;
  const byStock = [...MATERIAL_TYPES].sort((left, right) => next[right] - next[left]);
  for (const name of byStock) {
    if (remaining <= 0) break;
    const paid = Math.min(next[name], remaining);
    next[name] -= paid;
    spent[name] += paid;
    remaining -= paid;
  }
  return { balance: next, spent };
}

export function spendMaterials(balance, cost) {
  if (!canAffordMaterials(balance, cost)) return null;
  const next = normalizeMaterialBalance(balance);
  Object.entries(cost || {}).forEach(([name, quantity]) => {
    next[name] -= quantity;
  });
  return next;
}
