import { state, saveAutosave, addLog } from "../state.js";
import { WORKSHOP_CATEGORIES, WORKSHOP_NODES } from "../data/workshop.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getAffixDefinition } from "../data/affixes.js";
import { SPELLS } from "../data/spells.js";
import {
  getWorkshopNodeCost,
  getWorkshopRank,
  isWorkshopNodeAvailableInVNext,
  isWorkshopNodeUnlocked,
  purchaseWorkshopNode
} from "../systems/workshop.js";

function isWorkshopVnextNode(node) {
  const grants = node.grants || {};
  return Boolean(grants.startingGear || grants.affixIds?.length || grants.spellIds?.length);
}

function formatCost(cost) {
  return Object.entries(cost || {}).map(([name, quantity]) => `${name} ${quantity}`).join("・");
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
  balance.setAttribute("aria-label", "手持ちの素材");
  const owned = MATERIAL_TYPES.filter(name => (state.metaMaterials?.[name] || 0) > 0);
  balance.textContent = owned.length > 0
    ? `手持ち: ${owned.map(name => `${name} ${state.metaMaterials[name]}`).join("・")}`
    : "素材を持っていない";
  container.appendChild(balance);
}

export function renderWorkshop(optGrid) {
  optGrid.className = "submenu-grid workshop-grid";
  optGrid.innerHTML = "";
  const intro = document.createElement("div");
  intro.className = "workshop-purpose";
  intro.dataset.workshopPurpose = "possibilities";
  const introTitle = document.createElement("strong");
  introTitle.textContent = "次の冒険で選べるものを増やす";
  const introText = document.createElement("span");
  introText.textContent = "素材を渡すと、開始武器や、迷宮で見つかる品の種類が増える。";
  intro.appendChild(introTitle);
  intro.appendChild(introText);
  optGrid.appendChild(intro);
  renderBalance(optGrid);
  Object.entries(WORKSHOP_CATEGORIES).forEach(([category, label]) => {
    const nodes = WORKSHOP_NODES.filter(node => (
      node.category === category
      && isWorkshopVnextNode(node)
      && isWorkshopNodeAvailableInVNext(node)
      && isWorkshopNodeUnlocked(node, state.keyItems)
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
      const status = lateralUnlocked ? "冒険の記録から選べるようになった" : cost ? formatCost(cost) : "解放済み";
      const nodeTitle = document.createElement("strong");
      nodeTitle.textContent = `${node.name} ${maxRank > 1 ? `${rank}/${maxRank}` : ""}`;
      const description = document.createElement("span");
      description.textContent = describeWorkshopNode(node);
      const statusText = document.createElement("small");
      statusText.textContent = status;
      button.appendChild(nodeTitle);
      button.appendChild(description);
      button.appendChild(statusText);
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
            ? "素材が足りない。"
            : result.reason === "missing_key_item"
              ? "守護者の印が要る。"
              : result.reason === "already_unlocked"
                ? "冒険の記録から、すでに選べるようになっている。"
              : "これはもう解放してある。";
          addLog(message);
          return;
        }
        state.metaMaterials = result.metaMaterials;
        state.workshop = result.workshop;
        addLog(`工房で「${node.name}」を解放した。`);
        saveAutosave();
        renderWorkshop(optGrid);
      });
      optGrid.appendChild(button);
    });
  });
}
