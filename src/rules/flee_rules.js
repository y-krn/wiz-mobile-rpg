// Fleeing (#2101). An ordinary fight can be fled by chance: 70% against one
// enemy, 10% less for each further one, raised by the equipment's escape
// support (`escapeChance`, in percent), held between 30% and 95%. A failed
// flee spends the adventurer's turn. A clean flee leaves no parting blow.
// The roaming strong enemy (and the round-trip hunter, which is one), a
// midboss, and the guardian are always fled at the price of a parting blow,
// as before (f1dce775): the way back is built on being able to shake the
// hunter off.
import { getCharAffixSum } from "./item_rules.js";

export const FLEE_BASE_CHANCE = 0.7;
export const FLEE_CHANCE_PER_EXTRA_ENEMY = 0.1;
export const FLEE_MIN_CHANCE = 0.3;
export const FLEE_MAX_CHANCE = 0.95;

export function isFleeGuaranteed(combatState) {
  return Boolean(combatState?.isBoss || combatState?.isMidboss || combatState?.isRoamingFlack);
}

export function getFleeChance(char, combatState) {
  if (isFleeGuaranteed(combatState)) return 1;
  const enemies = (combatState?.monsters || []).filter(monster => monster.hp > 0 && !monster.fled).length;
  const support = (Number(getCharAffixSum(char, "escapeChance")) || 0) / 100;
  const chance = FLEE_BASE_CHANCE - FLEE_CHANCE_PER_EXTRA_ENEMY * Math.max(0, enemies - 1) + support;
  return Math.max(FLEE_MIN_CHANCE, Math.min(FLEE_MAX_CHANCE, chance));
}
