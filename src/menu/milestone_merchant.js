import { ITEMS } from "../data/items.js";
import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../data/milestone_merchant.js";
import { addLog, saveAutosave, state } from "../state.js";
import { getCursedEquipment, purchaseMilestoneStock, purchaseMilestoneUncurse } from "../systems/milestone_merchant.js";
import { getItemData } from "../rules/item_rules.js";
import { canAffordMaterials } from "../rules/material_rules.js";
import { updateUI } from "../ui.js";

function formatCost(cost) {
  return Object.entries(cost).map(([name, amount]) => `${name}×${amount}`).join(" / ");
}

function createSection(label) {
  const heading = document.createElement("div");
  heading.className = "milestone-merchant-heading";
  heading.textContent = label;
  return heading;
}

export function renderMilestoneMerchant(optGrid) {
  optGrid.innerHTML = "";
  optGrid.classList.add("milestone-merchant-grid");
  const materials = state.currentRun?.materials || {};
  const total = Object.values(materials).reduce((sum, value) => sum + value, 0);
  optGrid.appendChild(createSection(`節目商人：素材 ${total}`));

  MILESTONE_MERCHANT_STOCK.forEach(entry => {
    const button = document.createElement("button");
    const affordable = canAffordMaterials(materials, entry.cost);
    const full = entry.kind === "item" && state.inventory.length >= 20;
    button.type = "button";
    button.dataset.stockKind = entry.kind;
    button.className = `btn btn-block milestone-merchant-option${affordable && !full ? " btn-neon" : " disabled"}`;
    button.disabled = !affordable || full;
    const itemName = entry.itemId ? ITEMS[entry.itemId]?.name || entry.name : entry.name;
    button.textContent = `${itemName}｜${formatCost(entry.cost)}${full ? "｜バッグ満杯" : ""}`;
    button.addEventListener("click", () => {
      if (!purchaseMilestoneStock(state, entry.id).ok) return;
      addLog(`節目商人から${itemName}を購入した。`);
      state.codex.events.facilities.merchant.purchased++;
      saveAutosave();
      renderMilestoneMerchant(optGrid);
      updateUI();
    });
    optGrid.appendChild(button);
  });

  const cursed = getCursedEquipment(state.party[0]);
  optGrid.appendChild(createSection(`解呪｜${formatCost(MILESTONE_UNCURSE_COST)}`));
  if (cursed.length === 0) {
    const empty = document.createElement("div");
    empty.className = "milestone-merchant-empty";
    empty.textContent = "解呪できる装備なし";
    optGrid.appendChild(empty);
  }
  cursed.forEach(({ slot, item }) => {
    const button = document.createElement("button");
    const affordable = canAffordMaterials(state.currentRun?.materials, MILESTONE_UNCURSE_COST);
    button.type = "button";
    button.className = `btn btn-danger btn-block milestone-merchant-option${affordable ? "" : " disabled"}`;
    button.disabled = !affordable;
    button.textContent = `${getItemData(item).name}の呪いを解く`;
    button.addEventListener("click", () => {
      if (!purchaseMilestoneUncurse(state, slot).ok) return;
      addLog(`${getItemData(item).name}の呪いを解いた。`);
      state.codex.events.facilities.merchant.purchased++;
      saveAutosave();
      renderMilestoneMerchant(optGrid);
      updateUI();
    });
    optGrid.appendChild(button);
  });
}
