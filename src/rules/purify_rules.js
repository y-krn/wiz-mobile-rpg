export function isPurifyTarget(target, targetTags = []) {
  return targetTags.some(tag => target?.tags?.includes(tag));
}

export function resolvePurifyRecovery({
  target,
  targetTags = [],
  hp = 0,
  maxHp = 0,
  mp = 0,
  maxMp = 0,
  mpRecovery = 0,
  fullMpHpRecovery = 0
} = {}) {
  if (hp <= 0 || !isPurifyTarget(target, targetTags)) {
    return { targetMatched: false, mpRecovered: 0, hpRecovered: 0 };
  }

  if (mp < maxMp) {
    return {
      targetMatched: true,
      mpRecovered: Math.min(Math.max(0, mpRecovery), Math.max(0, maxMp - mp)),
      hpRecovered: 0
    };
  }

  return {
    targetMatched: true,
    mpRecovered: 0,
    hpRecovered: Math.min(Math.max(0, fullMpHpRecovery), Math.max(0, maxHp - hp))
  };
}
