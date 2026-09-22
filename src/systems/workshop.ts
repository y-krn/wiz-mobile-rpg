import { CRAFT_RECIPES } from "../craft.js";
import {
  RETIRED_WORKSHOP_NODES,
  WORKSHOP_LATERAL_UNLOCKS,
  WORKSHOP_NODE_BY_ID,
  WORKSHOP_NODES
} from "../data/workshop.js";
import { getAffixDefinition } from "../data/affixes.js";
import { getItemData } from "../rules/item_rules.js";
import {
  getDepartureCraftCost as getDepartureCraftCostSummary,
  spendDepartureCraftRecipes
} from "../rules/craft_rules.js";
import { spendMaterials } from "../rules/material_rules.js";

export interface NormalizedWorkshopState {
  ranks: Record<string, number>;
  lateralUnlocks: string[];
}

export interface WorkshopNode {
  id: string;
  name: string;
  description: string;
  costs: Record<string, number>[];
  maxRank?: number;
  requiresKeyItem?: string;
  grants: {
    startingGear?: string;
    affixIds?: string[];
    spellIds?: string[];
    identifyPowder?: number;
    returnItem?: string;
  };
}

interface LateralUnlockCandidate {
  nodeId: string;
  minDepth: number;
  relatedCoreIds?: string[];
  relatedBuildRoles?: string[];
  relatedLootRoles?: string[];
  relatedTags?: string[];
  relatedTypes?: string[];
  relatedKnowledgeStages?: string[];
}

interface CraftRecipe {
  resultId: string;
  identifyPowder?: number;
  mats?: Record<string, number>;
  [key: string]: unknown;
}

type MaterialBalance = Record<string, number>;

export interface WorkshopGrants {
  startingGear: string[];
  affixIds: string[];
  lateralAffixIds: string[];
  spellIds: string[];
  identifyPowder: number;
  returnItems: string[];
}

export interface WorkshopUnlockResult {
  workshop: NormalizedWorkshopState;
  unlocked: WorkshopNode | null;
  matchedSignals: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const WORKSHOP_STATE_FIELDS = ["ranks", "lateralUnlocks"] as const;
const RETIRED_WORKSHOP_NODE_IDS = new Set(
  RETIRED_WORKSHOP_NODES
    .map((node: unknown) => isRecord(node) && typeof node.id === "string" ? node.id : null)
    .filter((id): id is string => id !== null)
);

function hasExactOwnFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === fields.length && fields.every(field => ownKeys.includes(field));
}

function isDenseStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean) &&
    value.every(item => typeof item === "string");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    Number.isInteger(value) && value >= 0;
}

function normalizeRankValue(value: unknown): number {
  let numeric: number;
  try {
    numeric = Number(value);
  } catch {
    return 0;
  }
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function normalizeRanks(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([nodeId]) => !nodeId.startsWith("stat_") && !RETIRED_WORKSHOP_NODE_IDS.has(nodeId))
      .map(([nodeId, rank]) => [nodeId, normalizeRankValue(rank)])
  );
}

function normalizeLateralUnlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const nodeId of value) {
    if (typeof nodeId !== "string" || seen.has(nodeId)) continue;
    seen.add(nodeId);
    normalized.push(nodeId);
  }
  return normalized;
}

export function isNormalizedWorkshopState(value: unknown): value is NormalizedWorkshopState {
  if (!isRecord(value) || !hasExactOwnFields(value, WORKSHOP_STATE_FIELDS)) return false;
  if (!isRecord(value.ranks) || Reflect.ownKeys(value.ranks).some(key => typeof key !== "string")) {
    return false;
  }
  if (!Object.values(value.ranks).every(isNonNegativeInteger)) return false;
  if (!isDenseStringArray(value.lateralUnlocks)) return false;
  return new Set(value.lateralUnlocks).size === value.lateralUnlocks.length;
}

export function normalizeWorkshopState(value: unknown): NormalizedWorkshopState {
  const source = isRecord(value) ? value : {};
  return {
    ranks: normalizeRanks(source.ranks),
    lateralUnlocks: normalizeLateralUnlocks(source.lateralUnlocks)
  };
}

