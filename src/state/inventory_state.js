import { state } from "./state_core.js";
import { getItemBaseId, isSpecialOrQuestItem } from "../data.js";

export function addInventoryItemToState(targetState, item, options = {}) {
  const allowQuestOverflow = options.allowQuestOverflow ?? false;
  const itemId = getItemBaseId(item);
  
  const isQuestItem = isSpecialOrQuestItem(itemId);
  
  if (targetState.inventory.length >= 20 && !allowQuestOverflow && !isQuestItem) {
    return false;
  }

  // 所持制限チェック: 蘇生上位品と帰還スクロールはバッグに1個まで
  if (itemId === "SACRED_ASHES" || itemId === "LIFE_WATER" || itemId === "TOWN_PORTAL") {
    const hasLimitedItem = targetState.inventory.some(i => getItemBaseId(i) === itemId);
    if (hasLimitedItem) {
      return false;
    }
  }
  
  targetState.inventory.push(item);
  return true;
}

export function addInventoryItem(item, options = {}) {
  return addInventoryItemToState(state, item, options);
}
