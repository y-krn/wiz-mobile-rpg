// A town facility's screen (#2009): what its keeper offers, each offer's
// condition and cost, and what was already opened.

import { state, addLog, saveGame } from "../state.js";
import { playSound } from "../audio.js";
import { FACILITY_BY_ID } from "../data/facilities.js";
import {
  getFacilityOrderBlockReason,
  getOpenFacilityOrder,
  isFacilityOpen,
  listFacilityNodes,
  placeFacilityOrder,
  purchaseFacilityNode
} from "../systems/facilities.js";
import { ITEMS } from "../data/items.js";
import { createActionCard } from "./action_card.js";

function formatCost(cost) {
  return Object.entries(cost || {})
    .map(([name, quantity]) => `${name} ${quantity}`)
    .join("・") || "素材0個";
}

// What is held is said only where it falls short: "獣の牙 あと1".
function formatShortage(cost) {
  return Object.entries(cost || {})
    .map(([name, quantity]) => [name, quantity - Math.max(0, Math.floor(Number(state.metaMaterials?.[name]) || 0))])
    .filter(([, missing]) => missing > 0)
    .map(([name, missing]) => `${name} あと${missing}`)
    .join("・");
}

// The cost, then the one thing in the way: an earlier step, or the materials
// still missing.
function formatCostLine(cost, blockReason) {
  if (!blockReason) return formatCost(cost);
  const shortage = blockReason === "素材不足" ? formatShortage(cost) : "";
  return `${formatCost(cost)}／${shortage ? `素材が足りない（${shortage}）` : blockReason}`;
}

function getContext() {
  return { feats: state.feats, facilities: state.facilities, metaMaterials: state.metaMaterials };
}

export function renderFacility(optGrid, facilityId, focusSelector = null) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid facility-grid";
  const facility = FACILITY_BY_ID.get(facilityId);
  if (!facility || !isFacilityOpen(state.feats, facilityId)) {
    const closed = document.createElement("p");
    closed.className = "submenu-description";
    closed.textContent = facility ? facility.lockedHint : "この施設はまだ開いていない。";
    optGrid.appendChild(closed);
    return;
  }

  const intro = document.createElement("p");
  intro.className = "facility-intro";
  intro.textContent = `${facility.openDescription}素材を渡すと、次の潜行から使えるものが増える。`;
  optGrid.appendChild(intro);

  listFacilityNodes(facilityId, getContext()).forEach(({ node, bought, blockReason, canBuy }) => {
    const card = createActionCard({
      name: bought ? `${node.name}（解放済み）` : node.name,
      description: node.description,
      cost: bought ? "次の潜行から使える" : formatCostLine(node.cost, blockReason),
      costClassName: !bought && blockReason ? "is-insufficient" : "",
      className: "facility-node",
      selected: bought,
      disabled: !canBuy,
      dataset: { facilityNodeId: node.id, facilityNodeBought: bought },
      onClick: () => {
        const purchase = purchaseFacilityNode(node.id, getContext());
        if (!purchase.ok) return;
        state.metaMaterials = purchase.metaMaterials;
        state.facilities = purchase.facilities;
        playSound("item");
        addLog(`${facility.name}で「${node.name}」を解放した。`);
        saveGame();
        renderFacility(optGrid, facilityId, `[data-facility-node-id="${node.id}"]`);
      }
    });
    optGrid.appendChild(card);
  });

  renderOrders(optGrid, facility);

  if (focusSelector) optGrid.querySelector?.(focusSelector)?.focus?.();
}

function formatYields(itemIds) {
  const counts = new Map();
  itemIds.forEach(itemId => counts.set(itemId, (counts.get(itemId) || 0) + 1));
  return [...counts.entries()]
    .map(([itemId, count]) => `${String(ITEMS[itemId]?.name || itemId).replace(/\s*[（(].*?[）)]/g, "")}×${count}`)
    .join("・");
}

// Orders (仕込み, #2014): pay now, receive the goods in storage at the next
// safe return. One open order per facility.
function renderOrders(optGrid, facility) {
  const orders = facility.orders || [];
  if (orders.length === 0) return;
  const heading = document.createElement("h3");
  heading.className = "feat-list-heading facility-orders-heading";
  heading.textContent = "仕込み";
  optGrid.appendChild(heading);

  const open = getOpenFacilityOrder(state.facilities, facility.id);
  if (open) {
    const status = document.createElement("p");
    status.className = "facility-order-open";
    status.setAttribute("data-facility-order-open", open.orderId);
    status.textContent = `仕込み中：${formatYields(open.items)}。次に生還した時に仕上がり、倉庫に入る。`;
    optGrid.appendChild(status);
    return;
  }
  orders.forEach(order => {
    const blockReason = getFacilityOrderBlockReason(order.id, getContext());
    const card = createActionCard({
      name: `${order.name}（${formatYields(order.yields)}）`,
      description: order.description,
      cost: formatCostLine(order.cost, blockReason),
      costClassName: blockReason ? "is-insufficient" : "",
      className: "facility-node facility-order",
      disabled: Boolean(blockReason),
      dataset: { facilityOrderId: order.id },
      onClick: () => {
        const placed = placeFacilityOrder(order.id, getContext());
        if (!placed.ok) return;
        state.metaMaterials = placed.metaMaterials;
        state.facilities = placed.facilities;
        playSound("item");
        addLog(`${facility.name}に「${order.name}」を頼んだ。次に生還した時に仕上がる。`);
        saveGame();
        renderFacility(optGrid, facility.id, "[data-facility-order-open]");
      }
    });
    optGrid.appendChild(card);
  });
}
