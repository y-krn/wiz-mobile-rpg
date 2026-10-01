import {
  boundedFiniteOrNull,
  normalizeBoundedEnumArray,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "./telemetry_normalization.js";

export interface ChestActionDetails {
  floor?: unknown;
  trap?: unknown;
  inventoryCount?: unknown;
  hasTrapKit?: unknown;
  rewardCount?: unknown;
  rewardCategories?: unknown;
}

export interface ChestActionInput {
  runId: string;
  context: Record<string, unknown>;
  chest: {
    fromDrop?: unknown;
    trapSign?: unknown;
    lootHint?: { aura?: unknown } | null;
  } | null | undefined;
  action: unknown;
  details: ChestActionDetails;
  safeActions: ReadonlySet<string>;
  safeTraps: ReadonlySet<string>;
  safeRewardCategories: ReadonlySet<string>;
  safeAuras: ReadonlySet<string>;
  safeTrapSigns: ReadonlySet<string>;
}

export interface ChestActionPayload extends Record<string, unknown> {
  runId: string;
  floor: number | null;
  chestSource: "fromDrop" | "ordinary";
  fromDrop: boolean;
  action: string | "other";
  trap: string | "other";
  trapSign: string | "other" | null;
  inventoryCount: number | null;
  hasTrapKit: boolean;
  rewardCount: number | null;
  rewardCategories: Array<string | "other">;
  lootAura: string | "other" | null;
}

export function buildChestActionPayload(input: ChestActionInput): ChestActionPayload {
  return {
    runId: input.runId,
    ...input.context,
    floor: boundedFiniteOrNull(input.details.floor),
    chestSource: input.chest?.fromDrop ? "fromDrop" : "ordinary",
    fromDrop: Boolean(input.chest?.fromDrop),
    action: normalizeStableValue(input.action, input.safeActions),
    trap: normalizeStableValue(input.details.trap ?? "none", input.safeTraps),
    trapSign: normalizeOptionalStableValue(input.chest?.trapSign, input.safeTrapSigns),
    inventoryCount: boundedFiniteOrNull(input.details.inventoryCount),
    hasTrapKit: Boolean(input.details.hasTrapKit),
    rewardCount: boundedFiniteOrNull(input.details.rewardCount),
    rewardCategories: normalizeBoundedEnumArray(
      input.details.rewardCategories,
      input.safeRewardCategories,
      input.safeRewardCategories.size
    ),
    lootAura: normalizeOptionalStableValue(input.chest?.lootHint?.aura, input.safeAuras)
  };
}
