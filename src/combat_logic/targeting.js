export function canMeleeTargetEnemy(_monsters, target) {
  return Boolean(target && target.hp > 0);
}

export function findMeleeFallbackTarget(monsters) {
  return monsters.findIndex(m => m.hp > 0);
}

export function findAdjacentGuard(monsters, targetIdx) {
  const candidates = [targetIdx - 1, targetIdx + 1]
    .filter(idx => idx >= 0 && idx < monsters.length)
    .map(idx => ({ idx, mon: monsters[idx] }))
    .filter(x => x.mon.hp > 0 && x.mon.traits?.includes("guardAdjacent"));
  if (candidates.length === 0) return null;
  const guard = candidates.find(x => Math.random() < (x.mon.guard?.chance ?? 0.5));
  return guard || null;
}

export function getLivingTargetCandidates(party, mode = "random") {
  const active = party
    .map((c, i) => ({ c, i }))
    .filter(x => x.c.status !== "dead");
  if (mode === "lowHp") {
    return [...active].sort((a, b) => (a.c.hp / a.c.maxHp) - (b.c.hp / b.c.maxHp));
  }
  return active;
}

export function pickTarget(party, mode = "random") {
  const candidates = getLivingTargetCandidates(party, mode);
  if (candidates.length === 0) return null;
  if (mode === "lowHp") return candidates[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
