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

// Markers at the head of a log line. `[味方]`, `[ 敵 ]`, `[!]` and `[★]` are
// internal: combat resolution and the simulations read them to tell whose line
// it is, and the player never sees them. `[警告]` is an enemy telegraph and is
// shown as 【予兆】. A leading `[名前]` (a core or trait that fired) is shown
// as `名前：`. Of the 【…】 tags only 【気配】【痕跡】【予兆】 are shown; any
// other leading tag is dropped (#2046).
const INTERNAL_LOG_MARKER_RE = /^\s*\[(?:味方|\s*敵\s*|!|★)\]\s*/;

export function stripLogMarkers(message: unknown): string {
  let text = String(message ?? "");
  while (INTERNAL_LOG_MARKER_RE.test(text)) text = text.replace(INTERNAL_LOG_MARKER_RE, "");
  return text
    .replace(/^\[警告\]\s*/, "【予兆】")
    .replace(/^\[([^\]\d\s][^\]]{0,11})\]\s*/, "$1：")
    .replace(/^【(?!(?:気配|痕跡|予兆)】)[^】]*】\s*/, "");
}
