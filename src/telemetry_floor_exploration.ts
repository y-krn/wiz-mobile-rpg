import {
  boundedFiniteOrNull,
  normalizeOptionalStableValue
} from "./telemetry_normalization.js";

const SAFE_EXPLORATION_MODES = new Set<"discovery" | "known_route" | "unknown">([
  "discovery", "known_route", "unknown"
]);

export interface FloorExplorationPayloadInput {
  runId: unknown;
  context: Record<string, unknown>;
  floor: number | null;
  stepsBeforeStairs: unknown;
  stepsAfterStairs: unknown;
  stairsDiscovered: unknown;
  floorCompleted: unknown;
  chestsDiscovered: unknown;
  chestsSkipped: unknown;
  explorationMode: unknown;
}

export interface FloorExplorationPayload {
  runId: unknown;
  floor: number | null;
  stepsBeforeStairs: number | null;
  stepsAfterStairs: number | null;
  stairsDiscovered: boolean;
  floorCompleted: boolean;
  chestsDiscovered: number | null;
  chestsSkipped: number | null;
  explorationMode: string | "other" | null;
  [key: string]: unknown;
}

export function buildFloorExplorationPayload(
  input: FloorExplorationPayloadInput
): FloorExplorationPayload {
  return {
    runId: input.runId,
    ...input.context,
    floor: input.floor,
    stepsBeforeStairs: boundedFiniteOrNull(input.stepsBeforeStairs),
    stepsAfterStairs: boundedFiniteOrNull(input.stepsAfterStairs),
    stairsDiscovered: Boolean(input.stairsDiscovered),
    floorCompleted: Boolean(input.floorCompleted),
    chestsDiscovered: boundedFiniteOrNull(input.chestsDiscovered),
    chestsSkipped: boundedFiniteOrNull(input.chestsSkipped),
    explorationMode: normalizeOptionalStableValue(input.explorationMode, SAFE_EXPLORATION_MODES)
  };
}
