import {
  normalizeDecisionAction,
  type TelemetryDecisionAction
} from "./telemetry_decision_normalization.js";

export interface BuildShiftInput {
  runId: string;
  context: Record<string, unknown>;
  action: unknown;
  fromBuildRole: string | null;
  toBuildRole: string | null;
  fromEquipmentId: string | null;
  toEquipmentId: string | null;
}

export interface BuildShiftPayload {
  runId: unknown;
  action: TelemetryDecisionAction;
  fromBuildRole: string | null;
  toBuildRole: string | null;
  fromEquipmentId: string | null;
  toEquipmentId: string | null;
  reason: "main_core_axis_changed";
  [key: string]: unknown;
}

export function buildBuildShiftPayload(input: BuildShiftInput): BuildShiftPayload {
  return {
    runId: input.runId,
    ...input.context,
    action: normalizeDecisionAction(input.action),
    fromBuildRole: input.fromBuildRole,
    toBuildRole: input.toBuildRole,
    fromEquipmentId: input.fromEquipmentId,
    toEquipmentId: input.toEquipmentId,
    reason: "main_core_axis_changed"
  };
}
