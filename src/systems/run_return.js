import { getItemBaseId, getItemData, isSpecialOrQuestItem } from "../data.js";
import { settleRunObjectLoot } from "../state/run_loot.js";
import { CODEX_INSIGHT_DEFINITIONS, recordRunInsights } from "../state/codex_state.js";
import { applyAutomaticWorkshopUnlock } from "./workshop.js";

const EQUIPMENT_TYPES = new Set(["weapon", "shield", "armor", "accessory"]);
const RARITY_SCORE = Object.freeze({ common: 1, magic: 3, rare: 6, epic: 10, legendary: 15 });
const HISTORY_LIMIT = 5;

function itemId(item) {
  return getItemBaseId(item);
}

function isUsefulItem(item) {
  const id = itemId(item);
  return Boolean(id) && !isSpecialOrQuestItem(id) && Boolean(getItemData(item));
}

function sameItem(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  return Boolean(left.instanceId && left.instanceId === right.instanceId);
}

function uniqueItems(items) {
  const result = [];
  (items || []).forEach(item => {
    if (!isUsefulItem(item)) return;
    if (result.some(existing => sameItem(existing, item) || (
      typeof existing !== "object" && typeof item !== "object" && itemId(existing) === itemId(item)
    ))) return;
    result.push(item);
  });
  return result;
}

function wasEquipped(stateLike, item) {
  return (stateLike.party || []).some(char => Object.values(char.equipment || {}).some(equipped => (
    sameItem(equipped, item)
  )));
}

function createItemSnapshot(stateLike, item, deepestFloor) {
  const data = getItemData(item) || {};
  return {
    item,
    baseId: itemId(item),
    name: data.name || itemId(item) || "不明な品",
    type: data.type || "item",
    rarity: typeof item?.rarity === "string" ? item.rarity : "common",
    knowledgeStage: typeof item?.knowledgeStage === "string" ? item.knowledgeStage : "unknown",
    wasEquipped: wasEquipped(stateLike, item),
    affixCount: Array.isArray(item?.affixes) ? item.affixes.length : 0,
    depth: Math.max(1, Number(deepestFloor) || 1)
  };
}

function containsItem(items, item) {
  return (items || []).some(candidate => sameItem(candidate, item) || (
    itemId(candidate) && itemId(candidate) === itemId(item) &&
    typeof candidate !== "object" && typeof item !== "object"
  ));
}

function itemStatus(run, item) {
  if (containsItem(run.lostObjectLoot, item)) return "lost";
  if (containsItem(run.bankedObjectLoot, item)) {
    return run.returnReason === "escape_scroll" ? "rescued" : "returned";
  }
  return "observed";
}

function scoreSnapshot(snapshot) {
  return (RARITY_SCORE[snapshot.rarity] || RARITY_SCORE.common) * 10
    + snapshot.affixCount * 3
    + (EQUIPMENT_TYPES.has(snapshot.type) ? 2 : 0)
    + (snapshot.wasEquipped ? 5 : 0);
}

function toHistoryRecord(snapshot, status) {
  // This is deliberately a fact record, not a retained item. Combat stats,
  // affixes, and enhancement values never become a Castle ability bonus.
  return {
    baseId: snapshot.baseId,
    name: snapshot.name,
    type: snapshot.type,
    rarity: snapshot.rarity,
    knowledgeStage: snapshot.knowledgeStage,
    status,
    wasEquipped: snapshot.wasEquipped,
    depth: snapshot.depth
  };
}

function getRunCandidates(stateLike, run) {
  return uniqueItems([
    ...(run.equipmentFound || []),
    ...(run.unbankedObjectLoot || []).map(entry => entry.item),
    ...(run.bankedObjectLoot || []),
    ...(run.lostObjectLoot || []),
    ...(run.itemsFound || [])
  ]);
}

/**
 * Convert a terminal dungeon result into Castle records. The only retained
 * objects are the already-settled Town inventory; history uses compact facts
 * so a return cannot turn dungeon equipment into permanent battle gear.
 */
export function processRunReturn(stateLike, outcome, salvageIds = null) {
  const run = stateLike?.currentRun;
  if (!run) return { settlement: { banked: [], lost: [] }, representativeItem: null, meaningfulItemHistory: [], insights: [], workshopUnlocks: [] };

  const candidates = getRunCandidates(stateLike, run);
  const snapshots = candidates.map(item => createItemSnapshot(stateLike, item, run.deepestFloor));
  const settlement = settleRunObjectLoot(stateLike, outcome, salvageIds);
  const insights = recordRunInsights(stateLike, candidates, run.deepestFloor);
  run.codexInsights = insights.map(insight => ({
    id: insight.id,
    label: CODEX_INSIGHT_DEFINITIONS[insight.id] || "新しい傾向を記録した。"
  }));

  const recoveredEquipment = (run.bankedObjectLoot || []).filter(item => EQUIPMENT_TYPES.has(getItemData(item)?.type));
  const workshopResult = applyAutomaticWorkshopUnlock(stateLike.workshop, {
    deepestFloor: run.deepestFloor,
    recoveredEquipment: (outcome === "retreat" || outcome === "wing") ? recoveredEquipment : []
  });
  stateLike.workshop = workshopResult.workshop;
  run.workshopUnlocks = workshopResult.unlocked
    ? [{
      nodeId: workshopResult.unlocked.id,
      name: workshopResult.unlocked.name,
      description: workshopResult.unlocked.description,
      matchedSignals: workshopResult.matchedSignals
    }]
    : [];

  const ranked = snapshots
    .map(snapshot => ({ snapshot, status: itemStatus(run, snapshot.item), score: scoreSnapshot(snapshot) }))
    .sort((left, right) => right.score - left.score);
  const representative = ranked[0] || null;
  run.representativeItem = representative
    ? toHistoryRecord(representative.snapshot, representative.status)
    : null;
  run.meaningfulItemHistory = ranked
    .slice(0, HISTORY_LIMIT)
    .map(({ snapshot, status }) => toHistoryRecord(snapshot, status));
  run.returnProcessing = {
    outcome,
    returnedObjectCount: settlement.banked.length,
    lostObjectCount: settlement.lost.length,
    recoveredEquipmentCount: recoveredEquipment.length
  };

  return {
    settlement,
    representativeItem: run.representativeItem,
    meaningfulItemHistory: run.meaningfulItemHistory,
    insights: run.codexInsights,
    workshopUnlocks: run.workshopUnlocks
  };
}

export function setRepresentativeItem(stateLike, itemRecord) {
  const run = stateLike?.currentRun;
  if (!run || !itemRecord || typeof itemRecord !== "object") return false;
  run.representativeItem = { ...itemRecord };
  const historyEntry = stateLike.runHistory?.[0];
  if (historyEntry) historyEntry.representativeItem = { ...run.representativeItem };
  return true;
}
