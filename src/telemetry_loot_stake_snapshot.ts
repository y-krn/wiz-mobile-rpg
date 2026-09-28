import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface LootStakeSnapshotPayloadInput {
  runId: unknown;
  context: Record<string, unknown>;
  get snapshotPoint(): unknown;
  safeSnapshotPoints: ReadonlySet<string>;
  get settlementOutcome(): unknown;
  get selectedLootCount(): unknown;
  inventoryCapacity: number;
  get stakeSnapshotFields(): Record<string, unknown>;
}

const SAFE_SETTLEMENT_OUTCOMES = new Set(["retreat", "wing", "death", "abandon"]);

export interface LootStakeSnapshotPayload {
  [key: string]: unknown;
}

export function buildLootStakeSnapshotPayload(
  input: LootStakeSnapshotPayloadInput
): LootStakeSnapshotPayload {
  const snapshotPoint = normalizeStableValue(input.snapshotPoint, input.safeSnapshotPoints);
  const settlementOutcome = normalizeOptionalStableValue(
    input.settlementOutcome,
    SAFE_SETTLEMENT_OUTCOMES
  );
  const selectedLootCount = boundedFiniteOrNull(
    input.selectedLootCount,
    0,
    input.inventoryCapacity
  );
  const stakeSnapshotFields = input.stakeSnapshotFields;

  return {
    runId: input.runId,
    ...input.context,
    snapshotPoint,
    settlementOutcome,
    selectedLootCount,
    ...stakeSnapshotFields
  };
}