export function createDefaultWorkshopState(): NormalizedWorkshopState {
  return { ranks: {}, lateralUnlocks: [] };
}

function getWorkshopRanks(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.ranks)) return {};
  return value.ranks;
}

export function getWorkshopRank(workshop: unknown, nodeId: string): number {
  return normalizeRankValue(getWorkshopRanks(workshop)[nodeId]);
}

function isWorkshopNode(value: unknown): value is WorkshopNode {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.name === "string" && typeof value.description === "string" &&
    Array.isArray(value.costs) && isRecord(value.grants);
}

function getWorkshopNode(nodeId: string): WorkshopNode | undefined {
  const node = WORKSHOP_NODE_BY_ID.get(nodeId);
  return isWorkshopNode(node) ? node : undefined;
}

function getWorkshopNodes(): WorkshopNode[] {
  return WORKSHOP_NODES.filter(isWorkshopNode);
}

function isLateralUnlockCandidate(value: unknown): value is LateralUnlockCandidate {
  return isRecord(value) && typeof value.nodeId === "string" &&
    typeof value.minDepth === "number";
}

export function getWorkshopNodeCost(node: WorkshopNode | null | undefined, rank: number): Record<string, number> | null {
  return node?.costs?.[rank] || null;
}

export function isWorkshopNodeUnlocked(node: WorkshopNode | null | undefined, keyItems: unknown): boolean {
  return !node?.requiresKeyItem ||
    (Array.isArray(keyItems) && keyItems.includes(node.requiresKeyItem));
}

export function purchaseWorkshopNode(
  metaMaterials: MaterialBalance,
  workshop: unknown,
  nodeId: string,
  keyItems: unknown[] = []
): { ok: false; reason: string } | {
  ok: true;
  metaMaterials: MaterialBalance;
  workshop: NormalizedWorkshopState;
} {
  const node = getWorkshopNode(nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  const normalized = normalizeWorkshopState(workshop);
  if (normalized.lateralUnlocks.includes(nodeId)) return { ok: false, reason: "already_unlocked" };
  if (!isWorkshopNodeUnlocked(node, keyItems)) return { ok: false, reason: "missing_key_item" };
  const rank = getWorkshopRank(normalized, nodeId);
  const maxRank = node.maxRank || 1;
  if (rank >= maxRank) return { ok: false, reason: "max_rank" };
  const balance = spendMaterials(metaMaterials, getWorkshopNodeCost(node, rank));
  if (!balance) return { ok: false, reason: "insufficient_materials" };
  return {
    ok: true,
    metaMaterials: balance,
    workshop: { ...normalized, ranks: { ...normalized.ranks, [nodeId]: rank + 1 } }
  };
}

function isCraftRecipe(value: unknown): value is CraftRecipe {
  return isRecord(value) && typeof value.resultId === "string";
}

function getCraftRecipe(recipeId: unknown): CraftRecipe | undefined {
  if (typeof recipeId !== "string") return undefined;
  const recipe = CRAFT_RECIPES.find((candidate: unknown) => isCraftRecipe(candidate) && candidate.resultId === recipeId);
  return isCraftRecipe(recipe) ? recipe : undefined;
}

function normalizeDepartureCraftSelection(recipeIds: unknown): unknown[] {
  return Array.isArray(recipeIds) ? [...recipeIds] : [];
}

export function getDepartureCraftRecipes(recipeIds: unknown): CraftRecipe[] {
  return normalizeDepartureCraftSelection(recipeIds)
    .map(getCraftRecipe)
    .filter((recipe): recipe is CraftRecipe => recipe !== undefined);
}

export function getDepartureCraftCost(recipeIds: unknown): { typed: MaterialBalance; any: number } {
  return getDepartureCraftCostSummary(getDepartureCraftRecipes(recipeIds));
}

function purchaseSelectedDepartureCraft(metaMaterials: MaterialBalance, recipes: CraftRecipe[]) {
  return spendDepartureCraftRecipes(metaMaterials, recipes);
}

export function canAffordDepartureCraft(metaMaterials: MaterialBalance, recipeIds: unknown): boolean {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.some(recipeId => !getCraftRecipe(recipeId))) return false;
  return purchaseSelectedDepartureCraft(metaMaterials, getDepartureCraftRecipes(selected)) !== null;
}

