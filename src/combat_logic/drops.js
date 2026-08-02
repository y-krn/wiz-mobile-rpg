import { MATERIAL_DROP_BALANCE } from "../data/materials.js";
import {
  getDepthMaterialDropChance,
  getMonsterGroup,
  getRareMaterialForFloor,
  getMonsterSecondaryMaterialPool,
  rollDepthMaterialQuantity
} from "../rules/material_rules.js";

export { getMonsterGroup, getMonsterGroupClassification } from "../rules/material_rules.js";

const GROUP_MATERIALS = Object.freeze({
  beast: { primary: "獣の牙", secondary: ["魔石片", "毒腺"] },
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

export function determineMonsterDrop(
  monster,
  floor,
  rng = Math.random,
  {
    chanceBonus = 0,
    guaranteed = false,
    startFloor = 1,
    rareMaterialFloor,
    secondaryMaterialProfile
  } = {}
) {
  const groupName = getMonsterGroup(monster);
  const group = GROUP_MATERIALS[groupName];
  const secondaryPool = getMonsterSecondaryMaterialPool(
    groupName,
    group.secondary,
    { profile: secondaryMaterialProfile }
  );
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
      const secondary = secondaryPool[Math.floor(rng() * secondaryPool.length)];
      drops[secondary] = Math.max(1, Math.floor(quantity / 2));
    }
  }

  if (isBoss || isRare) {
    const rareMaterial = getRareMaterialForFloor(floor, { rareMaterialFloor });
    drops[rareMaterial] = (drops[rareMaterial] || 0) + (isBoss ? 2 : 1);
  }

  return drops;
}
