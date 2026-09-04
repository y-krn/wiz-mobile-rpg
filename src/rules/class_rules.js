import { CLASSES, CLASS_PASSIVES } from "../data/classes.js";
import { SPELLS } from "../data/spells.js";
import { getActiveSpellKeys } from "./magic_rules.js";

const EMPTY_CLASS_PASSIVE = Object.freeze({ label: "", bonuses: Object.freeze({}) });

export const MANA_ITEM_CLASSES = Object.freeze([
  "Priest",
  "Mage",
  "Samurai",
  "Bishop",
  "Ranger"
]);

export function canUsePriestSpells(char) {
  if (!char) return false;
  if (char.startingKit) return getActiveSpellKeys(char).some(spellKey => SPELLS[spellKey]?.type === "priest");
  if (char.class === "Priest" || char.class === "Bishop") return true;
  if (char.class === "Ranger") return true;
  return false;
}

export function canUseMageSpells(char) {
  if (!char) return false;
  if (char.startingKit) return getActiveSpellKeys(char).some(spellKey => SPELLS[spellKey]?.type === "mage");
  if (char.class === "Mage" || char.class === "Bishop") return true;
  if (char.class === "Samurai") return true;
  return false;
}

export function isSpellcaster(char) {
  if (char?.startingKit) return getActiveSpellKeys(char).length > 0;
  return canUsePriestSpells(char) || canUseMageSpells(char);
}

export function canUseManaItems(char) {
  if (char?.startingKit) return Number(char.maxMp) > 0;
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
  if (char?.startingKit) return EMPTY_CLASS_PASSIVE;
  return CLASS_PASSIVES[char?.class] || EMPTY_CLASS_PASSIVE;
}

export function getClassPassiveBonus(char, affixType) {
  return getClassPassive(char).bonuses[affixType] || 0;
}

export function getClassCriticalChance(char) {
  if (char?.startingKit) return 0;
  const rule = CLASSES[char?.class]?.criticalChance;
  const level = Number(char?.level);
  if (!rule || !Number.isFinite(level)) return 0;
  return Math.min(rule.maxChance, rule.baseChance + rule.perLevel * level);
}
