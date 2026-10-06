// balance-impact: none — normalized run state of the round-trip prototype rule only (#2066).

export interface RoundTripEntry {
  x: number;
  y: number;
}

/**
 * Round-trip state of a run (#2066).
 * - `treasure`: the guardian's treasure is being carried out.
 * - `awake`: the dungeon woke (the run turned back or took the treasure).
 * - `hunterDelay` / `hunterEntry`: player actions left before the hunter steps out, and where.
 * - `hunterCarry`: fractional movement the hunter has saved up.
 * - `hunterSlain`: the hunter was killed; nothing follows any more.
 * - `alert`: how many alert distances have been announced on this approach.
 */
export interface NormalizedRunRoundTrip {
  treasure: boolean;
  awake: boolean;
  hunterDelay: number;
  hunterEntry: RoundTripEntry | null;
  hunterCarry: number;
  hunterSlain: boolean;
  alert: number;
}

const MAX_ALERT = 8;
const MAX_CARRY = 12;
const MAX_DELAY = 99;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toCount(value: unknown, max: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : 0;
}

function normalizeEntry(value: unknown): RoundTripEntry | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  return Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (y as number) >= 0
    ? { x: x as number, y: y as number }
    : null;
}

/** The run's round-trip state, or null for an ordinary run (and for saves from before #2066). */
export function normalizeRunRoundTrip(value: unknown): NormalizedRunRoundTrip | null {
  if (!isRecord(value)) return null;
  const hunterEntry = normalizeEntry(value.hunterEntry);
  const carry = Number(value.hunterCarry);
  return {
    treasure: value.treasure === true,
    awake: value.awake === true,
    hunterDelay: hunterEntry ? toCount(value.hunterDelay, MAX_DELAY) : 0,
    hunterEntry,
    hunterCarry: Number.isFinite(carry) && carry > 0 ? Math.min(carry, MAX_CARRY) : 0,
    hunterSlain: value.hunterSlain === true,
    alert: toCount(value.alert, MAX_ALERT)
  };
}

export function isNormalizedRunRoundTrip(value: unknown): value is NormalizedRunRoundTrip | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.treasure === "boolean" && typeof value.awake === "boolean" &&
    Number.isInteger(value.hunterDelay) && (value.hunterDelay as number) >= 0 &&
    (value.hunterEntry === null || normalizeEntry(value.hunterEntry) !== null) &&
    typeof value.hunterCarry === "number" && Number.isFinite(value.hunterCarry) && value.hunterCarry >= 0 &&
    typeof value.hunterSlain === "boolean" &&
    Number.isInteger(value.alert) && (value.alert as number) >= 0;
}

/** A fresh round-trip run: nothing taken, the dungeon asleep. */
export function createRunRoundTrip(): NormalizedRunRoundTrip {
  return {
    treasure: false,
    awake: false,
    hunterDelay: 0,
    hunterEntry: null,
    hunterCarry: 0,
    hunterSlain: false,
    alert: 0
  };
}
