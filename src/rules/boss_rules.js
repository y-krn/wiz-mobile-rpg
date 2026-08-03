// B5 milestone boss rules are deliberately scoped to the encounter itself.
// They do not alter depth, rewards, materials, banking, or non-milestone floors.

export const B5_MILESTONE_BOSS_RULE = Object.freeze({
  id: "B5_DEMON_GUARD_BREAK",
  floor: 5,
  bossName: "デーモンガード",
  breakHpRate: 0.80,
  exposureTurns: 4,
  exposureDamageMultiplier: 1.50
});

export function getMilestoneBossRule(
  floor,
  bossName,
  { isBoss = false } = {}
) {
  if (
    !isBoss ||
    floor !== B5_MILESTONE_BOSS_RULE.floor ||
    bossName !== B5_MILESTONE_BOSS_RULE.bossName
  ) {
    return null;
  }
  return B5_MILESTONE_BOSS_RULE;
}

export function getMilestoneBossExposureMultiplier(
  floor,
  monster,
  { isBoss = monster?.isBoss } = {}
) {
  const rule = getMilestoneBossRule(floor, monster?.name, { isBoss });
  if (!rule || (monster?.b5ExposureTurns || 0) <= 0) return 1;
  return rule.exposureDamageMultiplier;
}

export function shouldBreakMilestoneBossGuard(monster, rule) {
  if (!monster || !rule || monster.b5GuardBroken || !monster.lahalitoQueued) return false;
  return monster.hp <= monster.maxHp * rule.breakHpRate;
}
