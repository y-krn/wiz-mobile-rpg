// balance-impact: none — canonical persisted floor-exploration step boundary only.

export type NormalizedFloorSteps = Record<string, number>;

const CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY = /^[1-9]\d*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0;
}

export function isCanonicalFloorStepsKey(value: string): boolean {
  return CANONICAL_POSITIVE_DECIMAL_FLOOR_KEY.test(value);
}

export function isNormalizedFloorSteps(value: unknown): value is NormalizedFloorSteps {
  return isRecord(value) && Object.entries(value).every(([floor, steps]) =>
    isCanonicalFloorStepsKey(floor) && isNonNegativeInteger(steps)
  );
}

export function normalizeFloorSteps(value: unknown): NormalizedFloorSteps {
  if (!isRecord(value)) return {};

  const normalized: NormalizedFloorSteps = {};
  for (const [floor, steps] of Object.entries(value)) {
    if (isCanonicalFloorStepsKey(floor) && isNonNegativeInteger(steps)) {
      normalized[floor] = steps;
    }
  }
  return normalized;
}
