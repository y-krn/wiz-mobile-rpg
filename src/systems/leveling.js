import { EXP_LEVELS } from "../data/progression.js";
import { getCharMaxHp } from "../rules/character_stats.js";

// Level is a run-local floor, not a build identity. Keep this deliberately
// small until medium/Rune ownership defines the rest of the progression.
export const UNIVERSAL_HP_GROWTH = 5;

export function checkCharLevelUp(char) {
  const nextLvl = char.level + 1;
  if (nextLvl >= EXP_LEVELS.length) return false; // Max level reached

  const req = EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;

    const oldMaxHp = getCharMaxHp(char);
    char.maxHp += UNIVERSAL_HP_GROWTH;
    const newMaxHp = getCharMaxHp(char);
    char.hp += (newMaxHp - oldMaxHp);
    return true;
  }
  return false;
}
