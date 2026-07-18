import { MATERIAL_DROP_BALANCE } from "../data/materials.js";
import { getDepthMaterialDropChance, rollDepthMaterialQuantity } from "../rules/material_rules.js";

function getMonsterGroup(monster) {
  const name = monster.name.replace(/\s[A-Z]$/, "");
  const tags = monster.tags || [];
  const spriteType = monster.spriteType || "";
  if (tags.includes("dragon") || spriteType === "dragon") return "dragon";
  if (tags.includes("demon") || spriteType === "flack") return "demon";
  if (name.includes("鎧") || name.includes("石") || name.includes("アイアン") || name.includes("ストーン") || name.includes("ゴーレム")) return "armor";
  if (spriteType === "mage" || name.includes("魔術") || name.includes("魔女") || name.includes("術士")) return "caster";
  if (tags.includes("spirit") || spriteType === "spirit" || spriteType === "wisp") return "spirit";
  if (tags.includes("undead") || spriteType === "skeleton" || spriteType === "zombie") return "undead";
  if (monster.isPoisonous || spriteType === "spider" || name.includes("蜘蛛") || name.includes("毒") || name.includes("腐")) return "poison";
  return "beast";
}

const GROUP_MATERIALS = Object.freeze({
  beast: { primary: "獣の牙", secondary: ["硬い皮", "毒腺"] },
  poison: { primary: "毒腺", secondary: ["硬い皮"] },
  undead: { primary: "骨片", secondary: ["霊粉", "呪布"] },
  spirit: { primary: "霊粉", secondary: ["魔石片"] },
  caster: { primary: "魔石片", secondary: ["呪布"] },
  armor: { primary: "鉄片", secondary: ["魔石片"] },
  demon: { primary: "黒角", secondary: ["魔石片", "呪布"] },
  dragon: { primary: "竜鱗", secondary: ["獣の牙"] }
});

export function getMonsterMainMaterial(monster) {
  return GROUP_MATERIALS[getMonsterGroup(monster)].primary;
}

export function determineMonsterDrop(monster, floor, rng = Math.random, { chanceBonus = 0, guaranteed = false, startFloor = 1 } = {}) {
  const group = GROUP_MATERIALS[getMonsterGroup(monster)];
  const isRare = Boolean(monster.isRare);
  const isBoss = Boolean(monster.isBoss);
  const drops = {};
  const quantity = rollDepthMaterialQuantity(floor, rng, { startFloor });
  const dropChance = isBoss ? 1 : isRare ? 0.9 : getDepthMaterialDropChance(floor);

  if (guaranteed || rng() < Math.min(1, dropChance + chanceBonus)) {
    drops[group.primary] = quantity
      + (isRare ? MATERIAL_DROP_BALANCE.rareBonus : 0)
      + (isBoss ? MATERIAL_DROP_BALANCE.bossBonus : 0);
    if (isBoss || isRare || rng() < MATERIAL_DROP_BALANCE.secondaryChance) {
      const secondary = group.secondary[Math.floor(rng() * group.secondary.length)];
      drops[secondary] = Math.max(1, Math.floor(quantity / 2));
    }
  }

  if (isBoss || isRare) {
    const rareMaterial = floor >= 10 ? "竜鱗" : "黒角";
    drops[rareMaterial] = (drops[rareMaterial] || 0) + (isBoss ? 2 : 1);
  }

  return drops;
}
