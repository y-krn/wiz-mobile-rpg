import { state } from "./state_core.js";
import { getItemBaseId } from "../data.js";

export function addInventoryItem(item, options = {}) {
  const allowQuestOverflow = options.allowQuestOverflow ?? false;
  const itemId = getItemBaseId(item);
  
  const isQuestItem = itemId === "ANTIGRAVITY_CRYSTAL" || 
                      itemId === "DRAGON_KEY" || 
                      itemId === "LEGENDARY_SWORD" || 
                      itemId === "LEGENDARY_SHIELD";
  
  if (state.inventory.length >= 20 && !allowQuestOverflow && !isQuestItem) {
    return false;
  }

  // 所持制限チェック: 聖灰はバッグに1個まで
  if (itemId === "SACRED_ASHES") {
    const hasAshes = state.inventory.some(i => getItemBaseId(i) === "SACRED_ASHES");
    if (hasAshes) {
      return false;
    }
  }
  
  state.inventory.push(item);
  return true;
}
