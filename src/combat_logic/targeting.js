export function hasLivingEnemyFrontRow(monsters) {
  return monsters.some(m => m.hp > 0 && (m.row || "front") === "front");
}

export function canMeleeTargetEnemy(monsters, target) {
  if (!target || target.hp <= 0) return false;
  if ((target.row || "front") === "front") return true;
  return !hasLivingEnemyFrontRow(monsters);
}

export function findMeleeFallbackTarget(monsters) {
  const frontIdx = monsters.findIndex(m => m.hp > 0 && (m.row || "front") === "front");
  if (frontIdx !== -1) return frontIdx;
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

export function getLivingTargetCandidates(party, mode = "front") {
  const active = party
    .map((c, i) => ({ c, i }))
    .filter(x => !["dead", "paralyzed"].includes(x.c.status));
  if (mode === "back") {
    const back = active.filter(x => x.i >= 2);
    return back.length > 0 ? back : active;
  }
  if (mode === "lowHp") {
    return [...active].sort((a, b) => (a.c.hp / a.c.maxHp) - (b.c.hp / b.c.maxHp));
  }
  const front = active.filter(x => x.i < 2);
  return front.length > 0 ? front : active;
}

export function pickTarget(party, mode = "front") {
  const candidates = getLivingTargetCandidates(party, mode);
  if (candidates.length === 0) return null;
  if (mode === "lowHp") return candidates[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}
