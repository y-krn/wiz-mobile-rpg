import { state, addLog, saveAutosave } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { captureException } from "../sentry.js";
import { getItemEquippedStatus } from "../rules/equipment_equipped.js";
import { trackEquipmentDecision, trackLootLifecycle } from "../telemetry.js";
import { consumeRunObjectLoot, findRunObjectLootEntry } from "../state/run_loot.js";

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);

export interface DiscardEntry {
  index: number;
  expectedItemKey?: unknown;
  preview?: unknown;
  [key: string]: unknown;
}

export interface DiscardStateLike {
  inventory: unknown[];
  [key: string]: unknown;
}

export type DiscardCharacterLike = Record<string, unknown>;

export interface DiscardEquipmentOptions {
  stateLike?: DiscardStateLike;
  character?: DiscardCharacterLike | null;
}

interface RiskItemKey {
  identified?: unknown;
  rarity?: string;
  enhanceLevel?: number;
  affixes?: unknown;
}

interface ItemDataLike {
  name: string;
  type: string;
  [key: string]: unknown;
}

interface ResolvedDiscardEntry extends DiscardEntry {
  itemKey: unknown;
  item: unknown;
  lootId: unknown;
}

interface EquippedStatus {
  equipped: boolean;
  error?: unknown;
  scope?: unknown;
}

interface LootEntryLike {
  id?: unknown;
}

interface EquipmentDecisionDetails {
  state: DiscardStateLike;
  character: DiscardCharacterLike | null;
  candidateKey: unknown;
  preview: unknown;
}

interface LootLifecycleDetails {
  state: DiscardStateLike;
  character: DiscardCharacterLike | null;
  itemKey: unknown;
  lootId: unknown;
  source: "dungeon";
}

type GetItemDataAtBoundary = (itemOrKey: unknown) => unknown;
type GetItemEquippedStatusAtBoundary = (stateLike: unknown, itemKey: unknown) => EquippedStatus;
type FindRunObjectLootEntryAtBoundary = (stateLike: unknown, item: unknown) => LootEntryLike | null;
type ConsumeRunObjectLootAtBoundary = (stateLike: unknown, item: unknown) => boolean;
type TrackEquipmentDecisionAtBoundary = (
  action: string,
  details: EquipmentDecisionDetails
) => unknown;
type TrackLootLifecycleAtBoundary = (
  stage: string,
  details: LootLifecycleDetails
) => unknown;

// These dependencies remain JavaScript-owned in this Issue. The local function
// types narrow each legacy boundary without widening this action's domain type.
const getItemDataAtBoundary: GetItemDataAtBoundary = getItemData;
const getItemEquippedStatusAtBoundary: GetItemEquippedStatusAtBoundary = getItemEquippedStatus;
const findRunObjectLootEntryAtBoundary: FindRunObjectLootEntryAtBoundary = findRunObjectLootEntry;
const consumeRunObjectLootAtBoundary: ConsumeRunObjectLootAtBoundary = consumeRunObjectLoot;
const trackEquipmentDecisionAtBoundary: TrackEquipmentDecisionAtBoundary = trackEquipmentDecision;
const trackLootLifecycleAtBoundary: TrackLootLifecycleAtBoundary = trackLootLifecycle;

function isRiskItemKey(value: unknown): value is RiskItemKey {
  return value !== null && typeof value === "object";
}

