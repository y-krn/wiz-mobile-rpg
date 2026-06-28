import { state, saveAutosave, addLog } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { openSubmenu } from "../navigation.js";
import { shopState } from "./shop_state.js";

export function openShopAppraise() {
  shopState.mode = "appraise";
  shopState.selectedKey = null;
  shopState.selectedIdx = -1;
  shopState.lastAppraised = null;
  openSubmenu("shop_main", "ボルタック商店 - 鑑定：");
}

export function executeAppraise(idx, cost, hasTicket) {
  if (hasTicket) {
    state.identifyTickets = Math.max(0, state.identifyTickets - 1);
  } else {
    state.gold -= cost;
  }
  
  const eqItem = state.inventory[idx];
  const beforeName = getItemData(eqItem).name;

  eqItem.identified = true;
  const resultItem = getItemData(eqItem);

  playSound("level_up");
  addLog(`鑑定成功！未鑑定のアイテムは [${resultItem.name}] だった！`);
  saveAutosave();

  // Save appraisal results
  shopState.lastAppraised = {
    idx: idx,
    beforeName: beforeName
  };

  const goldLabel = document.getElementById("gold-counter");
  if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

  return true;
}
