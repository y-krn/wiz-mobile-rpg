import { getItemBaseId, getItemData, isSpecialOrQuestItem } from "../rules/item_rules.js";

// This is intentionally separate from equipped/unbagged state. An item can be
// equipped and still remain an unbanked dungeon result until the run ends.
export const RETURN_WING_SALVAGE_COUNT = 2;

function getRun(stateLike) {
  return stateLike?.currentRun && typeof stateLike.currentRun === "object"
    ? stateLike.currentRun
    : null;
}

function getItemId(item) {
  return getItemBaseId(item);
}

function isBankableObject(item) {
  const itemId = getItemId(item);
  return Boolean(itemId) && !isSpecialOrQuestItem(itemId);
}

function nextLootId(run) {
  run.lootSequence = Math.max(0, Math.floor(Number(run.lootSequence) || 0)) + 1;
  return `${run.startedAt || "run"}:loot:${run.lootSequence}`;
}

export function recordDungeonObjectLoot(stateLike, item) {
  const run = getRun(stateLike);
  if (!run || !isBankableObject(item)) return false;
  run.unbankedObjectLoot ||= [];
  run.unbankedObjectLoot.push({ id: nextLootId(run), item });
  return true;
}

export function consumeRunObjectLoot(stateLike, item) {
  const run = getRun(stateLike);
  if (!run) return false;
  const itemId = getItemId(item);
  // Current item-use actions carry only a base item ID, not an ownership ID.
  // Until individual selection exists, consume confirmed Town stock first so
  // a dungeon duplicate does not unexpectedly restore a Town preparation item.
  const townIndex = (run.townInventory || []).findIndex(entry => getItemId(entry) === itemId);
  if (townIndex !== -1) {
    run.townInventory.splice(townIndex, 1);
    return true;
  }
  const unbankedIndex = (run.unbankedObjectLoot || [])
    .findIndex(entry => getItemId(entry?.item) === itemId);
  if (unbankedIndex !== -1) {
    run.unbankedObjectLoot.splice(unbankedIndex, 1);
    return true;
  }
  return false;
}

export function replaceRunObjectLoot(stateLike, previousItem, nextItem) {
  const run = getRun(stateLike);
  if (!run) return false;
  const previousId = getItemId(previousItem);
  const sameInstance = (candidate, expected) => candidate === expected || (
    candidate && expected && typeof candidate === "object" && typeof expected === "object" &&
    candidate.instanceId && candidate.instanceId === expected.instanceId
  );

  const townIndex = (run.townInventory || []).findIndex(item => sameInstance(item, previousItem));
  if (townIndex !== -1) {
    run.townInventory[townIndex] = nextItem;
    return true;
  }
  const unbankedEntry = (run.unbankedObjectLoot || []).find(entry => sameInstance(entry?.item, previousItem));
  if (unbankedEntry) {
    unbankedEntry.item = nextItem;
    return true;
  }

  // Primitive IDs and legacy objects without instanceId are not individually
  // addressable yet. Keep the explicit fallback policy consistent with use.
  const townFallbackIndex = previousId
    ? (run.townInventory || []).findIndex(item => getItemId(item) === previousId)
    : -1;
  if (townFallbackIndex !== -1) {
    run.townInventory[townFallbackIndex] = nextItem;
    return true;
  }
  const unbankedFallback = previousId
    ? (run.unbankedObjectLoot || []).find(entry => getItemId(entry?.item) === previousId)
    : null;
  if (unbankedFallback) {
    unbankedFallback.item = nextItem;
    return true;
  }
  return false;
}

function takeByIds(entries, selectedIds = null) {
  const selected = selectedIds ? new Set(selectedIds) : null;
  return (entries || []).filter(entry => !selected || selected.has(entry.id));
}

function removeTrackedItemsFromInventory(stateLike, items) {
  const remaining = new Map();
  (items || []).forEach(item => {
    const itemId = getItemId(item);
    if (itemId) remaining.set(itemId, (remaining.get(itemId) || 0) + 1);
  });
  stateLike.inventory = (stateLike.inventory || []).filter(item => {
    const itemId = getItemId(item);
    const count = remaining.get(itemId) || 0;
    if (count <= 0) return true;
    remaining.set(itemId, count - 1);
    return false;
  });
}

