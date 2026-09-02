import { state, saveAutosave, addLog } from "../state.js";
import { WORKSHOP_CATEGORIES, WORKSHOP_NODES } from "../data/workshop.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getAffixDefinition } from "../data/affixes.js";
import { SPELLS } from "../data/spells.js";
import {
  getWorkshopNodeCost,
  getWorkshopRank,
  isWorkshopNodeUnlocked,
  purchaseWorkshopNode
} from "../systems/workshop.js";

function formatCost(cost) {
  return Object.entries(cost || {}).map(([name, quantity]) => `${name}×${quantity}`).join(" / ");
}

// pools/milestoneBuild/abyssBuild ノードは「抽選へ追加する」だけでは解放判断できない
// （#566）。affixIds/spellIds は参照先の実効果を引いて表示する。startingGear/stat/
// identifyPowder は node.description が既に効果そのものを述べているため素通しでよい。
function describeWorkshopNode(node) {
  const { affixIds, spellIds } = node.grants || {};
  if (affixIds) {
    return affixIds.map(id => {
      const def = getAffixDefinition(id);
      return def ? `${def.jpName}: ${def.desc}` : node.description;
    }).join(" / ");
  }
  if (spellIds) {
    return spellIds.map(id => {
      const spell = SPELLS[id];
      return spell ? `${spell.name}: ${spell.desc}` : node.description;
    }).join(" / ");
  }
  return node.description;
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
  optGrid.className = "submenu-grid workshop-grid";
  optGrid.innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "workshop-purpose";
  intro.dataset.workshopPurpose = "possibilities";
  intro.innerHTML = `
    <strong>次の潜行で試せる可能性を増やす場所</strong>
    <span>記録から候補を広げます。どれが最適かは、あなたの潜行で確かめてください。</span>
  `;
  optGrid.appendChild(intro);
  renderBalance(optGrid);
  Object.entries(WORKSHOP_CATEGORIES).forEach(([category, label]) => {
    const nodes = WORKSHOP_NODES.filter(node => (
      node.category === category && isWorkshopNodeUnlocked(node, state.keyItems)
    ));
    if (nodes.length === 0) return;
    const heading = document.createElement("h3");
    heading.className = "workshop-category";
    heading.textContent = label;
    optGrid.appendChild(heading);
    nodes.forEach(node => {
      const rank = getWorkshopRank(state.workshop, node.id);
      const lateralUnlocked = state.workshop?.lateralUnlocks?.includes(node.id);
      const maxRank = node.maxRank || 1;
      const cost = getWorkshopNodeCost(node, rank);
      const button = document.createElement("button");
      button.className = "btn btn-neon btn-block workshop-node";
      const status = lateralUnlocked ? "帰還記録から自動解禁" : cost ? formatCost(cost) : "習得済み";
      button.innerHTML = `<strong>${node.name} ${maxRank > 1 ? `${rank}/${maxRank}` : ""}</strong><span>${describeWorkshopNode(node)}</span><small>${status}</small>`;
      button.disabled = rank >= maxRank || lateralUnlocked;
      button.addEventListener("click", () => {
        const result = purchaseWorkshopNode(
          state.metaMaterials,
          state.workshop,
          node.id,
          state.keyItems
        );
        if (!result.ok) {
          const message = result.reason === "insufficient_materials"
            ? "工房: 素材が不足している。"
            : result.reason === "missing_key_item"
              ? "工房: 対応する印が必要だ。"
              : result.reason === "already_unlocked"
                ? "工房: 帰還記録からすでに解禁されている。"
              : "工房: これ以上習得できない。";
          addLog(message);
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
