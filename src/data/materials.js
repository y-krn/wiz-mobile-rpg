export const MATERIAL_TYPES = Object.freeze([
  "獣の牙",
  "硬い皮",
  "毒腺",
  "骨片",
  "霊粉",
  "魔石片",
  "鉄片",
  "呪布",
  "黒角",
  "竜鱗"
]);

export const MATERIAL_DROP_BALANCE = Object.freeze({
  baseChance: 0.55,
  depthChancePerFloor: 0.025,
  maxChance: 0.95,
  secondaryChance: 0.28,
  rareBonus: 1,
  bossBonus: 2,
  depthQuantityPerFloor: 0.12,
  milestoneStartMultiplier: 0.6
});

export function createEmptyMaterialBalance() {
  return Object.fromEntries(MATERIAL_TYPES.map(name => [name, 0]));
}
