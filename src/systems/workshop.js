import { WORKSHOP_NODE_BY_ID, WORKSHOP_NODES } from "../data/workshop.js";
import { spendMaterials } from "../rules/material_rules.js";

export function createDefaultWorkshopState() {
  return { ranks: {} };
}

export function getWorkshopRank(workshop, nodeId) {
  return Math.max(0, Math.floor(workshop?.ranks?.[nodeId] || 0));
}

export function getWorkshopNodeCost(node, rank) {
  return node?.costs?.[rank] || null;
}

export function purchaseWorkshopNode(metaMaterials, workshop, nodeId) {
  const node = WORKSHOP_NODE_BY_ID.get(nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  const rank = getWorkshopRank(workshop, nodeId);
  const maxRank = node.maxRank || 1;
  if (rank >= maxRank) return { ok: false, reason: "max_rank" };
  const cost = getWorkshopNodeCost(node, rank);
  const balance = spendMaterials(metaMaterials, cost);
  if (!balance) return { ok: false, reason: "insufficient_materials" };
  return {
    ok: true,
    metaMaterials: balance,
    workshop: { ...workshop, ranks: { ...(workshop?.ranks || {}), [nodeId]: rank + 1 } }
  };
}

export function getWorkshopGrants(workshop) {
  const grants = {
    startingGear: [],
    affixIds: [],
    spellIds: [],
    stats: {},
    identifyPowder: 0,
    returnItems: []
  };
  WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    if (rank <= 0) return;
    if (node.grants.startingGear) grants.startingGear.push(node.grants.startingGear);
    grants.affixIds.push(...(node.grants.affixIds || []));
    grants.spellIds.push(...(node.grants.spellIds || []));
    if (node.grants.stat) grants.stats[node.grants.stat] = rank * node.grants.amount;
    grants.identifyPowder += rank * (node.grants.identifyPowder || 0);
    if (node.grants.returnItem) grants.returnItems.push(node.grants.returnItem);
  });
  return grants;
}

export function applyWorkshopToCharacter(character, workshop) {
  const grants = getWorkshopGrants(workshop);
  Object.entries(grants.stats).forEach(([stat, amount]) => {
    character[stat] = (character[stat] || 0) + amount;
  });
  character.unlockedAffixIds = grants.affixIds;
  character.unlockedSpellIds = grants.spellIds;
  return character;
}

