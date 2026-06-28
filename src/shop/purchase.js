import { state, saveAutosave, addLog, recordEquipmentDiscovery, addInventoryItem } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { shopState } from "./shop_state.js";

export function executePurchase(itemKey, price) {
  const item = getItemData(itemKey);
  const added = addInventoryItem(itemKey);
  if (!added) {
    addLog("バッグがいっぱいで購入できません。");
    return false;
  }
  state.gold -= price;
  recordEquipmentDiscovery(itemKey);
  playSound("gold");
  addLog(`${item.name}を${price}ゴールドで購入した。`);
  saveAutosave();
  
  const nextBagCheck = state.inventory.length >= 20;
  if (nextBagCheck) {
    shopState.selectedKey = null;
  }
  
  const goldLabel = document.getElementById("gold-counter");
  if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;
  
  return true;
}

export function executeSale(idx, price) {
  const item = getItemData(state.inventory[idx]);
  const currentSelectedIdx = idx;
  
  // フィルタ後の現在の位置（filteredClickIdx）を特定する
  const mappedInventory = state.inventory.map((itemVal, idx) => {
    const item = getItemData(itemVal);
    return { itemVal, idx, item };
  });
  const filteredInventory = mappedInventory.filter(({ item }) => {
    if (!item) return false;
    if (shopState.filter === "all") return true;
    if (shopState.filter === "weapon") return item.type === "weapon";
    if (shopState.filter === "armor") return item.type === "armor" || item.type === "shield";
    if (shopState.filter === "usable") return item.type === "usable";
    return true;
  });
  
  const filteredClickIdx = filteredInventory.findIndex(entry => entry.idx === currentSelectedIdx);

  // 売却実行
  state.gold += price;
  state.inventory.splice(currentSelectedIdx, 1);
  playSound("gold");
  addLog(`${item.name}を${price}ゴールドで売却した。`);
  saveAutosave();

  // 売却後のインベントリを再構築して、次の選択対象を決定する
  const postMappedInventory = state.inventory.map((itemVal, idx) => {
    const item = getItemData(itemVal);
    return { itemVal, idx, item };
  });
  const postFilteredInventory = postMappedInventory.filter(({ item }) => {
    if (!item) return false;
    if (shopState.filter === "all") return true;
    if (shopState.filter === "weapon") return item.type === "weapon";
    if (shopState.filter === "armor") return item.type === "armor" || item.type === "shield";
    if (shopState.filter === "usable") return item.type === "usable";
    return true;
  });

  if (postFilteredInventory.length > 0) {
    let nextSelectIdxInFiltered = filteredClickIdx;
    if (nextSelectIdxInFiltered >= postFilteredInventory.length) {
      nextSelectIdxInFiltered = postFilteredInventory.length - 1;
    }
    const nextEntry = postFilteredInventory[nextSelectIdxInFiltered];
    shopState.selectedIdx = nextEntry.idx;
    shopState.selectedKey = nextEntry.itemVal;
  } else {
    shopState.selectedIdx = -1;
    shopState.selectedKey = null;
  }

  const goldLabel = document.getElementById("gold-counter");
  if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

  return true;
}
