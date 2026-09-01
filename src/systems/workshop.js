import { CRAFT_RECIPES } from "../craft.js";
import {
  WORKSHOP_NODE_BY_ID,
  WORKSHOP_NODES,
  WORKSHOP_LATERAL_UNLOCKS
} from "../data/workshop.js";
import { getAffixDefinition } from "../data/affixes.js";
import { getItemData } from "../rules/item_rules.js";
import {
  getDepartureCraftCost as getDepartureCraftCostSummary,
  spendDepartureCraftRecipes
} from "../rules/craft_rules.js";
import { spendMaterials } from "../rules/material_rules.js";

export function createDefaultWorkshopState() {
  return { ranks: {}, lateralUnlocks: [] };
}

export function getWorkshopRank(workshop, nodeId) {
  return Math.max(0, Math.floor(workshop?.ranks?.[nodeId] || 0));
}

export function getWorkshopNodeCost(node, rank) {
  return node?.costs?.[rank] || null;
}

export function isWorkshopNodeUnlocked(node, keyItems) {
  return !node?.requiresKeyItem
    || (Array.isArray(keyItems) && keyItems.includes(node.requiresKeyItem));
}

export function purchaseWorkshopNode(metaMaterials, workshop, nodeId, keyItems = []) {
  const node = WORKSHOP_NODE_BY_ID.get(nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  if (workshop?.lateralUnlocks?.includes(nodeId)) {
    return { ok: false, reason: "already_unlocked" };
  }
  if (!isWorkshopNodeUnlocked(node, keyItems)) {
    return { ok: false, reason: "missing_key_item" };
  }
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

function normalizeDepartureCraftSelection(recipeIds) {
  return Array.isArray(recipeIds) ? [...recipeIds] : [];
}

export function getDepartureCraftRecipes(recipeIds) {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  return selected.map(recipeId => CRAFT_RECIPES.find(recipe => recipe.resultId === recipeId)).filter(Boolean);
}

export function getDepartureCraftCost(recipeIds) {
  return getDepartureCraftCostSummary(getDepartureCraftRecipes(recipeIds));
}

function purchaseSelectedDepartureCraft(metaMaterials, recipes) {
  return spendDepartureCraftRecipes(metaMaterials, recipes);
}

export function canAffordDepartureCraft(metaMaterials, recipeIds) {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.some(recipeId => !CRAFT_RECIPES.some(recipe => recipe.resultId === recipeId))) {
    return false;
  }
  return purchaseSelectedDepartureCraft(
    metaMaterials,
    getDepartureCraftRecipes(selected)
  ) !== null;
}

export function getDepartureCraftBalance(metaMaterials, recipeIds) {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.length === 0) return { ...metaMaterials };
  const purchase = purchaseSelectedDepartureCraft(
    metaMaterials,
    getDepartureCraftRecipes(selected)
  );
  return purchase ? purchase.balance : { ...metaMaterials };
}

export function getAdditionalCraftableCount(metaMaterials, recipeIds, recipeId, cap = 99) {
  let count = 0;
  const candidate = [...normalizeDepartureCraftSelection(recipeIds)];
  while (count < cap) {
    candidate.push(recipeId);
    if (!canAffordDepartureCraft(metaMaterials, candidate)) break;
    count += 1;
  }
  return count;
}

// 選択内容を1回だけ購入する。失敗時は残高を変更しない。
export function purchaseDepartureCraft(metaMaterials, recipeIds) {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.some(recipeId => !CRAFT_RECIPES.some(recipe => recipe.resultId === recipeId))) {
    return { ok: false, reason: "unknown_recipe" };
  }
  const recipes = getDepartureCraftRecipes(selected);
  const purchase = purchaseSelectedDepartureCraft(metaMaterials, recipes);
  if (!purchase) return { ok: false, reason: "insufficient_materials" };
  return {
    ok: true,
    recipeIds: selected,
    itemIds: selected,
    cost: purchase.spent,
    payment: getDepartureCraftCost(selected),
    metaMaterials: purchase.balance
  };
}

export function getDepartureCraftGrants(recipeIds) {
  const recipes = getDepartureCraftRecipes(recipeIds);
  return {
    items: recipes
      .filter(recipe => !recipe.identifyPowder)
      .map(recipe => recipe.resultId),
    identifyPowder: recipes.reduce(
      (sum, recipe) => sum + (recipe.identifyPowder || 0),
      0
    )
  };
}

export function getWorkshopGrants(workshop) {
  const grants = {
    startingGear: [],
    affixIds: [],
    lateralAffixIds: [],
    spellIds: [],
    stats: {},
    identifyPowder: 0,
    returnItems: []
  };
  const lateralUnlocks = Array.isArray(workshop?.lateralUnlocks) ? workshop.lateralUnlocks : [];
  WORKSHOP_NODES.forEach(node => {
    const rank = getWorkshopRank(workshop, node.id);
    const lateral = lateralUnlocks.includes(node.id);
    if (rank <= 0 && !lateral) return;
    if (node.grants.startingGear) grants.startingGear.push(node.grants.startingGear);
    grants.affixIds.push(...(node.grants.affixIds || []));
    if (lateral) grants.lateralAffixIds.push(...(node.grants.affixIds || []));
    grants.spellIds.push(...(node.grants.spellIds || []));
    if (node.grants.stat) grants.stats[node.grants.stat] = rank * node.grants.amount;
    grants.identifyPowder += rank * (node.grants.identifyPowder || 0);
    if (node.grants.returnItem) grants.returnItems.push(node.grants.returnItem);
  });
  grants.affixIds = [...new Set(grants.affixIds)];
  grants.lateralAffixIds = [...new Set(grants.lateralAffixIds)];
  grants.spellIds = [...new Set(grants.spellIds)];
  return grants;
}

