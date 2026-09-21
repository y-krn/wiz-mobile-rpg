// balance-impact: none — canonical persisted run-record snapshot only.

export type NormalizedRunRecordOutcome = "" | "retreat" | "death" | "abandon";

export interface NormalizedRunRecordResult {
  updated: boolean;
  updates: string[];
  milestones: string[];
  runNumber: number;
  depth: number;
  outcome: NormalizedRunRecordOutcome;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

function isNormalizedRunRecordOutcome(value: unknown): value is NormalizedRunRecordOutcome {
  return value === "" || value === "retreat" || value === "death" || value === "abandon";
}

function hasCanonicalFields(value: Record<string, unknown>): boolean {
  return ["updated", "updates", "milestones", "runNumber", "depth", "outcome"]
    .every(field => Object.hasOwn(value, field));
}

export function isNormalizedRunRecordResult(value: unknown): value is NormalizedRunRecordResult {
  return isRecord(value) &&
    hasCanonicalFields(value) &&
    typeof value.updated === "boolean" &&
    Array.isArray(value.updates) &&
    value.updates.every(update => typeof update === "string") &&
    Array.isArray(value.milestones) &&
    value.milestones.every(milestone => typeof milestone === "string") &&
    isNonNegativeInteger(value.runNumber) &&
    isPositiveInteger(value.depth) &&
    isNormalizedRunRecordOutcome(value.outcome);
}

function normalizeUpdates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((update): update is string => typeof update === "string" && (
    update === "最深到達記録" ||
    update === "撤退最深" ||
    update === "死亡最深" ||
    !update.endsWith("最深")
  ));
}

function normalizeMilestones(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((milestone): milestone is string => typeof milestone === "string")
    : [];
}

export function normalizeRunRecordResult(value: unknown): NormalizedRunRecordResult | null {
  if (!isRecord(value)) return null;
  return {
    updated: value.updated === true,
    updates: normalizeUpdates(value.updates),
    milestones: normalizeMilestones(value.milestones),
    runNumber: isNonNegativeInteger(value.runNumber) ? value.runNumber : 0,
    depth: isPositiveInteger(value.depth) ? value.depth : 1,
    outcome: isNormalizedRunRecordOutcome(value.outcome) ? value.outcome : ""
  };
}
