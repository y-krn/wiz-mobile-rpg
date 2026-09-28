import {
  boundedFiniteOrNull,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface ValuableLocationIdentityInput {
  floor: unknown;
  x: unknown;
  y: unknown;
  locationType: unknown;
  action: unknown;
  safeLocationTypes: ReadonlySet<string>;
  safeLocationActions: ReadonlySet<string>;
}

export interface ValuableLocationIdentity {
  floor: number | null;
  x: number | null;
  y: number | null;
  locationType: string | "other";
  action: string | "other";
}

export interface ValuableLocationPayloadInput extends ValuableLocationIdentity {
  runId: unknown;
  context: Record<string, unknown>;
  distanceFromStart: unknown;
  source: unknown;
  safeLootSources: ReadonlySet<string>;
}

export interface ValuableLocationPayload {
  runId: unknown;
  floor: number | null;
  locationType: string | "other";
  action: string | "other";
  distanceFromStart: number | null;
  source: string | "other";
  [key: string]: unknown;
}

export function normalizeValuableLocationIdentity(
  input: ValuableLocationIdentityInput
): ValuableLocationIdentity {
  return {
    floor: boundedFiniteOrNull(input.floor),
    x: boundedFiniteOrNull(input.x, 0, 1000),
    y: boundedFiniteOrNull(input.y, 0, 1000),
    locationType: normalizeStableValue(input.locationType, input.safeLocationTypes),
    action: normalizeStableValue(input.action, input.safeLocationActions)
  };
}

export function buildValuableLocationPayload(
  input: ValuableLocationPayloadInput
): ValuableLocationPayload {
  return {
    runId: input.runId,
    ...input.context,
    floor: input.floor,
    locationType: input.locationType,
    action: input.action,
    distanceFromStart: boundedFiniteOrNull(input.distanceFromStart, 0, 1000),
    source: normalizeStableValue(input.source || "dungeon", input.safeLootSources)
  };
}