function isItemData(value: unknown): value is ItemDataLike {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isEquipmentItem(item: unknown): item is ItemDataLike {
  return Boolean(item) && isItemData(item) && EQUIPMENT_TYPES.has(item.type ?? "");
}

function reportEquippedCheckFailure(error: unknown, scope: unknown): void {
  captureException(error, {
    level: "warning",
    tags: {
      subsystem: "equipment",
      op: "discard-equipped-check",
      recovery: "block-discard",
      scope
    }
  });
}

function isItemEquipped(stateLike: DiscardStateLike, itemKey: unknown): boolean {
  const result = getItemEquippedStatusAtBoundary(stateLike, itemKey);
  if (result.error) reportEquippedCheckFailure(result.error, result.scope);
  return result.equipped;
}

function getDisplayName(itemKey: unknown, item: unknown): string {
  return `${isRiskItemKey(itemKey) && itemKey.identified !== true ? "? " : ""}${isItemData(item) ? item.name : undefined}`;
}

export function getDiscardRisk(itemKey: unknown): string[] {
  const risks: string[] = [];
  if (isRiskItemKey(itemKey)) {
    if (itemKey.identified !== true) risks.push("未鑑定");
    if (["rare", "epic", "legendary"].includes(itemKey.rarity ?? "")) risks.push("Rare以上");
    if ((itemKey.enhanceLevel || 0) > 0) risks.push("強化済み");
    if (Array.isArray(itemKey.affixes) && itemKey.affixes.length > 0) risks.push("Affix付き");
  }
  return risks;
}

function createDiscardConfirmation(entries: ResolvedDiscardEntry[]): string {
  const count = entries.length;
  if (count === 1) {
    return `「${getDisplayName(entries[0].itemKey, entries[0].item)}」を破棄しますか？この操作は取り消せません。`;
  }

  const risks = entries.flatMap(({ itemKey }) => getDiscardRisk(itemKey));
  const riskCounts = risks.reduce<Record<string, number>>((counts, risk) => {
    counts[risk] = (counts[risk] || 0) + 1;
    return counts;
  }, {});
  const warning = Object.entries(riskCounts).length > 0
    ? `\n注意: ${Object.entries(riskCounts).map(([risk, riskCount]) => `${risk} ${riskCount}件`).join("、")}が含まれます。`
    : "";
  return `選択した${count}件の装備を破棄しますか？この操作は取り消せません。${warning}`;
}

export function discardEquipmentItems(
  entries: DiscardEntry[],
  { stateLike = state, character = null }: DiscardEquipmentOptions = {}
): { ok: boolean; count: number } {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, count: 0 };
  }

  // Map keeps the established duplicate-index behavior: last value wins while
  // the first insertion position remains unchanged.
  const uniqueEntries = [...new Map(entries.map(entry => [entry.index, entry])).values()];
  const validEntries = uniqueEntries.map((entry): ResolvedDiscardEntry => {
    const itemKey = stateLike.inventory[entry.index];
    const item = getItemDataAtBoundary(itemKey);
    return {
      ...entry,
      itemKey,
      item,
      lootId: findRunObjectLootEntryAtBoundary(stateLike, itemKey)?.id
    };
  });
  if (validEntries.some(({ itemKey, item, index, expectedItemKey }) => (
    index < 0 || index >= stateLike.inventory.length ||
    (expectedItemKey !== undefined && itemKey !== expectedItemKey) ||
    !isEquipmentItem(item) || isItemEquipped(stateLike, itemKey)
  ))) {
    return { ok: false, count: 0 };
  }

  if (typeof globalThis.confirm !== "function" || !globalThis.confirm(createDiscardConfirmation(validEntries))) {
    return { ok: false, count: 0 };
  }

  validEntries.forEach(({ itemKey, preview }) => {
    try {
      trackEquipmentDecisionAtBoundary("discard", {
        state: stateLike,
        character,
        candidateKey: itemKey,
        preview
      });
    } catch {
      // Telemetry must never interrupt a confirmed discard.
    }
  });

  const displayNames = validEntries.map(({ itemKey, item }) => getDisplayName(itemKey, item));
  validEntries.forEach(({ itemKey }) => consumeRunObjectLootAtBoundary(stateLike, itemKey));
  validEntries.forEach(({ itemKey, lootId }) => trackLootLifecycleAtBoundary("discarded", {
    state: stateLike,
    character,
    itemKey,
    lootId,
    source: "dungeon"
  }));
  [...validEntries]
    .sort((a, b) => b.index - a.index)
    .forEach(({ index }) => stateLike.inventory.splice(index, 1));

  if (displayNames.length === 1) {
    addLog(`[破棄] ${displayNames[0]}を破棄した。`);
  } else {
    addLog(`[破棄] ${displayNames.length}件の装備を破棄した。`);
  }
  playSound("move");
  saveAutosave();
  return { ok: true, count: displayNames.length };
}
