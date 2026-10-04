// Facility state queries and node purchases (#2009). A purchase spends town
// materials on a horizontal unlock; it is mapped to the workshop domain.

import { FACILITIES, FACILITY_BY_ID, FACILITY_NODE_BY_ID } from "../data/facilities.js";
import { normalizeFacilitiesState } from "../state/facilities_state.js";
import { normalizeFeatsState } from "../state/feats_state.js";
import { getFeat, getFeatProgress, formatFeatProgress } from "./feats.js";
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
    const progress = feat ? getFeatProgress(feat, normalizeFeatsState(feats).counters) : null;
    return feat
      ? `条件：偉業「${feat.name}」（${feat.condition}／${formatFeatProgress(feat, progress)}）`
      : "条件を満たしていない";
  }
  if (definition.requiresNode && !isFacilityNodeBought(facilities, definition.requiresNode)) {
    return `条件：「${FACILITY_NODE_BY_ID.get(definition.requiresNode)?.name || definition.requiresNode}」の解放`;
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
  return {
    ok: true,
    node: definition,
    metaMaterials: spendMaterials(metaMaterials || {}, definition.cost),
    facilities: { nodes: [...normalizeFacilitiesState(facilities).nodes, nodeId] }
  };
}

/** Starting kits opened by bought facility nodes. */
export function getUnlockedStartingKitIds(facilitiesState) {
  return normalizeFacilitiesState(facilitiesState).nodes
    .map(nodeId => FACILITY_NODE_BY_ID.get(nodeId)?.grants?.startingKit)
    .filter(Boolean);
}
