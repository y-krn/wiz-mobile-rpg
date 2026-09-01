import { ITEMS } from "../data/items.js";
import { MILESTONE_MERCHANT_STOCK, MILESTONE_UNCURSE_COST } from "../data/milestone_merchant.js";
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { addLog, saveAutosave, state } from "../state.js";
import { getCursedEquipment, purchaseMilestoneStock, purchaseMilestoneUncurse } from "../systems/milestone_merchant.js";
import { getItemData } from "../rules/item_rules.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { canAffordMaterials, spendMaterials } from "../rules/material_rules.js";
import { updateUI } from "../ui.js";
import { createActionCard } from "./action_card.js";

let selectedOffer = null;
function formatCostWithBalance(cost, materials) {
  return Object.entries(cost || {})
    .map(([name, amount]) => `${name} ${amount}（所持 ${materials?.[name] || 0}）`)
    .join("・");
}

export function getAdditionalPurchaseCount(materials, cost, inventorySlots = Infinity) {
  const slotLimit = Number.isFinite(inventorySlots)
    ? Math.max(0, Math.floor(inventorySlots))
    : Infinity;
  if (slotLimit === 0) return 0;

  let materialLimit = Infinity;
  Object.entries(cost || {}).forEach(([name, amount]) => {
    const quantity = Math.max(0, Math.floor(Number(amount) || 0));
    if (quantity === 0) return;
    materialLimit = Math.min(
      materialLimit,
      Math.floor(Math.max(0, Number(materials?.[name]) || 0) / quantity)
    );
  });

  if (materialLimit === Infinity) return slotLimit;
  return Math.max(0, Math.min(materialLimit, slotLimit));
}

function createSection(label, className = "") {
  const heading = document.createElement("div");
  heading.className = `milestone-merchant-heading${className ? ` ${className}` : ""}`;
  heading.textContent = label;
  return heading;
}

function getEntryDisplayName(entry) {
  return entry.itemId ? ITEMS[entry.itemId]?.name || entry.name : entry.name;
}

function getEntryDescription(entry) {
  if (entry.itemId) return ITEMS[entry.itemId]?.desc || "迷宮で使える補給品。";
  return "未鑑定の装備を1つ見通せる。";
}

function getSelectedLabel() {
  if (!selectedOffer) return "商品を選択してください";
  if (selectedOffer.kind === "uncurse") {
    return `${getItemData(selectedOffer.item).name}の呪いを解く`;
  }
  const entry = MILESTONE_MERCHANT_STOCK.find(item => item.id === selectedOffer.id);
  return entry ? `${getEntryDisplayName(entry)}を購入` : "商品を選択してください";
}

function getSelectedCost() {
  if (!selectedOffer) return null;
  if (selectedOffer.kind === "uncurse") return MILESTONE_UNCURSE_COST;
  return MILESTONE_MERCHANT_STOCK.find(item => item.id === selectedOffer.id)?.cost || null;
}

function renderMaterialBalance(materials) {
  const selectedCost = getSelectedCost();
  const remaining = selectedCost ? spendMaterials(materials, selectedCost) || materials : materials;
  const balance = createSection(
    selectedCost
      ? `購入確定前：${selectedOffer.kind === "uncurse" ? "解呪後" : "購入後"}の残素材`
      : "素材残高",
    "milestone-merchant-balance"
  );
  balance.setAttribute("aria-label", selectedCost ? "購入確定前の残素材" : "所持素材");

  const balances = document.createElement("div");
  balances.className = "milestone-merchant-balances solo-start-craft-balances";
  balances.setAttribute("aria-live", "polite");
  MATERIAL_TYPES.forEach(material => {
    const original = Math.max(0, Math.floor(Number(materials?.[material]) || 0));
    const next = Math.max(0, Math.floor(Number(remaining?.[material]) || 0));
    if (original <= 0 && next <= 0) return;
    const badge = document.createElement("span");
    badge.className = "milestone-merchant-balance-item solo-start-craft-balance";
    badge.dataset.material = material;
    badge.dataset.balance = String(next);
    badge.textContent = `${material} ${next}${next < original ? ` (-${original - next})` : ""}`;
    balances.appendChild(badge);
  });
  if (balances.childElementCount === 0) {
    const empty = document.createElement("span");
    empty.className = "milestone-merchant-balance-empty";
    empty.textContent = "所持素材なし";
    balances.appendChild(empty);
  }
  balance.appendChild(balances);
  return balance;
}

