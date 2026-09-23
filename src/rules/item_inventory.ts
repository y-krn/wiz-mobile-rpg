import { ITEMS } from "../data/items.js";
import { ITEM_CATEGORY, ITEM_CATEGORY_ORDER } from "../constants/item_categories.js";
import { resolveItemDefinition } from "../state/item.js";
import type { ItemDefinition } from "../state/item.js";

// balance-impact: none — this module centralizes the fixed bag boundary only.
export const INVENTORY_CAPACITY = 20;

export function getInventoryUsedSlots(inventory: unknown): number {
  return Array.isArray(inventory) ? inventory.length : 0;
}

export function getInventoryRemainingSlots(inventory: unknown): number {
  return Math.max(0, INVENTORY_CAPACITY - getInventoryUsedSlots(inventory));
}

export function hasInventorySpace(inventory: unknown, count: unknown = 1): boolean {
  const requested = Math.max(0, Math.floor(Number(count) || 0));
  return getInventoryRemainingSlots(inventory) >= requested;
}

const ITEM_DEFINITION_ORDER = new Map(Object.keys(ITEMS).map((itemKey, index) => [itemKey, index]));
const FALLBACK_CATEGORY_ORDER = ITEM_CATEGORY_ORDER.length;
const CATEGORY_ORDER: readonly unknown[] = ITEM_CATEGORY_ORDER;

type ResolvedItem = ItemDefinition | null;

export interface UsableInventoryEntry {
  itemKey: unknown;
  idx: number;
  item: ResolvedItem;
}

function getCategoryOrder(item: ResolvedItem): number {
  const category = item?.id === undefined ? undefined : ITEM_CATEGORY[item.id as keyof typeof ITEM_CATEGORY];
  const order = CATEGORY_ORDER.indexOf(category);
  return order === -1 ? FALLBACK_CATEGORY_ORDER : order;
}

function getDefinitionOrder(item: ResolvedItem): number {
  return ITEM_DEFINITION_ORDER.get(item?.id ?? "") ?? Number.MAX_SAFE_INTEGER;
}

export function getUsableInventoryItems(inventory: unknown): UsableInventoryEntry[] {
  if (!Array.isArray(inventory)) return [];

  return inventory
    .map((itemKey: unknown, idx: number) => {
      const item = resolveItemDefinition(itemKey, ITEMS);
      return { itemKey, idx, item };
    })
    .filter(({ item }: UsableInventoryEntry) => item?.type === "usable")
    .sort((a: UsableInventoryEntry, b: UsableInventoryEntry) => {
      const categoryOrder = getCategoryOrder(a.item) - getCategoryOrder(b.item);
      if (categoryOrder !== 0) return categoryOrder;

      const definitionOrder = getDefinitionOrder(a.item) - getDefinitionOrder(b.item);
      if (definitionOrder !== 0) return definitionOrder;

      return a.idx - b.idx;
    });
}
