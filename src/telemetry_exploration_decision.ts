import {
  normalizeDecisionAction,
  normalizeDirection,
  normalizeTargetIndex,
  type TelemetryDecisionAction
} from "./telemetry_decision_normalization.js";
import {
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface ExplorationDecisionInput {
  runId: string | null;
  context: Record<string, unknown>;
  action: unknown;
  source: unknown;
  safeCellEvents: ReadonlySet<string>;
  spellId: string | null;
  targetIdx: unknown;
  partySize: unknown;
  targetType: unknown;
  spellTarget: unknown;
  safeSpellTargetTypes: ReadonlySet<string>;
  itemId: string | null;
  itemCategory: string;
  direction: unknown;
  safeDirections: ReadonlySet<number>;
}

export interface ExplorationDecisionPayload {
  runId: unknown;
  action: TelemetryDecisionAction;
  source: string | "other";
  spellId: string | null;
  targetIndex: number | null;
  targetType: string | "other" | null;
  itemId: string | null;
  itemCategory: string;
  direction: number | null;
  [key: string]: unknown;
}

export function buildExplorationDecisionPayload(
  input: ExplorationDecisionInput
): ExplorationDecisionPayload {
  return {
    runId: input.runId,
    ...input.context,
    action: normalizeDecisionAction(input.action),
    source: normalizeStableValue(input.source, input.safeCellEvents),
    spellId: input.spellId,
    targetIndex: normalizeTargetIndex(input.targetIdx, input.partySize),
    targetType: normalizeOptionalStableValue(input.targetType ?? input.spellTarget, input.safeSpellTargetTypes),
    itemId: input.itemId,
    itemCategory: input.itemCategory,
    direction: normalizeDirection(input.direction, input.safeDirections)
  };
}