function renderConfirmFooter(optGrid) {
  const footer = document.getElementById("merchant-confirm-footer");
  if (!footer) return;
  footer.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "merchant-selection-summary";
  summary.textContent = selectedOffer ? `選択中：${getSelectedLabel()}` : "商品を選択してください";
  footer.appendChild(summary);

  const confirm = document.createElement("button");
  confirm.id = "btn-merchant-confirm";
  confirm.type = "button";
  confirm.className = "btn btn-neon btn-block merchant-confirm-button";
  confirm.textContent = selectedOffer?.kind === "uncurse" ? "解呪する" : "購入する";
  confirm.disabled = !selectedOffer;
  confirm.addEventListener("click", () => {
    if (!selectedOffer) return;
    const result = selectedOffer.kind === "uncurse"
      ? purchaseMilestoneUncurse(state, selectedOffer.slot)
      : purchaseMilestoneStock(state, selectedOffer.id);
    if (!result.ok) return;
    const label = getSelectedLabel();
    addLog(selectedOffer.kind === "uncurse"
      ? `${getItemData(selectedOffer.item).name}の呪いを解いた。`
      : `深層商人から${label}した。`);
    state.codex.events.facilities.merchant.purchased++;
    saveAutosave();
    selectedOffer = null;
    renderMilestoneMerchant(optGrid);
    updateUI();
  });
  footer.appendChild(confirm);
}

export function renderMilestoneMerchant(optGrid) {
  const isFresh = !optGrid.classList.contains("milestone-merchant-grid");
  optGrid.innerHTML = "";
  optGrid.classList.add("milestone-merchant-grid");
  if (isFresh) selectedOffer = null;
  const materials = state.currentRun?.materials || {};
  optGrid.appendChild(renderMaterialBalance(materials));
  optGrid.appendChild(createSection("購入できる品"));

  MILESTONE_MERCHANT_STOCK.forEach(entry => {
    const inventorySlots = entry.kind === "item"
      ? Math.max(0, INVENTORY_CAPACITY - state.inventory.length)
      : Infinity;
    const additionalPurchaseCount = getAdditionalPurchaseCount(materials, entry.cost, inventorySlots);
    const full = entry.kind === "item" && inventorySlots === 0;
    const itemName = getEntryDisplayName(entry);
    const status = additionalPurchaseCount > 0
      ? `あと${additionalPurchaseCount}個`
      : `あと0個・${full ? "バッグ満杯" : "素材不足"}`;
    const button = createActionCard({
      name: itemName,
      description: getEntryDescription(entry),
      cost: `価格：${formatCostWithBalance(entry.cost, materials)} ・ ${status}`,
      costClassName: additionalPurchaseCount === 0 ? "is-insufficient" : "",
      className: "milestone-merchant-option",
      selected: selectedOffer?.kind === "stock" && selectedOffer.id === entry.id,
      disabled: additionalPurchaseCount === 0,
      ariaPressed: selectedOffer?.kind === "stock" && selectedOffer.id === entry.id,
      dataset: { stockId: entry.id, stockKind: entry.kind },
      onClick: () => {
        selectedOffer = { kind: "stock", id: entry.id };
        renderMilestoneMerchant(optGrid);
      }
    });
    optGrid.appendChild(button);
  });

  const cursed = getCursedEquipment(state.party[0]);
  optGrid.appendChild(createSection("解呪できる装備"));
  if (cursed.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "解呪できる装備なし";
    optGrid.appendChild(empty);
  }
  cursed.forEach(({ slot, item }) => {
    const affordable = canAffordMaterials(materials, MILESTONE_UNCURSE_COST);
    const itemName = getItemData(item).name;
    const button = createActionCard({
      name: `${itemName}の呪いを解く`,
      description: "呪いを解き、装備を使える状態に戻す。",
      cost: `価格：${formatCostWithBalance(MILESTONE_UNCURSE_COST, materials)} ・ ${affordable ? "実行可能" : "素材不足"}`,
      costClassName: affordable ? "" : "is-insufficient",
      className: "milestone-merchant-option milestone-merchant-uncurse-option",
      selected: selectedOffer?.kind === "uncurse" && selectedOffer.slot === slot,
      disabled: !affordable,
      ariaPressed: selectedOffer?.kind === "uncurse" && selectedOffer.slot === slot,
      dataset: { stockKind: "uncurse", slot },
      onClick: () => {
        selectedOffer = { kind: "uncurse", slot, item };
        renderMilestoneMerchant(optGrid);
      }
    });
    optGrid.appendChild(button);
  });

  renderConfirmFooter(optGrid);
}
