// balance-impact: none — canonical defeated-milestone persistence boundary only.

export type NormalizedDefeatedMilestones = number[];

function isMilestoneFloor(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 5 &&
    value % 5 === 0;
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  return Array.from({ length: value.length }, (_, index) => index)
    .every(index => Object.hasOwn(value, index));
}

export function isNormalizedDefeatedMilestones(value: unknown): value is NormalizedDefeatedMilestones {
  if (!isDenseArray(value)) return false;
  let previous: number | undefined;
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (!isMilestoneFloor(entry)) return false;
    if (previous !== undefined && previous >= entry) return false;
    previous = entry;
  }
  return true;
}

export function normalizeDefeatedMilestones(value: unknown): NormalizedDefeatedMilestones {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isMilestoneFloor))].sort((a, b) => a - b);
}
