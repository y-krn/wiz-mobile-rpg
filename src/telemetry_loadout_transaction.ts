import {
  normalizeDecisionAction,
  type TelemetryDecisionAction
} from "./telemetry_decision_normalization.js";
import {
  boundedFiniteOrNull,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface LoadoutTransactionInput {
  runId: string | null;
  context: Record<string, unknown>;
  action: unknown;
  equipmentChanges: unknown;
  runeChanges: unknown;
  discardedItems: unknown;
  mode: unknown;
  turnCost: unknown;
  equipmentChangeCountMax: number;
  discardedItemCountMax: number;
}

export interface LoadoutTransactionPayload {
  runId: unknown;
  action: TelemetryDecisionAction;
  equipmentChangeCount: number | null;
  runeChangeCount: number | null;
  discardedItemCount: number | null;
  mode: "loadout" | "trial" | "other";
  turnCost: number | null;
  [key: string]: unknown;
}

const LOADOUT_TRANSACTION_MODES: ReadonlySet<"loadout" | "trial"> = new Set(["loadout", "trial"]);

export function buildLoadoutTransactionPayload(
  input: LoadoutTransactionInput
): LoadoutTransactionPayload {
  return {
    runId: input.runId,
    ...input.context,
    action: normalizeDecisionAction(input.action),
    equipmentChangeCount: boundedFiniteOrNull(input.equipmentChanges, 0, input.equipmentChangeCountMax),
    runeChangeCount: boundedFiniteOrNull(input.runeChanges, 0, input.equipmentChangeCountMax),
    discardedItemCount: boundedFiniteOrNull(input.discardedItems, 0, input.discardedItemCountMax),
    mode: normalizeStableValue(input.mode, LOADOUT_TRANSACTION_MODES),
    turnCost: boundedFiniteOrNull(input.turnCost, 0, 1)
  };
}
