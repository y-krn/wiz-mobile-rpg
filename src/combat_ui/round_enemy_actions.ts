// balance-impact: none — combat log presentation only.
// Enemy actions played back in the current round. The event strip keeps only
// the latest line during combat, so without this digest an enemy action that
// resolved before the party's own action disappears from view by round end.
// The digest belongs to one combatState, so a combat that ends without the
// normal cleanup (for example a defeat) cannot leak lines into the next one.
let roundEnemyActions: string[] = [];
let roundOwner: unknown = null;

export function resetRoundEnemyActions(owner: unknown = null): void {
  roundEnemyActions = [];
  roundOwner = owner;
}

export function recordRoundEnemyAction(message: unknown, owner: unknown): void {
  const text = String(message ?? "").trim();
  if (!text || !owner) return;
  if (owner !== roundOwner) resetRoundEnemyActions(owner);
  roundEnemyActions.push(text);
}

export function getRoundEnemyActions(owner: unknown): string[] {
  return owner && owner === roundOwner ? roundEnemyActions.slice() : [];
}
