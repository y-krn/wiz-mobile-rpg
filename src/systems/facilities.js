// Facility state queries and node purchases (#2009). A purchase spends town
// materials on a horizontal unlock; it is mapped to the workshop domain.

import {
  COMPANIONS,
  FACILITIES,
  FACILITY_BY_ID,
  FACILITY_NODE_BY_ID,
  FACILITY_ORDER_BY_ID
} from "../data/facilities.js";
import { normalizeCompanions, normalizeFacilitiesState } from "../state/facilities_state.js";
import { normalizeFeatsState } from "../state/feats_state.js";
import { getFeat } from "./feats.js";
import { spendMaterials } from "../rules/material_rules.js";

function isFeatAchieved(featsState, featId) {
  return Object.hasOwn(normalizeFeatsState(featsState).completed, featId);
}

/** A facility is open once the feat that brings its keeper home is achieved. */
export function isFacilityOpen(featsState, facilityId) {
  const facility = FACILITY_BY_ID.get(facilityId);
  return Boolean(facility) && isFeatAchieved(featsState, facility.featId);
}

export function listFacilities(featsState) {
  return FACILITIES.map(facility => ({ facility, open: isFacilityOpen(featsState, facility.id) }));
}

/**
 * What the town shows: every open facility, plus the shallowest one that is
 * still closed, as the next person to look for (#2018). The deeper closed
 * ones stay hidden until then.
 */
export function listTownFacilities(featsState) {
  const entries = listFacilities(featsState);
  const nextClosed = entries.find(entry => !entry.open);
  return entries.filter(entry => entry.open || entry === nextClosed);
}

/** Everyone the run is leading out, in the order they joined. */
export function listRunCompanions(run) {
  return normalizeCompanions(run?.companions).map(companionId => COMPANIONS[companionId]);
}

/** "鉱夫頭・司祭", or "" when the run leads no one. */
export function getEscortNames(run) {
  return listRunCompanions(run).map(companion => companion.name).join("・");
}

export function isFacilityNodeBought(facilitiesState, nodeId) {
  return normalizeFacilitiesState(facilitiesState).nodes.includes(nodeId);
}

/**
 * Why a node cannot be bought right now, or "" when it can. The reasons are
 * facts the player can act on: the missing feat with its progress, the
 * earlier node, or the materials.
 */
export function getFacilityNodeBlockReason(nodeId, { feats, facilities, metaMaterials } = {}) {
  const definition = FACILITY_NODE_BY_ID.get(nodeId);
  if (!definition) return "存在しない解放項目";
  const facility = FACILITIES.find(candidate => candidate.nodes.includes(definition));
  if (!isFacilityOpen(feats, facility.id)) return `${facility.name}がまだ開いていない`;
  if (isFacilityNodeBought(facilities, nodeId)) return "解放済み";
  if (definition.requiresFeat && !isFeatAchieved(feats, definition.requiresFeat)) {
    const feat = getFeat(definition.requiresFeat);
    return feat
      ? `先に偉業「${feat.name}」を達成する（${feat.condition}）`
      : "条件を満たしていない";
  }
  if (definition.requiresNode && !isFacilityNodeBought(facilities, definition.requiresNode)) {
    return `先に「${FACILITY_NODE_BY_ID.get(definition.requiresNode)?.name || definition.requiresNode}」を解放する`;
  }
  if (!spendMaterials(metaMaterials || {}, definition.cost)) return "素材不足";
  return "";
}

/** Every node of a facility with its state, for the facility screen. */
export function listFacilityNodes(facilityId, context = {}) {
  const facility = FACILITY_BY_ID.get(facilityId);
  if (!facility) return [];
  return facility.nodes.map(definition => {
    const bought = isFacilityNodeBought(context.facilities, definition.id);
    const blockReason = bought ? "" : getFacilityNodeBlockReason(definition.id, context);
    return { node: definition, bought, blockReason, canBuy: !bought && !blockReason };
  });
}

/**
 * Buy a node. Pure: returns the next balances, or `{ ok: false, reason }`
 * without changing anything.
 */
