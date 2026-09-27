import {
  normalizeDecisionAction,
  type TelemetryDecisionAction
} from "./telemetry_decision_normalization.js";
import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export type EquipmentDecisionComparisonRow = {
  key?: unknown;
  diff?: unknown;
} | null | undefined;

export interface EquipmentDecisionInput {
  runId: string;
  context: Record<string, unknown>;
  action: unknown;
  candidateId: string | null;
  currentEquipmentId: string | null;
  candidateBuildRole: string | null;
  currentBuildRole: string | null;
  buildDecision: "transition" | "swap";
  slot: unknown;
  safeEquipmentSlots: ReadonlySet<string>;
  candidateRarity: string | null;
  candidateIdentified: boolean;
  candidateEnhancementLevel: unknown;
  primaryDiff: unknown;
  diffRows: EquipmentDecisionComparisonRow[];
  safeComparisonStatKeys: ReadonlySet<string>;
  maxResourceValue: number;
  maxComparisonRows: number;
}

export interface EquipmentDecisionPayload {
  runId: unknown;
  action: TelemetryDecisionAction;
  candidateId: string | null;
  currentEquipmentId: string | null;
  candidateBuildRole: string | null;
  currentBuildRole: string | null;
  buildDecision: "transition" | "swap";
  slot: string | "other" | null;
  candidateRarity: string | null;
  candidateIdentified: boolean;
  candidateEnhancementLevel: number | null;
  primaryDiff: number | null;
  comparisonStatKeys: Array<string | "other">;
  comparisonDiffs: Array<number | null>;
  comparisonAvailable: boolean;
  [key: string]: unknown;
}

export function buildEquipmentDecisionPayload(
  input: EquipmentDecisionInput
): EquipmentDecisionPayload {
  return {
    runId: input.runId,
    ...input.context,
    action: normalizeDecisionAction(input.action),
    candidateId: input.candidateId,
    currentEquipmentId: input.currentEquipmentId,
    candidateBuildRole: input.candidateBuildRole,
    currentBuildRole: input.currentBuildRole,
    buildDecision: input.buildDecision,
    slot: normalizeOptionalStableValue(input.slot, input.safeEquipmentSlots),
    candidateRarity: input.candidateRarity,
    candidateIdentified: input.candidateIdentified,
    candidateEnhancementLevel: boundedFiniteOrNull(input.candidateEnhancementLevel, -input.maxResourceValue),
    primaryDiff: boundedFiniteOrNull(input.primaryDiff, -input.maxResourceValue),
    comparisonStatKeys: input.diffRows
      .map(row => normalizeStableValue(row?.key, input.safeComparisonStatKeys))
      .slice(0, input.maxComparisonRows),
    comparisonDiffs: input.diffRows
      .map(row => boundedFiniteOrNull(row?.diff, -input.maxResourceValue))
      .slice(0, input.maxComparisonRows),
    comparisonAvailable: input.diffRows.length > 0
  };
}
