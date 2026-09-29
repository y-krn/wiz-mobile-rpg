import { normalizeStableValue } from "./telemetry_normalization.js";

export interface LootLifecyclePayloadInput {
  runId: string;
  context: Record<string, unknown>;
  lifecycleStage: string;
  lootSequence: number | null;
  safeSources: ReadonlySet<string>;
  safeOwnerships: ReadonlySet<string>;
  getItemKey(): unknown;
  source: unknown;
  ownership: unknown;
  getStateFloor(): unknown;
  getSafeItemId(itemKey: unknown): string | null;
  getItemCategory(itemKey: unknown): string;
  getEquipmentBuildRole(itemKey: unknown): string | null;
  getLootSupplyFields(itemKey: unknown, floor: unknown): LootSupplyFields;
  getLootValueProxy(itemKey: unknown): number | null;
  normalizeRarity(value: unknown): string | null;
  summary: LootLifecycleSummary;
}

export interface LootSupplyFields {
  lootRole: string | null;
  lootTier: string | null;
  runeSupplyBand: string | null;
}

export interface LootLifecycleSummary {
  count: number;
  valueProxy: number | null;
}

export interface LootLifecyclePayload {
  runId: string;
  lifecycleStage: string;
  lootSequence: number | null;
  itemId: string | null;
  itemCategory: string;
  source: string;
  ownership: string;
  identified: boolean;
  rarity: string | null;
  buildRole: string | null;
  lootRole: string | null;
  lootTier: string | null;
  runeSupplyBand: string | null;
  valueProxy: number | null;
  unbankedObjectLootCount: number;
  unbankedObjectLootValueProxy: number | null;
  [key: string]: unknown;
}

export function normalizeLootStage(stage: unknown, safeStages: ReadonlySet<string>): string {
  return normalizeStableValue(stage, safeStages);
}

export function normalizeLootSource(source: unknown, safeSources: ReadonlySet<string>): string {
  return normalizeStableValue(source, safeSources);
}

export function normalizeLootOwnership(
  ownership: unknown,
  safeOwnerships: ReadonlySet<string>
): string {
  return normalizeStableValue(ownership, safeOwnerships);
}

export function buildLootLifecyclePayload(input: LootLifecyclePayloadInput): LootLifecyclePayload {
  return {
    runId: input.runId,
    ...input.context,
    lifecycleStage: input.lifecycleStage,
    lootSequence: input.lootSequence,
    itemId: input.getSafeItemId(input.getItemKey()),
    itemCategory: input.getItemCategory(input.getItemKey()),
    source: normalizeLootSource(input.source || "dungeon", input.safeSources),
    ownership: normalizeLootOwnership(
      input.ownership || (input.lifecycleStage === "banked" ? "town" : "unbanked"),
      input.safeOwnerships
    ),
    identified: input.getItemKey() == null
      || typeof input.getItemKey() !== "object"
      || (input.getItemKey() as { identified?: unknown } | null | undefined)?.identified === true,
    rarity: (input.getItemKey() as { identified?: unknown } | null | undefined)?.identified === true
      ? input.normalizeRarity(
        (input.getItemKey() as { rarity?: unknown } | null | undefined)?.rarity
      )
      : null,
    buildRole: input.getEquipmentBuildRole(input.getItemKey()),
    ...input.getLootSupplyFields(input.getItemKey(), input.getStateFloor()),
    valueProxy: input.getLootValueProxy(input.getItemKey()),
    unbankedObjectLootCount: input.summary.count,
    unbankedObjectLootValueProxy: input.summary.valueProxy
  };
}
