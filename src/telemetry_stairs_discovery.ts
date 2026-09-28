import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

const SAFE_STAIRS_TYPES = new Set<"stairs-up" | "stairs-down">(["stairs-up", "stairs-down"]);
const SAFE_EXPLORATION_MODES = new Set<"discovery" | "known_route" | "unknown">([
  "discovery", "known_route", "unknown"
]);

export interface StairsDiscoveryIdentityInput {
  floor: unknown;
  stairsType: unknown;
}

export interface StairsDiscoveryIdentity {
  floor: number | null;
  stairsType: "stairs-up" | "stairs-down" | "other";
}

export interface StairsDiscoveryPayloadInput extends StairsDiscoveryIdentity {
  runId: unknown;
  context: Record<string, unknown>;
  stepsAtDiscovery: unknown;
  stepsBeforeDiscovery: unknown;
  hpRate: unknown;
  mpRate: unknown;
  explorationMode: unknown;
  unbankedObjectLootCount: unknown;
}

export interface StairsDiscoveryPayload {
  runId: unknown;
  floor: number | null;
  stairsType: "stairs-up" | "stairs-down" | "other";
  stepsAtDiscovery: number | null;
  stepsBeforeDiscovery: number | null;
  hpRate: number | null;
  mpRate: number | null;
  explorationMode: string | "other" | null;
  unbankedObjectLootCount: unknown;
  [key: string]: unknown;
}

export function normalizeStairsDiscoveryIdentity(
  input: StairsDiscoveryIdentityInput
): StairsDiscoveryIdentity {
  return {
    floor: boundedFiniteOrNull(input.floor),
    stairsType: normalizeStableValue(input.stairsType, SAFE_STAIRS_TYPES)
  };
}

export function buildStairsDiscoveryPayload(
  input: StairsDiscoveryPayloadInput
): StairsDiscoveryPayload {
  return {
    runId: input.runId,
    ...input.context,
    floor: input.floor,
    stairsType: input.stairsType,
    stepsAtDiscovery: boundedFiniteOrNull(input.stepsAtDiscovery),
    stepsBeforeDiscovery: boundedFiniteOrNull(input.stepsBeforeDiscovery),
    hpRate: boundedFiniteOrNull(input.hpRate, 0, 1),
    mpRate: boundedFiniteOrNull(input.mpRate, 0, 1),
    explorationMode: normalizeOptionalStableValue(input.explorationMode, SAFE_EXPLORATION_MODES),
    unbankedObjectLootCount: input.unbankedObjectLootCount
  };
}