export function purchaseFacilityNode(nodeId, { feats, facilities, metaMaterials } = {}) {
  const reason = getFacilityNodeBlockReason(nodeId, { feats, facilities, metaMaterials });
  if (reason) return { ok: false, reason };
  const definition = FACILITY_NODE_BY_ID.get(nodeId);
  const current = normalizeFacilitiesState(facilities);
  return {
    ok: true,
    node: definition,
    metaMaterials: spendMaterials(metaMaterials || {}, definition.cost),
    facilities: { ...current, nodes: [...current.nodes, nodeId] }
  };
}

// --- Orders (仕込み, #2014) ---------------------------------------------------

function findOrderFacility(orderId) {
  return FACILITIES.find(facility => (facility.orders || []).some(definition => definition.id === orderId)) || null;
}

/** The open order at a facility, with its definition, or null. */
export function getOpenFacilityOrder(facilitiesState, facilityId) {
  const open = normalizeFacilitiesState(facilitiesState).orders?.[facilityId];
  if (!open) return null;
  return { ...open, order: FACILITY_ORDER_BY_ID.get(open.orderId) || null };
}

/** Why an order cannot be placed right now, or "" when it can. */
export function getFacilityOrderBlockReason(orderId, { feats, facilities, metaMaterials } = {}) {
  const definition = FACILITY_ORDER_BY_ID.get(orderId);
  const facility = findOrderFacility(orderId);
  if (!definition || !facility) return "存在しない仕込み";
  if (!isFacilityOpen(feats, facility.id)) return `${facility.name}がまだ開いていない`;
  if (getOpenFacilityOrder(facilities, facility.id)) return "仕込み中の品がある";
  if (!spendMaterials(metaMaterials || {}, definition.cost)) return "素材不足";
  return "";
}

/**
 * Place an order: the materials are paid now and the goods are owed until a
 * safe return. One open order per facility. Pure.
 */
export function placeFacilityOrder(orderId, { feats, facilities, metaMaterials } = {}) {
  const reason = getFacilityOrderBlockReason(orderId, { feats, facilities, metaMaterials });
  if (reason) return { ok: false, reason };
  const definition = FACILITY_ORDER_BY_ID.get(orderId);
  const facility = findOrderFacility(orderId);
  const current = normalizeFacilitiesState(facilities);
  return {
    ok: true,
    order: definition,
    metaMaterials: spendMaterials(metaMaterials || {}, definition.cost),
    facilities: {
      ...current,
      orders: { ...current.orders, [facility.id]: { orderId, items: [...definition.yields] } }
    }
  };
}

/**
 * Settle open orders at the end of a run. A safe return finishes them into
 * storage as far as it has room; what does not fit stays owed for the next
 * safe return, and nothing is discarded. A death or an abandoned run leaves
 * every order open. Pure.
 */
export function settleFacilityOrders(facilitiesState, storage, storageMax, outcome) {
  const facilities = normalizeFacilitiesState(facilitiesState);
  const nextStorage = Array.isArray(storage) ? [...storage] : [];
  const openItems = Object.values(facilities.orders || {}).reduce((total, order) => total + order.items.length, 0);
  if (openItems === 0) return { facilities, storage: nextStorage, result: null };
  if (outcome !== "retreat") {
    return { facilities, storage: nextStorage, result: { delivered: [], waiting: openItems } };
  }
  const limit = Number.isFinite(storageMax) ? Math.max(0, Math.floor(storageMax)) : 30;
  const orders = {};
  const delivered = [];
  Object.entries(facilities.orders || {}).forEach(([facilityId, order]) => {
    const room = Math.max(0, limit - nextStorage.length);
    const fitting = order.items.slice(0, room);
    const held = order.items.slice(room);
    nextStorage.push(...fitting);
    delivered.push(...fitting);
    if (held.length > 0) orders[facilityId] = { orderId: order.orderId, items: held };
  });
  return {
    facilities: { ...facilities, orders },
    storage: nextStorage,
    result: { delivered, waiting: openItems - delivered.length }
  };
}

/** Starting kits opened by bought facility nodes. */
export function getUnlockedStartingKitIds(facilitiesState) {
  return normalizeFacilitiesState(facilitiesState).nodes
    .map(nodeId => FACILITY_NODE_BY_ID.get(nodeId)?.grants?.startingKit)
    .filter(Boolean);
}
