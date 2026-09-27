import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface PortalDecisionInput {
  runId: string | null;
  context: Record<string, unknown>;
  portalType: unknown;
  decision: unknown;
  hpRate: unknown;
  mpRate: unknown;
  freeInventorySlots: unknown;
  unbankedObjectLootCount: unknown;
  unbankedObjectLootValueProxy: unknown;
  wingOwned: unknown;
  wingSalvageCount: unknown;
  nextBandMainId: unknown;
  nextBandSubId: unknown;
  stakeSnapshotFields: Record<string, unknown>;
  safePortalTypes: ReadonlySet<string>;
  safePortalDecisions: ReadonlySet<string>;
  safeBandTrialIds: ReadonlySet<string>;
}

export interface PortalDecisionPayload {
  runId: unknown;
  portalType: string | "other";
  decision: string | "other";
  hpRate: number | null;
  mpRate: number | null;
  freeInventorySlots: unknown;
  unbankedObjectLootCount: unknown;
  unbankedObjectLootValueProxy: unknown;
  wingOwned: unknown;
  wingSalvageCount: number | null;
  nextBandMainId: string | "other" | null;
  nextBandSubId: string | "other" | null;
  stakeSnapshotPoint: string;
  [key: string]: unknown;
}

export function buildPortalDecisionPayload(input: PortalDecisionInput): PortalDecisionPayload {
  const normalizedDecision = input.decision === "continue"
    ? "push"
    : normalizeStableValue(input.decision, input.safePortalDecisions);

  return {
    runId: input.runId,
    ...input.context,
    portalType: normalizeStableValue(input.portalType, input.safePortalTypes),
    decision: normalizedDecision,
    hpRate: boundedFiniteOrNull(input.hpRate, 0, 1),
    mpRate: boundedFiniteOrNull(input.mpRate, 0, 1),
    freeInventorySlots: input.freeInventorySlots,
    unbankedObjectLootCount: input.unbankedObjectLootCount,
    unbankedObjectLootValueProxy: input.unbankedObjectLootValueProxy,
    wingOwned: input.wingOwned,
    wingSalvageCount: boundedFiniteOrNull(input.wingSalvageCount, 0, 2),
    nextBandMainId: normalizeOptionalStableValue(input.nextBandMainId, input.safeBandTrialIds),
    nextBandSubId: normalizeOptionalStableValue(input.nextBandSubId, input.safeBandTrialIds),
    stakeSnapshotPoint: "portal_decision",
    ...input.stakeSnapshotFields
  };
}
