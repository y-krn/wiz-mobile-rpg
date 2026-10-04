// balance-impact: none — persisted guidebook progress only (#2013).
//
// Fragments are won from strong enemies and kept only by a safe return.
// Pages are decoded in a fixed order with fragments; a page states a rule of
// the dungeon and changes no number.

export interface NormalizedGuidebookState {
  /** Fragments brought home and not spent yet. */
  fragments: number;
  /** How many pages have been decoded, in order. */
  decoded: number;
}

/** What a finished run did with the fragments it carried. */
export interface RunGuideResult {
  carried: number;
  kept: boolean;
}

export type NormalizedRunGuideResult = RunGuideResult | null;

const FRAGMENT_LIMIT = 9999;
const PAGE_LIMIT = 99;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toCount(value: unknown, limit: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, limit) : 0;
}

function isCount(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= limit;
}

export function createDefaultGuidebookState(): NormalizedGuidebookState {
  return { fragments: 0, decoded: 0 };
}

export function isNormalizedGuidebookState(value: unknown): value is NormalizedGuidebookState {
  return isRecord(value) && isCount(value.fragments, FRAGMENT_LIMIT) && isCount(value.decoded, PAGE_LIMIT);
}

/** A save from before the guidebook loads with no fragments and no pages. */
export function normalizeGuidebookState(value: unknown): NormalizedGuidebookState {
  const source = isRecord(value) ? value : {};
  return {
    fragments: toCount(source.fragments, FRAGMENT_LIMIT),
    decoded: toCount(source.decoded, PAGE_LIMIT)
  };
}

/** Fragments carried by the running run. */
export function normalizeRunGuideFragments(value: unknown): number {
  return toCount(value, FRAGMENT_LIMIT);
}

export function isRunGuideFragments(value: unknown): value is number {
  return isCount(value, FRAGMENT_LIMIT);
}

export function isNormalizedRunGuideResult(value: unknown): value is NormalizedRunGuideResult {
  if (value === null) return true;
  return isRecord(value) && isCount(value.carried, FRAGMENT_LIMIT) && value.carried > 0 &&
    typeof value.kept === "boolean";
}

export function normalizeRunGuideResult(value: unknown): NormalizedRunGuideResult {
  if (!isRecord(value)) return null;
  const carried = toCount(value.carried, FRAGMENT_LIMIT);
  return carried > 0 ? { carried, kept: value.kept === true } : null;
}
