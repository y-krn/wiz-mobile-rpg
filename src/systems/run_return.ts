// balance-impact: none — canonical run-return writer and compatibility boundary only.

import { getItemBaseId, getItemData, isSpecialOrQuestItem } from "../data.js";
import { settleRunObjectLoot } from "../state/run_loot.js";
import { CODEX_INSIGHT_DEFINITIONS, recordRunInsights } from "../state/codex_state.js";
import {
  normalizeReturnItemHistory,
  normalizeReturnItemRecord,
  normalizeReturnProcessing,
  normalizeRunInsights,
  normalizeWorkshopUnlocks,
  type NormalizedRunCodexInsight,
  type NormalizedRunReturnItemRecord,
  type NormalizedRunReturnProcessing,
  type NormalizedRunWorkshopUnlock
} from "../state/run_return_state.js";
import type { RuntimeItemCollection } from "../state/item.js";
import { applyAutomaticWorkshopUnlock } from "./workshop.js";

type SettleRunObjectLootBoundary = (
  stateLike: ReturnStateLike,
  outcome: string,
  salvageIds: unknown
) => unknown;
type RecordRunInsightsBoundary = (
  stateLike: ReturnStateLike,
  items: unknown[],
  floor: unknown
) => unknown;
type ApplyAutomaticWorkshopUnlockBoundary = (
  workshop: unknown,
  options: { deepestFloor: unknown; recoveredEquipment: unknown[] }
) => unknown;

// These dependencies remain JavaScript-owned in this Issue. The casts narrow
// their legacy declarations to the minimal runtime boundaries used here.
const settleRunObjectLootAtBoundary = settleRunObjectLoot as unknown as SettleRunObjectLootBoundary;
const recordRunInsightsAtBoundary = recordRunInsights as unknown as RecordRunInsightsBoundary;
const applyAutomaticWorkshopUnlockAtBoundary = applyAutomaticWorkshopUnlock as unknown as ApplyAutomaticWorkshopUnlockBoundary;

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);
const RARITY_SCORE: Readonly<Record<string, number>> = Object.freeze({
  common: 1,
  magic: 3,
  rare: 6,
  epic: 10,
  legendary: 15
});
const HISTORY_LIMIT = 5;

interface ReturnRunLike {
  equipmentFound?: RuntimeItemCollection;
  unbankedObjectLoot?: unknown[];
  bankedObjectLoot?: RuntimeItemCollection;
  lostObjectLoot?: RuntimeItemCollection;
  itemsFound?: RuntimeItemCollection;
  deepestFloor?: number;
  returnReason?: string;
  codexInsights?: NormalizedRunCodexInsight[];
  workshopUnlocks?: NormalizedRunWorkshopUnlock[];
  representativeItem?: NormalizedRunReturnItemRecord | null;
  meaningfulItemHistory?: NormalizedRunReturnItemRecord[];
  returnProcessing?: NormalizedRunReturnProcessing | null;
  [key: string]: unknown;
}

interface ReturnStateLike {
  currentRun?: ReturnRunLike | null;
  party?: unknown[];
  workshop?: unknown;
  runHistory?: unknown[];
  [key: string]: unknown;
}

interface ItemSnapshot {
  item: unknown;
  baseId: string;
  name: string;
  type: string;
  rarity: string;
  knowledgeStage: string;
  wasEquipped: boolean;
  affixCount: number;
  depth: number;
}

interface SettlementResult {
  banked: unknown[];
  lost: unknown[];
}