export function getDepartureCraftBalance(metaMaterials: MaterialBalance, recipeIds: unknown): MaterialBalance {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.length === 0) return { ...metaMaterials };
  const purchase = purchaseSelectedDepartureCraft(metaMaterials, getDepartureCraftRecipes(selected));
  return purchase ? purchase.balance : { ...metaMaterials };
}

export function getAdditionalCraftableCount(metaMaterials: MaterialBalance, recipeIds: unknown, recipeId: string, cap = 99): number {
  let count = 0;
  const candidate = [...normalizeDepartureCraftSelection(recipeIds)];
  while (count < cap) {
    candidate.push(recipeId);
    if (!canAffordDepartureCraft(metaMaterials, candidate)) break;
    count += 1;
  }
  return count;
}

export function purchaseDepartureCraft(metaMaterials: MaterialBalance, recipeIds: unknown) {
  const selected = normalizeDepartureCraftSelection(recipeIds);
  if (selected.some(recipeId => !getCraftRecipe(recipeId))) return { ok: false, reason: "unknown_recipe" } as const;
  const purchase = purchaseSelectedDepartureCraft(metaMaterials, getDepartureCraftRecipes(selected));
  if (!purchase) return { ok: false, reason: "insufficient_materials" } as const;
  return {
    ok: true as const,
    recipeIds: selected,
    itemIds: selected,
    cost: purchase.spent,
    payment: getDepartureCraftCost(selected),
    metaMaterials: purchase.balance
  };
}

export function getDepartureCraftGrants(recipeIds: unknown): { items: string[]; identifyPowder: number } {
  const recipes = getDepartureCraftRecipes(recipeIds);
  return {
    items: recipes.filter(recipe => !recipe.identifyPowder).map(recipe => recipe.resultId),
    identifyPowder: recipes.reduce((sum, recipe) => sum + (recipe.identifyPowder || 0), 0)
  };
}

export function getWorkshopGrants(workshop: unknown): WorkshopGrants {
  const grants: WorkshopGrants = {
    startingGear: [], affixIds: [], lateralAffixIds: [], spellIds: [], identifyPowder: 0, returnItems: []
  };
  const normalized = normalizeWorkshopState(workshop);
  getWorkshopNodes().forEach(node => {
    const rank = getWorkshopRank(normalized, node.id);
    const lateral = normalized.lateralUnlocks.includes(node.id);
    if (rank <= 0 && !lateral) return;
    if (node.grants.startingGear) grants.startingGear.push(node.grants.startingGear);
    grants.affixIds.push(...(node.grants.affixIds || []));
    if (lateral) grants.lateralAffixIds.push(...(node.grants.affixIds || []));
    grants.spellIds.push(...(node.grants.spellIds || []));
    grants.identifyPowder += rank * (node.grants.identifyPowder || 0);
    if (node.grants.returnItem) grants.returnItems.push(node.grants.returnItem);
  });
  grants.affixIds = [...new Set(grants.affixIds)];
  grants.lateralAffixIds = [...new Set(grants.lateralAffixIds)];
  grants.spellIds = [...new Set(grants.spellIds)];
  return grants;
}

const KNOWLEDGE_STAGE_SCORE: Readonly<Record<string, number>> = Object.freeze({ discovery: 1, observation: 2, trial: 3, full: 4 });

interface RecoveredEquipmentSignals {
  coreIds: Set<unknown>;
  buildRoles: Set<unknown>;
  lootRoles: Set<unknown>;
  tags: Set<unknown>;
  types: Set<unknown>;
  knowledgeStage: string;
}