function removeTrackedItemsFromEquipment(stateLike, entries, inventoryBeforeRemoval, townItems) {
  const trackedCounts = new Map();
  const inventoryCounts = new Map();
  const townCounts = new Map();
  (entries || []).forEach(entry => {
    const itemId = getItemId(entry.item);
    if (itemId) trackedCounts.set(itemId, (trackedCounts.get(itemId) || 0) + 1);
  });
  (inventoryBeforeRemoval || []).forEach(item => {
    const itemId = getItemId(item);
    if (itemId) inventoryCounts.set(itemId, (inventoryCounts.get(itemId) || 0) + 1);
  });
  (townItems || []).forEach(item => {
    const itemId = getItemId(item);
    if (itemId) townCounts.set(itemId, (townCounts.get(itemId) || 0) + 1);
  });
  const fallbackEquippedCounts = new Map([...trackedCounts].map(([itemId, count]) => [
    itemId,
    Math.max(0, count - Math.max(0, (inventoryCounts.get(itemId) || 0) - (townCounts.get(itemId) || 0)))
  ]));

  stateLike.party?.forEach(char => {
    Object.entries(char.equipment || {}).forEach(([slot, item]) => {
      const itemId = getItemId(item);
      const exactMatch = item && typeof item === "object" && (entries || []).some(entry => (
        entry.item === item || (
          entry.item && typeof entry.item === "object" &&
          item.instanceId && item.instanceId === entry.item.instanceId
        )
      ));
      const fallbackMatch = itemId && (fallbackEquippedCounts.get(itemId) || 0) > 0;
      if (item && (exactMatch || fallbackMatch)) {
        char.equipment[slot] = null;
        if (fallbackMatch) fallbackEquippedCounts.set(itemId, fallbackEquippedCounts.get(itemId) - 1);
      }
    });
  });
}

function appendToTownStorage(stateLike, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  stateLike.storage ||= [];
  stateLike.storage.push(...items);
}

function isTownPreparationItem(item) {
  return getItemData(item)?.type === "usable";
}

/**
 * Resolve object ownership at a run terminal. Town-owned items that were not
 * consumed are always returned to permanent storage. Returned dungeon
 * consumables are also Town preparation stock, while recovered equipment is
 * confirmed only for the terminal result and never becomes next-run storage;
 * death and abandon lose unbanked dungeon loot.
 */
export function settleRunObjectLoot(stateLike, outcome, salvageIds = null) {
  const run = getRun(stateLike);
  if (!run) return { banked: [], lost: [] };

  const unbanked = Array.isArray(run.unbankedObjectLoot)
    ? run.unbankedObjectLoot.filter(entry => entry && entry.item)
    : [];
  const townItems = Array.isArray(run.townInventory) ? [...run.townInventory] : [];
  const returnedLoot = outcome === "retreat"
    ? unbanked
    : salvageIds
      ? takeByIds(unbanked, salvageIds).slice(0, RETURN_WING_SALVAGE_COUNT)
      : [];
  const lostLoot = unbanked.filter(entry => !returnedLoot.some(item => item.id === entry.id));
  const returnedDungeonItems = returnedLoot.map(entry => entry.item);
  const bankedItems = [...townItems, ...returnedDungeonItems];
  const returnedPreparationItems = returnedDungeonItems.filter(isTownPreparationItem);

  appendToTownStorage(stateLike, [...townItems, ...returnedPreparationItems]);
  removeTrackedItemsFromEquipment(stateLike, unbanked, stateLike.inventory, townItems);
  removeTrackedItemsFromInventory(stateLike, [
    ...townItems,
    ...unbanked.map(entry => entry.item)
  ]);

  run.returnedTownItems = townItems;
  run.bankedObjectLoot = returnedLoot.map(entry => entry.item);
  run.lostObjectLoot = lostLoot.map(entry => entry.item);
  run.unbankedObjectLoot = [];
  run.townInventory = [];
  return { banked: bankedItems, lost: run.lostObjectLoot };
}
