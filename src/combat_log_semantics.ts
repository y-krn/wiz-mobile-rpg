export const COMBAT_LOG_PRESENTATION_KINDS = Object.freeze({
  DAMAGE_DEALT: "damage-dealt",
  DAMAGE_TAKEN: "damage-taken",
  HEALING: "healing",
  STATUS_GOOD: "status-good",
  STATUS_BAD: "status-bad",
  NEUTRAL: "neutral"
});

export type CombatLogPresentationKind =
  | "damage-dealt"
  | "damage-taken"
  | "healing"
  | "status-good"
  | "status-bad"
  | "neutral";

export function normalizeCombatLogPresentationKind(kind: unknown): CombatLogPresentationKind {
  return Object.values(COMBAT_LOG_PRESENTATION_KINDS).includes(kind as CombatLogPresentationKind)
    ? kind as CombatLogPresentationKind
    : COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
}

export function mergeCombatLogPresentationKinds(entries: unknown): CombatLogPresentationKind {
  const kinds = new Set(
    (entries as unknown[])
      .map(entry => normalizeCombatLogPresentationKind(
        (entry as { presentationKind?: unknown } | null | undefined)?.presentationKind
      ))
      .filter(kind => kind !== COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL)
  );
  return kinds.size === 1
    ? [...kinds][0]
    : COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
}
