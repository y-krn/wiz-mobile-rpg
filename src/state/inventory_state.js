import { state } from "./state_core.js";
import { getItemBaseId, isSpecialOrQuestItem } from "../data.js";
import { recordDungeonObjectLoot } from "./run_loot.js";
import { getInventoryRemainingSlots as getRemainingSlots, hasInventorySpace } from "../rules/item_inventory.js";

export { INVENTORY_CAPACITY, getInventoryUsedSlots, hasInventorySpace } from "../rules/item_inventory.js";

export function getInventoryRemainingSlots(inventory) {
  return getRemainingSlots(inventory);
}


export function addInventoryItemToState(targetState, item, options = {}) {
  const allowQuestOverflow = options.allowQuestOverflow ?? false;
  const itemId = getItemBaseId(item);
  
  const isQuestItem = isSpecialOrQuestItem(itemId);
  
  if (!Array.isArray(targetState.inventory)) targetState.inventory = [];
  if (!hasInventorySpace(targetState.inventory) && !allowQuestOverflow && !isQuestItem) {
    return false;
  }

  // 帰還スクロールはバッグに1個まで
  if (itemId === "TOWN_PORTAL") {
    const hasLimitedItem = targetState.inventory.some(i => getItemBaseId(i) === itemId);
    if (hasLimitedItem) {
      return false;
    }
  }
  
  targetState.inventory.push(item);
  if (options.dungeonLoot) recordDungeonObjectLoot(targetState, item);
  return true;
}

export function addInventoryItem(item, options = {}) {
  return addInventoryItemToState(state, item, options);
}