const KNOWLEDGE_STAGE_SCORE = Object.freeze({ discovery: 1, observation: 2, trial: 3, full: 4 });

function getRecoveredEquipmentSignals(item) {
  const data = getItemData(item) || {};
  const affixes = Array.isArray(item?.affixes) ? item.affixes : [];
  const definitions = affixes.map(getAffixDefinition).filter(Boolean);
  return {
    coreIds: new Set(definitions.filter(definition => definition.kind === "core").map(definition => definition.id)),
    buildRoles: new Set([
      item?.buildRole,
      ...(Array.isArray(item?.buildRoles) ? item.buildRoles : []),
      ...definitions.map(definition => definition.buildRole)
    ].filter(Boolean)),
    lootRoles: new Set(item?.lootRole ? [item.lootRole] : []),
    tags: new Set([
      ...(Array.isArray(item?.tags) ? item.tags : []),
      ...(Array.isArray(data.tags) ? data.tags : [])
    ]),
    types: new Set(data.type ? [data.type] : []),
    knowledgeStage: typeof item?.knowledgeStage === "string" ? item.knowledgeStage : "discovery"
  };
}

function scoreLateralCandidate(candidate, signals) {
  const matchedSignals = [];
  let score = 0;
  if (candidate.relatedCoreIds?.some(id => signals.coreIds.has(id))) {
    score += 100;
    matchedSignals.push("core");
  }
  if (candidate.relatedBuildRoles?.some(role => signals.buildRoles.has(role))) {
    score += 10;
    matchedSignals.push("buildRole");
  }
  if (candidate.relatedLootRoles?.some(role => signals.lootRoles.has(role))) {
    score += 8;
    matchedSignals.push("lootRole");
  }
  if (candidate.relatedTags?.some(tag => signals.tags.has(tag))) {
    score += 5;
    matchedSignals.push("tag");
  }
  if (candidate.relatedTypes?.some(type => signals.types.has(type))) {
    score += 2;
    matchedSignals.push("type");
  }
  if (candidate.relatedKnowledgeStages?.includes(signals.knowledgeStage)) {
    score += KNOWLEDGE_STAGE_SCORE[signals.knowledgeStage] || 0;
    matchedSignals.push("knowledge");
  }
  return { score, matchedSignals };
}

function getAutomaticWorkshopCandidates(workshop, recoveredEquipment, deepestFloor) {
  const available = WORKSHOP_LATERAL_UNLOCKS.filter(({ nodeId, minDepth }) => (
    deepestFloor >= minDepth
    && !workshop.lateralUnlocks.includes(nodeId)
    && getWorkshopRank(workshop, nodeId) <= 0
  ));
  return available
    .map(candidate => {
      const matches = (recoveredEquipment || [])
        .map(item => scoreLateralCandidate(candidate, getRecoveredEquipmentSignals(item)))
        .filter(match => match.score > 0)
        .sort((left, right) => right.score - left.score)[0];
      return matches ? { candidate, ...matches } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.candidate.nodeId.localeCompare(right.candidate.nodeId));
}

/**
 * Apply one automatic Workshop side-grade based on the recovered equipment's
 * authored signals. The player never selects a build or a candidate; the
 * return result only makes a related existing possibility eligible. Existing
 * manually purchased nodes are skipped, and one return can grant at most one
 * node.
 */
export function applyAutomaticWorkshopUnlock(workshop, { deepestFloor = 1, recoveredEquipment = [] } = {}) {
  const next = {
    ...(workshop || {}),
    ranks: { ...(workshop?.ranks || {}) },
    lateralUnlocks: Array.isArray(workshop?.lateralUnlocks) ? [...workshop.lateralUnlocks] : []
  };
  const candidateMatch = getAutomaticWorkshopCandidates(next, recoveredEquipment, deepestFloor)[0];
  if (!candidateMatch) return { workshop: next, unlocked: null, matchedSignals: [] };

  const { candidate, matchedSignals } = candidateMatch;
  next.lateralUnlocks.push(candidate.nodeId);
  const node = WORKSHOP_NODE_BY_ID.get(candidate.nodeId);
  return { workshop: next, unlocked: node || null, matchedSignals };
}

export function applyWorkshopToCharacter(character, workshop) {
  const grants = getWorkshopGrants(workshop);
  Object.entries(grants.stats).forEach(([stat, amount]) => {
    character[stat] = (character[stat] || 0) + amount;
  });
  character.unlockedAffixIds = grants.affixIds;
  character.lateralUnlockAffixIds = grants.lateralAffixIds;
  character.unlockedSpellIds = grants.spellIds;
  return character;
}
