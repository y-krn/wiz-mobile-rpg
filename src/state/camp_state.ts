// balance-impact: none — canonical Camp persistence boundary only.

export type NormalizedCampRested = Record<string, true>;
export type NormalizedPendingCampEntryFloor = number | null;
export type NormalizedCompletedCampEntryFloors = number[];

const CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY = /^[1-9]\d*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1;
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  return Array.from({ length: value.length }, (_, index) => index)
    .every(index => Object.hasOwn(value, index));
}

export function isCanonicalCampRestedFloorKey(value: string): boolean {
  return CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY.test(value);
}

export function isNormalizedCampRested(value: unknown): value is NormalizedCampRested {
  return isRecord(value) && Object.entries(value).every(([floor, rested]) =>
    isCanonicalCampRestedFloorKey(floor) && rested === true
  );
}

export function normalizeCampRested(value: unknown): NormalizedCampRested {
  if (!isRecord(value)) return {};
  const normalized: NormalizedCampRested = {};
  Object.entries(value).forEach(([floor, rested]) => {
    if (isCanonicalCampRestedFloorKey(floor) && rested === true) normalized[floor] = true;
  });
  return normalized;
}

export function isNormalizedPendingCampEntryFloor(
  value: unknown
): value is NormalizedPendingCampEntryFloor {
  return value === null || isPositiveInteger(value);
}

export function normalizePendingCampEntryFloor(value: unknown): NormalizedPendingCampEntryFloor {
  return isPositiveInteger(value) ? value : null;
}

export function isNormalizedCompletedCampEntryFloors(
  value: unknown
): value is NormalizedCompletedCampEntryFloors {
  if (!isDenseArray(value)) return false;
  let previous: number | undefined;
  for (const entry of value) {
    if (!isPositiveInteger(entry)) return false;
    if (previous !== undefined && previous >= entry) return false;
    previous = entry;
  }
  return true;
}

export function normalizeCompletedCampEntryFloors(value: unknown): NormalizedCompletedCampEntryFloors {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isPositiveInteger))].sort((a, b) => a - b);
}
