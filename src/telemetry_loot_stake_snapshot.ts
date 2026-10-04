import { normalizeOptionalStableValue, normalizeStableValue } from "./telemetry_normalization.js";

export interface LootStakeSnapshotPayloadInput {
  runId: unknown;
  context: Record<string, unknown>;
  get snapshotPoint(): unknown;
  safeSnapshotPoints: ReadonlySet<string>;
  get settlementOutcome(): unknown;
  get stakeSnapshotFields(): Record<string, unknown>;
}

type LootStakeSettlementOutcome = "retreat" | "wing" | "death" | "abandon";

const SAFE_SETTLEMENT_OUTCOMES = new Set<LootStakeSettlementOutcome>([
  "retreat", "wing", "death", "abandon"
]);

export interface LootStakeSnapshotPayload {
  runId: unknown;
  snapshotPoint: string | "other";
  settlementOutcome: LootStakeSettlementOutcome | "other" | null;
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
  const stakeSnapshotFields = input.stakeSnapshotFields;

  return {
    runId: input.runId,
    ...input.context,
    snapshotPoint,
    settlementOutcome,
    ...stakeSnapshotFields
  };
}
