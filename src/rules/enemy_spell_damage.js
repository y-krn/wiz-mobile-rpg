// Enemy spell damage scales with the caster's attack (#2064). The attack comes
// from the dungeon's strength table, so a spell is as dangerous on the first
// floor of a later dungeon as it is in the mine, and never a fixed number
// written for a deep floor that would fell a fresh adventurer.
//
// The ranges keep the old fixed rolls where the mine and the catacomb meet
// these spells (Flack's flame storm at attack 13 is 10-23, the catacomb
// guardian's crush strike at attack 12 is 18-32).
export const ENEMY_SPELL_ATTACK_SCALE = Object.freeze({
  LAHALITO: Object.freeze({ min: 0.8, max: 1.8 }),
  MADALTO: Object.freeze({ min: 1.0, max: 2.2 }),
  CRUSH_STRIKE: Object.freeze({ min: 1.5, max: 2.7 }),
  // The ancient dragon (#2064): its great blast, its fire breath, and its ice
  // storm, scaled from its old fixed rolls at its authored attack 26.
  DRAGON_TILTOWAIT: Object.freeze({ min: 1.7, max: 2.9 }),
  DRAGON_BREATH: Object.freeze({ min: 0.45, max: 0.9 }),
  DRAGON_MADALTO: Object.freeze({ min: 0.6, max: 1.35 })
});

export function getAttackScaledDamageRange(attack, scale) {
  const atk = Math.max(1, Number(attack) || 1);
  const min = Math.max(1, Math.round(atk * scale.min));
  return { min, max: Math.max(min, Math.round(atk * scale.max)) };
}

export function rollAttackScaledDamage(attack, scale, rng = Math.random) {
  const { min, max } = getAttackScaledDamageRange(attack, scale);
  return min + Math.floor(rng() * (max - min + 1));
}
