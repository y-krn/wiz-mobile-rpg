import { state } from "../state.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getBankedMaterials } from "../rules/material_rules.js";
import { getItemBaseId } from "../data.js";

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

export function getUnusedDepartureItemCount(run = state.currentRun, inventory = state.inventory) {
  const remaining = new Map();
  (Array.isArray(inventory) ? inventory : []).forEach(item => {
    const id = getItemBaseId(item);
    if (id) remaining.set(id, (remaining.get(id) || 0) + 1);
  });
  let count = 0;
  (Array.isArray(run?.townInventory) ? run.townInventory : []).forEach(item => {
    const id = getItemBaseId(item);
    const available = remaining.get(id) || 0;
    if (id && available > 0) {
      count += 1;
      remaining.set(id, available - 1);
    }
  });
  return count;
}

export function createRunStakesSummary(runMaterials = state.currentRun?.materials) {
  const { currentTotal, deathLoss } = getRunMaterialStake(runMaterials);
  const unusedItems = getUnusedDepartureItemCount();

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
  summary.append(title, flow);
  return summary;
}
