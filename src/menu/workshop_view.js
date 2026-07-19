import { state, saveAutosave, addLog } from "../state.js";
import { WORKSHOP_CATEGORIES, WORKSHOP_NODES } from "../data/workshop.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getWorkshopNodeCost, getWorkshopRank, purchaseWorkshopNode } from "../systems/workshop.js";

function formatCost(cost) {
  return Object.entries(cost || {}).map(([name, quantity]) => `${name}×${quantity}`).join(" / ");
}

function renderBalance(container) {
  const balance = document.createElement("div");
  balance.className = "materials-hud";
  balance.setAttribute("aria-label", "素材残高");
  const owned = MATERIAL_TYPES.filter(name => (state.metaMaterials?.[name] || 0) > 0);
  balance.textContent = owned.length > 0
    ? owned.map(name => `${name}:${state.metaMaterials[name]}`).join(" / ")
    : "素材なし";
  container.appendChild(balance);
}

export function renderWorkshop(optGrid) {
  optGrid.innerHTML = "";
  optGrid.classList.add("workshop-grid");
  renderBalance(optGrid);
  Object.entries(WORKSHOP_CATEGORIES).forEach(([category, label]) => {
    const nodes = WORKSHOP_NODES.filter(node => node.category === category);
    if (nodes.length === 0) return;
    const heading = document.createElement("h3");
    heading.className = "workshop-category";
    heading.textContent = label;
    optGrid.appendChild(heading);
    nodes.forEach(node => {
      const rank = getWorkshopRank(state.workshop, node.id);
      const maxRank = node.maxRank || 1;
      const cost = getWorkshopNodeCost(node, rank);
      const button = document.createElement("button");
      button.className = "btn btn-neon btn-block workshop-node";
      button.innerHTML = `<strong>${node.name} ${maxRank > 1 ? `${rank}/${maxRank}` : ""}</strong><span>${node.description}</span><small>${cost ? formatCost(cost) : "習得済み"}</small>`;
      button.disabled = rank >= maxRank;
      button.addEventListener("click", () => {
        const result = purchaseWorkshopNode(state.metaMaterials, state.workshop, node.id);
        if (!result.ok) {
          addLog(result.reason === "insufficient_materials" ? "工房: 素材が不足している。" : "工房: これ以上習得できない。");
          return;
        }
        state.metaMaterials = result.metaMaterials;
        state.workshop = result.workshop;
        addLog(`工房: ${node.name}を解放した。`);
        saveAutosave();
        renderWorkshop(optGrid);
      });
      optGrid.appendChild(button);
    });
  });
}
