import { CLASSES, CLASS_PASSIVES } from "../data/classes.js";

export const MANA_ITEM_CLASSES = Object.freeze([
  "Priest",
  "Mage",
  "Samurai",
  "Bishop",
  "Ranger"
]);

export function canUsePriestSpells(char) {
  if (!char) return false;
  if (char.class === "Priest" || char.class === "Bishop") return true;
  if (char.class === "Ranger" && char.level >= 3) return true;
  return false;
}

export function canUseMageSpells(char) {
  if (!char) return false;
  if (char.class === "Mage" || char.class === "Bishop") return true;
  if (char.class === "Samurai" && char.level >= 3) return true;
  return false;
}

export function isSpellcaster(char) {
  return canUsePriestSpells(char) || canUseMageSpells(char);
}

export function canUseManaItems(char) {
  return MANA_ITEM_CLASSES.includes(char?.class) && isSpellcaster(char);
}

export function getClassJpName(cls) {
  const mapping = {
    Fighter: "戦士",
    Thief: "盗賊",
    Priest: "僧侶",
    Mage: "魔術師",
    Samurai: "侍",
    Bishop: "司祭",
    Ranger: "野伏",
    Ninja: "忍者"
  };
  return mapping[cls] || cls;
}

export function getClassPassive(char) {
  return CLASS_PASSIVES[char?.class] || { label: "", bonuses: {} };
}

export function getClassPassiveBonus(char, affixType) {
  return getClassPassive(char).bonuses[affixType] || 0;
}

export function getClassCriticalChance(char) {
  const rule = CLASSES[char?.class]?.criticalChance;
  const level = Number(char?.level);
  if (!rule || !Number.isFinite(level)) return 0;
  return Math.min(rule.maxChance, rule.baseChance + rule.perLevel * level);
}
