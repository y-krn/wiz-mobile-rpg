import { boundedFiniteOrNull } from "./telemetry_normalization.js";

export interface RunStartPayloadInput {
  runId: string;
  context: Record<string, unknown>;
  run: unknown;
  character: unknown;
  getCharMaxHp(character: unknown): unknown;
  getCharMaxMp(character: unknown): unknown;
  buildEquipmentSnapshot(character: unknown): { equipmentIds: Array<string | null> };
  buildResourceSnapshot(stateSnapshot: unknown): {
    inventoryCount: number;
    inventoryFreeSlots: number;
    consumableWingCount: number;
  };
  getUnbankedLootSummary(stateSnapshot: unknown): { count: number };
  stateSnapshot: unknown;
}

export interface RunStartPayload extends Record<string, unknown> {
  runId: string;
  level: number | null;
  startFloor: number | null;
  maxHp: number | null;
  maxMp: number | null;
  effectiveMaxHp: number | null;
  effectiveMaxMp: number | null;
  equipmentIds: Array<string | null>;
  startingInventoryCount: number;
  startingInventoryFreeSlots: number;
  startingWingCount: number;
  startingUnbankedObjectLootCount: number;
}

interface RunStartRun {
  startFloor?: unknown;
}

interface RunStartCharacter {
  level?: unknown;
  maxHp?: unknown;
  maxMp?: unknown;
}

export function buildRunStartPayload(input: RunStartPayloadInput): RunStartPayload {
  const run = input.run as RunStartRun | null | undefined;
  const character = input.character as RunStartCharacter | null | undefined;
  return {
    runId: input.runId,
    ...input.context,
    level: boundedFiniteOrNull(character?.level),
    startFloor: boundedFiniteOrNull(run?.startFloor),
    maxHp: boundedFiniteOrNull(character?.maxHp),
    maxMp: boundedFiniteOrNull(character?.maxMp),
    effectiveMaxHp: boundedFiniteOrNull(input.getCharMaxHp(input.character)),
    effectiveMaxMp: boundedFiniteOrNull(input.getCharMaxMp(input.character)),
    equipmentIds: input.buildEquipmentSnapshot(input.character).equipmentIds,
    startingInventoryCount: input.buildResourceSnapshot(input.stateSnapshot).inventoryCount,
    startingInventoryFreeSlots: input.buildResourceSnapshot(input.stateSnapshot).inventoryFreeSlots,
    startingWingCount: input.buildResourceSnapshot(input.stateSnapshot).consumableWingCount,
    startingUnbankedObjectLootCount: input.getUnbankedLootSummary(input.stateSnapshot).count
  };
}