function getRecoveredEquipmentSignals(item: unknown): RecoveredEquipmentSignals {
  const rawData = getItemData(item);
  const data = isRecord(rawData) ? rawData : {};
  const affixes = isRecord(item) && Array.isArray(item.affixes) ? item.affixes : [];
  const definitions: Record<string, unknown>[] = [];
  for (const affix of affixes) {
    const definition: unknown = getAffixDefinition(affix);
    if (isRecord(definition)) definitions.push(definition);
  }
  return {
    coreIds: new Set(definitions.filter(definition => definition.kind === "core").map(definition => definition.id)),
    buildRoles: new Set([
      isRecord(item) ? item.buildRole : undefined,
      ...(isRecord(item) && Array.isArray(item.buildRoles) ? item.buildRoles : []),
      ...definitions.map(definition => definition.buildRole)
    ].filter(Boolean)),
    lootRoles: new Set(isRecord(item) && item.lootRole ? [item.lootRole] : []),
    tags: new Set([
      ...(isRecord(item) && Array.isArray(item.tags) ? item.tags : []),
      ...(Array.isArray(data.tags) ? data.tags : [])
    ]),
    types: new Set(data.type ? [data.type] : []),
    knowledgeStage: isRecord(item) && typeof item.knowledgeStage === "string" ? item.knowledgeStage : "discovery"
  };
}

function scoreLateralCandidate(candidate: LateralUnlockCandidate, signals: RecoveredEquipmentSignals) {
  const matchedSignals: string[] = [];
  let score = 0;
  if (candidate.relatedCoreIds?.some(id => signals.coreIds.has(id))) { score += 100; matchedSignals.push("core"); }
  if (candidate.relatedBuildRoles?.some(role => signals.buildRoles.has(role))) { score += 10; matchedSignals.push("buildRole"); }
  if (candidate.relatedLootRoles?.some(role => signals.lootRoles.has(role))) { score += 8; matchedSignals.push("lootRole"); }
  if (candidate.relatedTags?.some(tag => signals.tags.has(tag))) { score += 5; matchedSignals.push("tag"); }
  if (candidate.relatedTypes?.some(type => signals.types.has(type))) { score += 2; matchedSignals.push("type"); }
  if (candidate.relatedKnowledgeStages?.includes(signals.knowledgeStage)) {
    score += KNOWLEDGE_STAGE_SCORE[signals.knowledgeStage] || 0;
    matchedSignals.push("knowledge");
  }
  return { score, matchedSignals };
}

function getAutomaticWorkshopCandidates(workshop: NormalizedWorkshopState, recoveredEquipment: unknown[], deepestFloor: number) {
  const available = WORKSHOP_LATERAL_UNLOCKS.filter(isLateralUnlockCandidate).filter(({ nodeId, minDepth }) => (
    deepestFloor >= minDepth && !workshop.lateralUnlocks.includes(nodeId) && getWorkshopRank(workshop, nodeId) <= 0
  ));
  return available
    .map(candidate => {
      const matches = recoveredEquipment
        .map(item => scoreLateralCandidate(candidate, getRecoveredEquipmentSignals(item)))
        .filter(match => match.score > 0)
        .sort((left, right) => right.score - left.score)[0];
      return matches ? { candidate, ...matches } : null;
    })
    .filter((match): match is NonNullable<typeof match> => match !== null)
    .sort((left, right) => right.score - left.score || left.candidate.nodeId.localeCompare(right.candidate.nodeId));
}

export function applyAutomaticWorkshopUnlock(workshop: unknown, { deepestFloor = 1, recoveredEquipment = [] }: { deepestFloor?: number; recoveredEquipment?: unknown[] } = {}): WorkshopUnlockResult {
  const next = normalizeWorkshopState(workshop);
  const candidateMatch = getAutomaticWorkshopCandidates(next, recoveredEquipment, deepestFloor)[0];
  if (!candidateMatch) return { workshop: next, unlocked: null, matchedSignals: [] };
  const { candidate, matchedSignals } = candidateMatch;
  next.lateralUnlocks.push(candidate.nodeId);
  return { workshop: next, unlocked: getWorkshopNode(candidate.nodeId) || null, matchedSignals };
}

interface CharacterLike {
  unlockedAffixIds?: unknown;
  lateralUnlockAffixIds?: unknown;
  unlockedSpellIds?: unknown;
  [key: string]: unknown;
}

export function applyWorkshopToCharacter(character: CharacterLike, workshop: unknown): CharacterLike {
  const grants = getWorkshopGrants(workshop);
  character.unlockedAffixIds = grants.affixIds;
  character.lateralUnlockAffixIds = grants.lateralAffixIds;
  character.unlockedSpellIds = grants.spellIds;
  return character;
}
