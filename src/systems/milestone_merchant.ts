// balance-impact: none — milestone merchant ownership migration only; stock,
// prices, capacity, and curse costs remain unchanged.

import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../data/milestone_merchant.js";
import type { RuntimeItemRef } from "../state/item.js";
import type { NormalizedRunMaterials } from "../state/material_state.js";
import { canAffordMaterials, spendMaterials } from "../rules/material_rules.js";
import { isCurseLocked } from "../rules/identification_rules.js";
import { purifyEquipmentCurse } from "./identification.js";
import { addCanonicalInventoryItemToState } from "../state/inventory_state.js";
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { TRIAL_PROFILES } from "../trial_profiles.js";

type MerchantStockKind = "identify" | "item";

interface MerchantStockEntryBase {
  readonly id: string;
  readonly kind: MerchantStockKind;
  readonly name: string;
  readonly cost: Readonly<Record<string, number>>;
}

export type MerchantIdentifyStockEntry = Omit<MerchantStockEntryBase, "kind"> & {
  readonly kind: "identify";
};

export type MerchantItemStockEntry = Omit<MerchantStockEntryBase, "kind"> & {
  readonly kind: "item";
  readonly itemId: string;
};

export type MerchantStockEntry = MerchantIdentifyStockEntry | MerchantItemStockEntry;

type MerchantInventoryObject = {
  readonly baseId?: unknown;
  readonly [key: string]: unknown;
};

type MerchantInventoryItem = RuntimeItemRef | MerchantInventoryObject;

interface MerchantCurrentRunLike {
  materials?: NormalizedRunMaterials;
  trialProfile?: string;
  [key: string]: unknown;
}

interface MerchantCharacterLike {
  equipment?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface MilestoneMerchantStateLike {
  currentRun?: MerchantCurrentRunLike | null;
  inventory?: MerchantInventoryItem[] | null;
  identifyTickets?: number;
  party?: MerchantCharacterLike[] | null;
  [key: string]: unknown;
}

export interface CursedEquipmentEntry {
  slot: string;
  item: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMerchantStockEntry(value: unknown): value is MerchantStockEntry {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      !isRecord(value.cost)) {
    return false;
  }
  if (value.kind === "identify") {
    return !Object.hasOwn(value, "itemId") && Object.values(value.cost).every(quantity =>
      typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 0
    );
  }
  if (value.kind !== "item" || typeof value.itemId !== "string") return false;
  return Object.values(value.cost).every(quantity =>
    typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 0
  );
}

const VNEXT_UNAVAILABLE_STOCK_ITEM_IDS = new Set(["WAKE_POWDER", "PARALYZE_CURE"]);

export function getMilestoneMerchantStock(trialProfile?: string): MerchantStockEntry[] {
  if (trialProfile !== TRIAL_PROFILES.PHASE3_EQUIPMENT) return [...MILESTONE_MERCHANT_STOCK];
  return MILESTONE_MERCHANT_STOCK.filter(entry =>
    !("itemId" in entry) || !VNEXT_UNAVAILABLE_STOCK_ITEM_IDS.has(entry.itemId)
  );
}

function findStockEntry(stockId: string, trialProfile?: string): MerchantStockEntry | null {
  const entry = getMilestoneMerchantStock(trialProfile).find((candidate: unknown) =>
    isMerchantStockEntry(candidate) && candidate.id === stockId
  );
  return isMerchantStockEntry(entry) ? entry : null;
}

function getInventoryBaseId(item: unknown): unknown {
  if (typeof item === "string") return item;
  return isRecord(item) ? item.baseId : undefined;
}

export function purchaseMilestoneStock(
  stateLike: MilestoneMerchantStateLike,
  stockId: string
): { ok: false; reason: "unknown_stock" | "insufficient_materials" | "inventory_full" | "already_owned" } | {
  ok: true;
  entry: MerchantStockEntry;
} {
  const currentRun = stateLike.currentRun;
  const entry = findStockEntry(stockId, currentRun?.trialProfile);
  if (!entry) return { ok: false, reason: "unknown_stock" };
  const materials = currentRun?.materials;
  if (!currentRun || !materials || !canAffordMaterials(materials, entry.cost)) {
    return { ok: false, reason: "insufficient_materials" };
  }
  if (entry.kind === "item" && (stateLike.inventory?.length || 0) >= INVENTORY_CAPACITY) {
    return { ok: false, reason: "inventory_full" };
  }
  if (entry.kind === "item" && entry.itemId === "TOWN_PORTAL" && stateLike.inventory?.some(item =>
    getInventoryBaseId(item) === entry.itemId
  )) {
    return { ok: false, reason: "already_owned" };
  }
  const spentMaterials = spendMaterials(materials, entry.cost);
  if (!spentMaterials) return { ok: false, reason: "insufficient_materials" };
  currentRun.materials = spentMaterials;
  if (entry.kind === "identify") stateLike.identifyTickets = (stateLike.identifyTickets || 0) + 1;
  else {
    const added = addCanonicalInventoryItemToState(stateLike, entry.itemId, {
      dungeonLoot: true,
      source: "merchant"
    });
    if (!added) return { ok: false, reason: "inventory_full" };
  }
  return { ok: true, entry };
}

export function getCursedEquipment(character: MerchantCharacterLike | null | undefined): CursedEquipmentEntry[] {
  return Object.entries(character?.equipment || {})
    .filter(([, item]) => isCurseLocked(item))
    .map(([slot, item]) => ({ slot, item }));
}

export function purchaseMilestoneUncurse(
  stateLike: MilestoneMerchantStateLike,
  slot: string
): { ok: false; reason: "not_cursed" | "insufficient_materials" } | { ok: true; item: unknown } {
  const item = stateLike.party?.[0]?.equipment?.[slot];
  if (!isCurseLocked(item)) return { ok: false, reason: "not_cursed" };
  const currentRun = stateLike.currentRun;
  const materials = currentRun?.materials;
  if (!currentRun || !materials || !canAffordMaterials(materials, MILESTONE_UNCURSE_COST)) {
    return { ok: false, reason: "insufficient_materials" };
  }
  const spentMaterials = spendMaterials(materials, MILESTONE_UNCURSE_COST);
  if (!spentMaterials) return { ok: false, reason: "insufficient_materials" };
  currentRun.materials = spentMaterials;
  purifyEquipmentCurse(item);
  return { ok: true, item };
}
