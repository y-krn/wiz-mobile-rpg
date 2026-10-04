// A town facility's screen (#2009): what its keeper offers, each offer's
// condition and cost, and what was already opened.

import { state, addLog, saveGame } from "../state.js";
import { playSound } from "../audio.js";
import { FACILITY_BY_ID } from "../data/facilities.js";
import { isFacilityOpen, listFacilityNodes, purchaseFacilityNode } from "../systems/facilities.js";
import { createActionCard } from "./action_card.js";

function formatCostWithBalance(cost) {
  return Object.entries(cost || {})
    .map(([name, quantity]) => `${name} ${quantity}（所持${Math.max(0, Math.floor(Number(state.metaMaterials?.[name]) || 0))}）`)
    .join("・") || "素材0個";
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
      cost: bought ? "次の潜行から使える" : `${formatCostWithBalance(node.cost)}${blockReason ? `／${blockReason}` : ""}`,
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

  if (focusSelector) optGrid.querySelector?.(focusSelector)?.focus?.();
}
