export function getDepthScaling(floor) {
  const depth = Math.max(1, Math.floor(Number(floor) || 1));
  const milestoneTier = Math.floor((depth - 1) / 5);
  const linear = 1 + (depth - 1) * 0.035;
  const milestone = 1 + milestoneTier * 0.055;
  return Object.freeze({
    floor: depth,
    milestoneTier,
    enemy: linear * milestone,
    reward: (1 + (depth - 1) * 0.045) * (1 + milestoneTier * 0.07)
  });
}

export function scaleEnemyForDepth(monster, floor, { boss = false } = {}) {
  const scaling = getDepthScaling(floor);
  const bossMultiplier = boss ? 1.12 : 1;
  const deepBandCap = getDepthScaling(10).enemy;
  const hpMultiplier = (
    scaling.floor <= 10
      ? scaling.enemy
      : deepBandCap + (scaling.enemy - deepBandCap) * 0.5
  ) * bossMultiplier;
  const attackGrowth = scaling.floor <= 10 ? 0.58 : 0.25;
  const attackMultiplier = 1 + (scaling.enemy - 1) * attackGrowth + (boss ? 0.08 : 0);
  const defenseMultiplier = 1 + (scaling.enemy - 1) * 0.34;
  const rewardMultiplier = scaling.reward * (boss ? 1.2 : 1);
  const hp = Math.max(1, Math.round(monster.hp * hpMultiplier));
  return {
    ...monster,
    hp,
    maxHp: hp,
    atk: Math.max(1, Math.round(monster.atk * attackMultiplier)),
    def: Math.max(0, Math.round(monster.def * defenseMultiplier)),
    exp: Math.max(1, Math.round(monster.exp * rewardMultiplier)),
    isBoss: boss || monster.isBoss,
    depthFloor: scaling.floor
  };
}
