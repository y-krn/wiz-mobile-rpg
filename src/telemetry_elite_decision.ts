import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface EliteDecisionInput {
  runId: string | null;
  context: Record<string, unknown>;
  floor: unknown;
  decision: unknown;
  eliteId: string;
  contactMode: unknown;
  distance: unknown;
  detected: boolean;
  elitePolicy: unknown;
  unbankedObjectLootCount: number;
  safeDecisions: ReadonlySet<string>;
  safeContactModes: ReadonlySet<string>;
}

export interface EliteDecisionPayload {
  runId: unknown;
  floor: number | null;
  decision: string | "other";
  eliteId: string;
  contactMode: string | "other";
  distance: number | null;
  detected: boolean;
  elitePolicy: string | "other" | null;
  unbankedObjectLootCount: number;
  [key: string]: unknown;
}

const SAFE_ELITE_POLICIES = new Set(["engage", "avoid", "adaptive", "unknown"]);

export function buildEliteDecisionPayload(input: EliteDecisionInput): EliteDecisionPayload {
  return {
    runId: input.runId,
    ...input.context,
    floor: boundedFiniteOrNull(input.floor),
    decision: normalizeStableValue(input.decision, input.safeDecisions),
    eliteId: input.eliteId,
    contactMode: normalizeStableValue(input.contactMode, input.safeContactModes),
    distance: boundedFiniteOrNull(input.distance, 0, 100),
    detected: input.detected,
    elitePolicy: normalizeOptionalStableValue(input.elitePolicy, SAFE_ELITE_POLICIES),
    unbankedObjectLootCount: input.unbankedObjectLootCount
  };
}