interface ProcessRunReturnResult {
  settlement: SettlementResult;
  representativeItem: NormalizedRunReturnItemRecord | null;
  meaningfulItemHistory: NormalizedRunReturnItemRecord[];
  insights: NormalizedRunCodexInsight[];
  workshopUnlocks: NormalizedRunWorkshopUnlock[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function itemId(item: unknown): unknown {
  return getItemBaseId(item);
}

function isUsefulItem(item: unknown): boolean {
  const id = itemId(item);
  return Boolean(id) && !isSpecialOrQuestItem(id) && Boolean(getItemData(item));
}

function sameItem(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!isRecord(left) || !isRecord(right)) return false;
  return Boolean(left.instanceId && left.instanceId === right.instanceId);
}

function uniqueItems(items: unknown[]): unknown[] {
  const result: unknown[] = [];
  items.forEach(item => {
    if (!isUsefulItem(item)) return;
    if (result.some(existing => sameItem(existing, item) || (
      !isRecord(existing) && !isRecord(item) && itemId(existing) === itemId(item)
    ))) return;
    result.push(item);
  });
  return result;
}

function wasEquipped(stateLike: ReturnStateLike, item: unknown): boolean {
  return asArray(stateLike.party).some(char => {
    const equipment = isRecord(char) ? char.equipment : null;
    return isRecord(equipment) && Object.values(equipment).some(equipped => sameItem(equipped, item));
  });
}

function createItemSnapshot(stateLike: ReturnStateLike, item: unknown, deepestFloor: unknown): ItemSnapshot {
  const rawData: unknown = getItemData(item);
  const data = isRecord(rawData) ? rawData : {};
  const itemRecord = isRecord(item) ? item : null;
  const rawBaseId = itemId(item);
  const baseId = typeof rawBaseId === "string" ? rawBaseId : String(rawBaseId || "");
  const identified = !itemRecord || itemRecord.identified !== false;
  const affixes = itemRecord?.affixes;
  return {
    item,
    baseId,
    name: identified
      ? (typeof data.name === "string" ? data.name : baseId || "不明な品")
      : (typeof itemRecord?.unidentifiedName === "string" ? itemRecord.unidentifiedName : "未鑑定の品"),
    type: typeof data.type === "string" ? data.type : "item",
    rarity: typeof itemRecord?.rarity === "string" ? itemRecord.rarity : "common",
    knowledgeStage: typeof itemRecord?.knowledgeStage === "string" ? itemRecord.knowledgeStage : "unknown",
    wasEquipped: wasEquipped(stateLike, item),
    affixCount: Array.isArray(affixes) ? affixes.length : 0,
    depth: Math.max(1, Number(deepestFloor) || 1)
  };
}

function containsItem(items: unknown, item: unknown): boolean {
  return asArray(items).some(candidate => sameItem(candidate, item) || (
    itemId(candidate) && itemId(candidate) === itemId(item) &&
    !isRecord(candidate) && !isRecord(item)
  ));
}

function itemStatus(run: ReturnRunLike, item: unknown): "lost" | "rescued" | "returned" | "observed" {
  if (containsItem(run.lostObjectLoot, item)) return "lost";
  if (containsItem(run.bankedObjectLoot, item)) {
    return run.returnReason === "escape_scroll" ? "rescued" : "returned";
  }
  return "observed";
}

function scoreSnapshot(snapshot: ItemSnapshot): number {
  return (RARITY_SCORE[snapshot.rarity] || RARITY_SCORE.common) * 10
    + snapshot.affixCount * 3
    + (EQUIPMENT_TYPES.has(snapshot.type) ? 2 : 0)
    + (snapshot.wasEquipped ? 5 : 0);
}

function toHistoryRecord(
  snapshot: ItemSnapshot,
  status: "lost" | "rescued" | "returned" | "observed"
): NormalizedRunReturnItemRecord | null {
  // This is deliberately a fact record, not a retained item. Combat stats,
  // affixes, and enhancement values never become a Castle ability bonus.
  return normalizeReturnItemRecord({
    baseId: snapshot.baseId,
    name: snapshot.name,
    type: snapshot.type === "rune" ? "item" : snapshot.type,
    rarity: snapshot.rarity,
    knowledgeStage: snapshot.knowledgeStage,
    status,
    wasEquipped: snapshot.wasEquipped,
    depth: snapshot.depth
  });
}

function getRunCandidates(run: ReturnRunLike): unknown[] {
  const unbankedItems = asArray(run.unbankedObjectLoot).map(entry => (
    isRecord(entry) ? entry.item : undefined
  ));
  return uniqueItems([
    ...asArray(run.equipmentFound),
    ...unbankedItems,
    ...asArray(run.bankedObjectLoot),
    ...asArray(run.lostObjectLoot),
    ...asArray(run.itemsFound)
  ]);
}

function normalizeSettlement(value: unknown): SettlementResult {
  if (!isRecord(value)) return { banked: [], lost: [] };
  return {
    banked: asArray(value.banked),
    lost: asArray(value.lost)
  };
}

function normalizeInsightInput(value: unknown): unknown[] {
  return asArray(value).map(insight => {
    if (!isRecord(insight)) return null;
    const id = typeof insight.id === "string" ? insight.id : "";
    const definition = Object.entries(CODEX_INSIGHT_DEFINITIONS)
      .find(([key]) => key === id)?.[1];
    return {
      id,
      label: typeof definition === "string"
        ? definition
        : "新しい傾向を記録した。"
    };
  });
}

function normalizeWorkshopResult(value: unknown): {
  workshop: unknown;
  unlocks: NormalizedRunWorkshopUnlock[];
} {
  if (!isRecord(value)) return { workshop: undefined, unlocks: [] };
  const unlocked = isRecord(value.unlocked)
    ? [{
      nodeId: value.unlocked.id,
      name: value.unlocked.name,
      description: value.unlocked.description,
      matchedSignals: value.matchedSignals
    }]
    : [];
  return {
    workshop: value.workshop,
    unlocks: normalizeWorkshopUnlocks(unlocked)
  };
}

/**
 * Convert a terminal dungeon result into Castle records. The only retained
 * objects are the already-settled Town inventory; history uses compact facts
 * so a return cannot turn dungeon equipment into permanent battle gear.
 */
export function processRunReturn(
  stateLike: ReturnStateLike,
  outcome: string,
  salvageIds: unknown = null
): ProcessRunReturnResult {
  const run = stateLike?.currentRun;
  if (!run) {
    return {
      settlement: { banked: [], lost: [] },
      representativeItem: null,
      meaningfulItemHistory: [],
      insights: [],
      workshopUnlocks: []
    };
  }

  const candidates = getRunCandidates(run);
  const snapshots = candidates.map(item => createItemSnapshot(stateLike, item, run.deepestFloor));
  const settlement = normalizeSettlement(settleRunObjectLootAtBoundary(stateLike, outcome, salvageIds));
  const rawInsights: unknown = recordRunInsightsAtBoundary(stateLike, candidates, run.deepestFloor);
  const insights = normalizeRunInsights(normalizeInsightInput(rawInsights));
  run.codexInsights = insights;

  const recoveredEquipment = asArray(run.bankedObjectLoot)
    .filter(item => EQUIPMENT_TYPES.has(String((getItemData(item) || {}).type)));
  const rawWorkshopResult: unknown = applyAutomaticWorkshopUnlockAtBoundary(stateLike.workshop, {
    deepestFloor: run.deepestFloor,
    recoveredEquipment: (outcome === "retreat" || outcome === "wing") ? recoveredEquipment : []
  });
  const workshopResult = normalizeWorkshopResult(rawWorkshopResult);
  stateLike.workshop = workshopResult.workshop;
  run.workshopUnlocks = workshopResult.unlocks;

  const ranked = snapshots
    .map(snapshot => ({ snapshot, status: itemStatus(run, snapshot.item), score: scoreSnapshot(snapshot) }))
    .sort((left, right) => right.score - left.score);
  const representative = ranked[0] || null;
  const representativeItem = representative
    ? toHistoryRecord(representative.snapshot, representative.status)
    : null;
  const meaningfulItemHistory = normalizeReturnItemHistory(ranked
    .slice(0, HISTORY_LIMIT)
    .map(({ snapshot, status }) => toHistoryRecord(snapshot, status)));
  run.representativeItem = representativeItem;
  run.meaningfulItemHistory = meaningfulItemHistory;

  const returnProcessing = normalizeReturnProcessing({
    outcome,
    returnedObjectCount: settlement.banked.length,
    lostObjectCount: settlement.lost.length,
    recoveredEquipmentCount: recoveredEquipment.length
  });
  run.returnProcessing = returnProcessing;

  return {
    settlement,
    representativeItem,
    meaningfulItemHistory,
    insights,
    workshopUnlocks: workshopResult.unlocks
  };
}

export function setRepresentativeItem(stateLike: ReturnStateLike, itemRecord: unknown): boolean {
  const run = stateLike?.currentRun;
  if (!run) return false;
  const normalized = normalizeReturnItemRecord(itemRecord);
  if (!normalized) return false;
  run.representativeItem = normalized;
  const historyEntry = stateLike.runHistory?.[0];
  if (isRecord(historyEntry)) historyEntry.representativeItem = { ...normalized };
  return true;
}
