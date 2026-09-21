// balance-impact: none — canonical normalized run-seed boundary only.

export type NormalizedRunSeed = string;

export function isNormalizedRunSeed(value: unknown): value is NormalizedRunSeed {
  return typeof value === "string" && value.length > 0;
}

export function normalizeRunSeed(value: unknown): NormalizedRunSeed | undefined {
  return isNormalizedRunSeed(value) ? value : undefined;
}
