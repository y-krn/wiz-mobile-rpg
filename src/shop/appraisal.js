import { state, saveAutosave, addLog } from "../state.js";
import { getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { openSubmenu } from "../navigation.js";
import { shopState } from "./shop_state.js";
import { getActiveSynergies, recordSynergyDiscovery } from "../data/tags.js";

export function openShopAppraise() {
  shopState.mode = "appraise";
  shopState.selectedKey = null;
  shopState.selectedIdx = -1;
  shopState.lastAppraised = null;
  openSubmenu("shop_main", "ボルタック商店 - 鑑定：");
}

export function executeHalfAppraise(idx, cost) {
  state.gold -= cost;
  
  const eqItem = state.inventory[idx];
  eqItem.halfIdentified = true;
  
  playSound("heal");
  
  const hintLabels = {
    fire_rite: "火葬", holy: "聖", spirit: "霊", poison: "毒",
    dragon: "竜", iron: "鉄", blood: "血", curse: "呪",
    ward: "守勢", appraisal: "鑑定", beast: "獣", ambush: "奇襲",
    blade: "刃", trap: "罠", search: "探索", exorcism: "退魔",
    analysis: "解析", follow_up: "連撃", record: "記録", evasion: "回避"
  };
  const hints = eqItem.hintTags ? eqItem.hintTags.map(t => hintLabels[t] || t).join("・") : "なし";
  addLog(`簡易鑑定完了！未鑑定品は[気配タグ: ${hints}] ${eqItem.curseSuspected ? "[呪いの疑いあり]" : ""}`);
  
  saveAutosave();
  
  const goldLabel = document.getElementById("gold-counter");
  if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;
  
  return true;
}

export function executeFullAppraise(idx, cost, hasTicket) {
  if (hasTicket) {
    state.identifyTickets = Math.max(0, state.identifyTickets - 1);
  } else {
    state.gold -= cost;
  }
  
  const eqItem = state.inventory[idx];
  const beforeName = getItemData(eqItem).name;
  
  eqItem.identified = true;
  eqItem.halfIdentified = true;
  const resultItem = getItemData(eqItem);
  
  playSound("level_up");
  addLog(`完全鑑定成功！正体は [${resultItem.name}] だった！`);
  
  // シナジー発見の自動記録
  const activeSyns = getActiveSynergies(state.party);
  activeSyns.forEach(syn => {
    recordSynergyDiscovery(syn.id, { codex: state.codex, addLog });
  });
  
  saveAutosave();
  
  shopState.lastAppraised = {
    idx: idx,
    beforeName: beforeName
  };
  
  const goldLabel = document.getElementById("gold-counter");
  if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;
  
  return true;
}

// 既存の互換性用
export function executeAppraise(idx, cost, hasTicket) {
  return executeFullAppraise(idx, cost, hasTicket);
}
