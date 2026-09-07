// balance-impact: none — presentation metadata only; combat resolution is unchanged.
export const COMBAT_LOG_PRESENTATION_KINDS = Object.freeze({
  DAMAGE_DEALT: "damage-dealt",
  DAMAGE_TAKEN: "damage-taken",
  HEALING: "healing",
  STATUS_GOOD: "status-good",
  STATUS_BAD: "status-bad",
  NEUTRAL: "neutral"
});

export function normalizeCombatLogPresentationKind(kind) {
  return Object.values(COMBAT_LOG_PRESENTATION_KINDS).includes(kind)
    ? kind
    : COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
}

export function mergeCombatLogPresentationKinds(entries) {
  const kinds = new Set(
    entries
      .map(entry => normalizeCombatLogPresentationKind(entry?.presentationKind))
      .filter(kind => kind !== COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL)
  );
  return kinds.size === 1
    ? [...kinds][0]
    : COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
}
