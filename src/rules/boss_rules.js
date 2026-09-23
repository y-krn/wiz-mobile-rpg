// Milestone boss rules are encounter-scoped and match by floor, name, and role.

export const B5_MILESTONE_BOSS_RULE = Object.freeze({
  id: "B5_DEMON_GUARD_BREAK",
  floor: 5,
  bossName: "デーモンガード",
  breakHpRate: 0.80,
  exposureTurns: 4,
  exposureDamageMultiplier: 1.50
});

export const B10_CRUSH_STRIKE_RULE = Object.freeze({
  id: "B10_STONE_GUARD_CRUSH_STRIKE",
  floor: 10,
  bossName: "ストーンガード",
  damageMin: 18,
  damageMax: 32
});

export const B30_MILESTONE_BOSS_STAT_RULE = Object.freeze({
  id: "B30_ANCIENT_DRAGON_TEMPLATE_HP_ATK",
  floor: 30,
  bossName: "いにしえの竜",
  templateStats: Object.freeze(["hp", "atk"])
});

export function getMilestoneBossStatRule(
  floor,
  bossName,
  { isBoss = false } = {}
) {
  if (
    !isBoss ||
    floor !== B30_MILESTONE_BOSS_STAT_RULE.floor ||
    bossName !== B30_MILESTONE_BOSS_STAT_RULE.bossName
  ) {
    return null;
  }
  return B30_MILESTONE_BOSS_STAT_RULE;
}

export function getMilestoneBossRule(
  floor,
  bossName,
  { isBoss = false } = {}
) {
  if (!isBoss || floor !== B5_MILESTONE_BOSS_RULE.floor || bossName !== B5_MILESTONE_BOSS_RULE.bossName) return null;
  return B5_MILESTONE_BOSS_RULE;
}

export function getMilestoneBossActionRule(floor, bossName, { isBoss = false } = {}) {
  if (!isBoss || floor !== B10_CRUSH_STRIKE_RULE.floor || bossName !== B10_CRUSH_STRIKE_RULE.bossName) {
    return null;
  }
  return B10_CRUSH_STRIKE_RULE;
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
