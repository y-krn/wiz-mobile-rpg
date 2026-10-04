// balance-impact: none — persisted facility purchases only (#2009).
//
// Which facility nodes have been bought. Whether a facility is open is not
// stored here: it follows from the rescue feat (`src/state/feats_state.ts`).

/** An order placed at a facility: what was asked for and what is still owed. */
export interface FacilityOrderState {
  orderId: string;
  /** Goods not delivered yet. The whole yield until the first safe return. */
  items: string[];
}

export interface NormalizedFacilitiesState {
  nodes: string[];
  /** At most one open order per facility, keyed by facility id (#2014). */
  orders?: Record<string, FacilityOrderState>;
  /** Materials the chapel grave keeps from the last death (#2018). */
  grave?: Record<string, number>;
}

/** What the end of a run did with the open orders, for the result screen. */
export interface RunOrderResult {
  delivered: string[];
  waiting: number;
}

export type NormalizedRunOrderResult = RunOrderResult | null;

const NODE_LIMIT = 200;
const ORDER_ITEM_LIMIT = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const GRAVE_TYPE_LIMIT = 40;
const GRAVE_QUANTITY_LIMIT = 999;

export function createDefaultFacilitiesState(): NormalizedFacilitiesState {
  return { nodes: [], orders: {}, grave: {} };
}

function isGrave(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= GRAVE_TYPE_LIMIT && entries.every(([name, quantity]) =>
    name.length > 0 && typeof quantity === "number" && Number.isInteger(quantity) &&
    quantity > 0 && quantity <= GRAVE_QUANTITY_LIMIT);
}

function normalizeGrave(value: unknown): Record<string, number> {
  const grave: Record<string, number> = {};
  if (!isRecord(value)) return grave;
  Object.entries(value).slice(0, GRAVE_TYPE_LIMIT).forEach(([name, quantity]) => {
    const count = Math.min(GRAVE_QUANTITY_LIMIT, Math.floor(Number(quantity)));
    if (name && Number.isFinite(count) && count > 0) grave[name] = count;
  });
  return grave;
}

function isItemIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= ORDER_ITEM_LIMIT &&
    value.every(itemId => typeof itemId === "string" && itemId.length > 0);
}

function isOrderState(value: unknown): value is FacilityOrderState {
  return isRecord(value) && typeof value.orderId === "string" && value.orderId.length > 0 &&
    isItemIdList(value.items) && value.items.length > 0;
}

export function isNormalizedFacilitiesState(value: unknown): value is NormalizedFacilitiesState {
  if (!isRecord(value) || !Array.isArray(value.nodes) || value.nodes.length > NODE_LIMIT) return false;
  if (!value.nodes.every(nodeId => typeof nodeId === "string" && nodeId.length > 0)) return false;
  if (new Set(value.nodes).size !== value.nodes.length) return false;
  if (value.grave !== undefined && !isGrave(value.grave)) return false;
  if (value.orders === undefined) return true;
  return isRecord(value.orders) &&
    Object.entries(value.orders).every(([facilityId, order]) => facilityId.length > 0 && isOrderState(order));
}

/** A save from before facilities loads with nothing bought and nothing ordered. */
export function normalizeFacilitiesState(value: unknown): NormalizedFacilitiesState {
  const source = isRecord(value) && Array.isArray(value.nodes) ? value.nodes : [];
  const orders: Record<string, FacilityOrderState> = {};
  if (isRecord(value) && isRecord(value.orders)) {
    Object.entries(value.orders).forEach(([facilityId, order]) => {
      if (!facilityId || !isRecord(order) || typeof order.orderId !== "string" || !order.orderId) return;
      const items = (Array.isArray(order.items) ? order.items : [])
        .filter((itemId): itemId is string => typeof itemId === "string" && itemId.length > 0)
        .slice(0, ORDER_ITEM_LIMIT);
      if (items.length > 0) orders[facilityId] = { orderId: order.orderId, items };
    });
  }
  return {
    nodes: [...new Set(source.filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId.length > 0))]
      .slice(0, NODE_LIMIT),
    orders,
    grave: normalizeGrave(isRecord(value) ? value.grave : null)
  };
}

export function isNormalizedRunOrderResult(value: unknown): value is NormalizedRunOrderResult {
  if (value === null) return true;
  return isRecord(value) && isItemIdList(value.delivered) &&
    typeof value.waiting === "number" && Number.isInteger(value.waiting) && value.waiting >= 0 &&
    (value.delivered.length > 0 || value.waiting > 0);
}

export function normalizeRunOrderResult(value: unknown): NormalizedRunOrderResult {
  if (!isRecord(value)) return null;
  const delivered = (Array.isArray(value.delivered) ? value.delivered : [])
    .filter((itemId): itemId is string => typeof itemId === "string" && itemId.length > 0)
    .slice(0, ORDER_ITEM_LIMIT);
  const waiting = Math.max(0, Math.floor(Number(value.waiting) || 0));
  return delivered.length > 0 || waiting > 0 ? { delivered, waiting } : null;
}

/** People who can be led out of the dungeon, one per facility. */
export const COMPANION_IDS = Object.freeze(["foreman", "priest", "weaver", "scribe"] as const);
export type CompanionId = typeof COMPANION_IDS[number];
/** Everyone the run is leading out right now, in the order they joined. */
export type NormalizedCompanions = CompanionId[];

function isCompanionId(value: unknown): value is CompanionId {
  return typeof value === "string" && COMPANION_IDS.includes(value as CompanionId);
}

export function isNormalizedCompanions(value: unknown): value is NormalizedCompanions {
  return Array.isArray(value) && value.every(isCompanionId) && new Set(value).size === value.length;
}

/**
 * Normalize the escort list. `legacy` is the single `companion` id a save
 * from before #2018 stored; it is folded into the list.
 */
export function normalizeCompanions(value: unknown, legacy: unknown = null): NormalizedCompanions {
  const source = [...(Array.isArray(value) ? value : []), legacy];
  return [...new Set(source.filter(isCompanionId))];
}

/** Materials an offering sent home during the run (#2018): safe whatever the outcome. */
export type NormalizedRunOfferedMaterials = Record<string, number>;

export function isNormalizedRunOfferedMaterials(value: unknown): value is NormalizedRunOfferedMaterials {
  return isGrave(value);
}

export function normalizeRunOfferedMaterials(value: unknown): NormalizedRunOfferedMaterials {
  return normalizeGrave(value);
}

/** What a death left on the chapel grave, for the result screen (#2018). */
export type NormalizedRunGraveResult = Record<string, number> | null;

export function isNormalizedRunGraveResult(value: unknown): value is NormalizedRunGraveResult {
  return value === null || (isGrave(value) && Object.keys(value).length > 0);
}

export function normalizeRunGraveResult(value: unknown): NormalizedRunGraveResult {
  const grave = normalizeGrave(value);
  return Object.keys(grave).length > 0 ? grave : null;
}
