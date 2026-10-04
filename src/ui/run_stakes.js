import { state } from "../state.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getBankedMaterials } from "../rules/material_rules.js";
import { getItemBaseId } from "../data.js";
import { getItemData } from "../rules/item_rules.js";

function getMaterialQuantity(materials, name) {
  return Math.max(0, Math.floor(Number(materials?.[name]) || 0));
}

function getMaterialTotal(materials) {
  return MATERIAL_TYPES.reduce(
    (total, name) => total + getMaterialQuantity(materials, name),
    0
  );
}

export function getRunMaterialStake(runMaterials = state.currentRun?.materials) {
  const materials = runMaterials || {};
  const currentTotal = getMaterialTotal(materials);
  const deathBanked = getBankedMaterials(materials, "death");
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
  summary.append(title, flow);
  return summary;
}
