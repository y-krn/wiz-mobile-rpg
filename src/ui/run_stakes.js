import { state } from "../state.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getBankedMaterials } from "../rules/material_rules.js";
import { getItemBaseId } from "../data.js";
import { getItemData } from "../rules/item_rules.js";
import { getEscortNames } from "../systems/facilities.js";

function getMaterialQuantity(materials, name) {
  return Math.max(0, Math.floor(Number(materials?.[name]) || 0));
}

function getMaterialTotal(materials) {
  return MATERIAL_TYPES.reduce(
    (total, name) => total + getMaterialQuantity(materials, name),
    0
  );
}

export function getRunMaterialStake(runMaterials = state.currentRun?.materials, oath = state.currentRun?.oath === true) {
  const materials = runMaterials || {};
  const currentTotal = getMaterialTotal(materials);
  // Under an oath (#2021) a death banks nothing.
  const deathBanked = oath ? {} : getBankedMaterials(materials, "death");
  const deathLoss = MATERIAL_TYPES.reduce(
    (total, name) => total + Math.max(0, getMaterialQuantity(materials, name) - getMaterialQuantity(deathBanked, name)),
    0
  );

  return { currentTotal, deathLoss };
}

function getUnusedDepartureItems(run, inventory, excludedInventoryIndex) {
  const remaining = new Map();
  (Array.isArray(inventory) ? inventory : []).forEach((item, index) => {
    if (index === excludedInventoryIndex) return;
    const id = getItemBaseId(item);
    if (id) remaining.set(id, (remaining.get(id) || 0) + 1);
  });
  const unusedItems = [];
  (Array.isArray(run?.departureCraftItems) ? run.departureCraftItems : [])
    .filter(item => getItemData(item)?.type === "usable")
    .forEach(item => {
      const id = getItemBaseId(item);
      const available = remaining.get(id) || 0;
      if (id && available > 0) {
        unusedItems.push(item);
        remaining.set(id, available - 1);
      }
    });
  return unusedItems;
}

export function getUnusedDepartureItemCount(
  run = state.currentRun,
  inventory = state.inventory,
  excludedInventoryIndex = null
) {
  return getUnusedDepartureItems(run, inventory, excludedInventoryIndex).length;
}

function getDepartureItemReturnSummary(run, inventory, excludedInventoryIndex) {
  const count = getUnusedDepartureItemCount(run, inventory, excludedInventoryIndex);
  const storageMax = Number.isFinite(state.storageMax) ? Math.max(0, Math.floor(state.storageMax)) : 30;
  const storageSlots = Math.max(0, storageMax - (Array.isArray(state.storage) ? state.storage.length : 0));
  const returnableCount = Math.min(count, storageSlots);
  return { count, overflowCount: count - returnableCount };
}

export function createRunStakesSummary(
  runMaterials = state.currentRun?.materials,
  { excludedInventoryIndex = null } = {}
) {
  const { currentTotal, deathLoss } = getRunMaterialStake(runMaterials);
  const { count: unusedItems, overflowCount } = getDepartureItemReturnSummary(
    state.currentRun,
    state.inventory,
    excludedInventoryIndex
  );

  const summary = document.createElement("section");
  summary.className = "run-stakes-summary";
  summary.setAttribute("aria-label", "潜行中の素材と持ち込み品の賭け金");

  const title = document.createElement("div");
  title.className = "run-stakes-title";
  title.append("今回の賭け金 ");
  const current = document.createElement("strong");
  current.textContent = `素材 ${currentTotal}個・未使用品 ${unusedItems}個`;
  title.appendChild(current);

  const flow = document.createElement("div");
  flow.className = "run-stakes-flow";

  const retreat = document.createElement("div");
  const retreatLabel = document.createElement("span");
  retreatLabel.textContent = "生還すれば持ち帰る";
  const retreatValue = document.createElement("strong");
  retreatValue.textContent = `素材 ${currentTotal}個・未使用品 ${unusedItems}個`;
  retreat.append(retreatLabel, retreatValue);

  const death = document.createElement("div");
  const deathLabel = document.createElement("span");
  deathLabel.textContent = "死ねば・断念すれば失う";
  const deathValue = document.createElement("strong");
  deathValue.textContent = `素材 ${deathLoss}個・未使用品 ${unusedItems}個`;
  death.append(deathLabel, deathValue);

  flow.append(retreat, death);
  if (overflowCount > 0) {
    const overflow = document.createElement("p");
    overflow.className = "run-stakes-overflow";
    overflow.textContent = `倉庫満杯のため未使用品 ${overflowCount}個は戻らない`;
    flow.appendChild(overflow);
  }
  const escortNames = getEscortNames(state.currentRun);
  if (escortNames) {
    const companionLine = document.createElement("p");
    companionLine.className = "run-stakes-companion";
    companionLine.textContent = `同行：${escortNames}。生還すれば街へ連れ帰る。死ねば・断念すれば連れ帰れない。`;
    flow.appendChild(companionLine);
  }
  if (state.currentRun?.oath === true) {
    const oathLine = document.createElement("p");
    oathLine.className = "run-stakes-companion run-stakes-oath";
    oathLine.textContent = "誓約中：死ねば・断念すれば、手持ちの素材は1つも街に残らない。";
    flow.appendChild(oathLine);
  }
  // A chapel offering already sent these home (#2018): they are not at stake.
  const offered = Object.values(state.currentRun?.offeredMaterials || {})
    .reduce((sum, quantity) => sum + (Math.floor(Number(quantity)) || 0), 0);
  if (offered > 0) {
    const offeredLine = document.createElement("p");
    offeredLine.className = "run-stakes-companion run-stakes-offered";
    offeredLine.textContent = `献灯で送った素材 ${offered}個は確定。死んでも街に届く。`;
    flow.appendChild(offeredLine);
  }
  const fragments = Math.max(0, Math.floor(Number(state.currentRun?.guideFragments) || 0));
  if (fragments > 0) {
    const fragmentLine = document.createElement("p");
    fragmentLine.className = "run-stakes-companion run-stakes-fragments";
    fragmentLine.textContent = `手引き書の断片 ${fragments}枚。生還すれば持ち帰る。死ねば・断念すれば失う。`;
    flow.appendChild(fragmentLine);
  }
  summary.append(title, flow);
  return summary;
}
