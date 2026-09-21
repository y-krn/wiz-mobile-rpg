// balance-impact: none — canonical Event Strip persistence boundary only.

export type EventObservationKind = "unresolved" | "result";
export type EventObservationLifecycle = "active" | "resolved";

export interface NormalizedEventObservation {
  key: string;
  scope: string;
  text: string;
  side: string;
  presentationKind: string;
  kind: EventObservationKind;
  lifecycle: EventObservationLifecycle;
}

export type NormalizedEventObservations = Record<string, NormalizedEventObservation>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isEventObservationKind(value: unknown): value is EventObservationKind {
  return value === "unresolved" || value === "result";
}

function isEventObservationLifecycle(value: unknown): value is EventObservationLifecycle {
  return value === "active" || value === "resolved";
}

export function isNormalizedEventObservation(value: unknown): value is NormalizedEventObservation {
  return isRecord(value) &&
    isNonEmptyString(value.key) &&
    typeof value.scope === "string" &&
    typeof value.text === "string" &&
    typeof value.side === "string" &&
    typeof value.presentationKind === "string" &&
    isEventObservationKind(value.kind) &&
    isEventObservationLifecycle(value.lifecycle);
}

export function isNormalizedEventObservations(value: unknown): value is NormalizedEventObservations {
  return isRecord(value) && Object.entries(value).every(([key, entry]) =>
    isNonEmptyString(key) &&
    isNormalizedEventObservation(entry) &&
    entry.key === key
  );
}

function createCanonicalEntry(key: string, entry: Record<string, unknown>): NormalizedEventObservation | null {
  if (!isNonEmptyString(entry.key) || entry.key !== key || typeof entry.text !== "string") return null;
  if (!isEventObservationLifecycle(entry.lifecycle)) return null;

  return {
    key,
    scope: typeof entry.scope === "string" ? entry.scope : "run",
    text: entry.text,
    side: typeof entry.side === "string" ? entry.side : "neutral",
    presentationKind: typeof entry.presentationKind === "string" ? entry.presentationKind : "neutral",
    kind: isEventObservationKind(entry.kind) ? entry.kind : "unresolved",
    lifecycle: entry.lifecycle
  };
}

export function normalizeEventObservations(value: unknown): NormalizedEventObservations {
  if (!isRecord(value)) return {};

  const normalized: NormalizedEventObservations = {};
  for (const [key, rawEntry] of Object.entries(value)) {
    if (key.length === 0 || !isRecord(rawEntry)) continue;
    const entry = createCanonicalEntry(key, rawEntry);
    if (!entry) continue;
    Object.defineProperty(normalized, key, {
      configurable: true,
      enumerable: true,
      value: entry,
      writable: true
    });
  }
  return normalized;
}
