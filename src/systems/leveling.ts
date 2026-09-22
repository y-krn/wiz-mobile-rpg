import { EXP_LEVELS } from "../data/progression.js";
import { getCharMaxHp } from "../rules/character_stats.js";
import type { CharacterEquipment } from "../state/equipment.js";

export interface LevelingCharacter {
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  equipment?: CharacterEquipment;
}

// Level is a run-local floor, not a build identity. Keep this deliberately
// small until medium/Rune ownership defines the rest of the progression.
export const UNIVERSAL_HP_GROWTH = 5;
export const UNIVERSAL_LEVEL_UP_EXTRA_HEAL = 5;

export function checkCharLevelUp(char: LevelingCharacter): boolean {
  const nextLvl = char.level + 1;
  if (nextLvl >= EXP_LEVELS.length) return false; // Max level reached

  const req = EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;

    const oldMaxHp = getCharMaxHp(char);
    char.maxHp += UNIVERSAL_HP_GROWTH;
    const newMaxHp = getCharMaxHp(char);
    char.hp += (newMaxHp - oldMaxHp);
    const extraHeal = Math.max(
      0,
      Math.min(UNIVERSAL_LEVEL_UP_EXTRA_HEAL, newMaxHp - char.hp)
    );
    char.hp += extraHeal;
    return true;
  }
  return false;
}
