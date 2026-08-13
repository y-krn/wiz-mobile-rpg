import { state } from "../state.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getBankedMaterials } from "../rules/material_rules.js";

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

export function createRunStakesSummary(runMaterials = state.currentRun?.materials) {
  const { currentTotal, deathLoss } = getRunMaterialStake(runMaterials);

  const summary = document.createElement("section");
  summary.className = "run-stakes-summary";
  summary.setAttribute("aria-label", "潜行中の素材の持ち帰り情報");

  const title = document.createElement("div");
  title.className = "run-stakes-title";
  title.append("今回の素材 ");
  const current = document.createElement("strong");
  current.textContent = `${currentTotal}個`;
  title.appendChild(current);

  const flow = document.createElement("div");
  flow.className = "run-stakes-flow";

  const retreat = document.createElement("div");
  const retreatLabel = document.createElement("span");
  retreatLabel.textContent = "持ち帰れば";
  const retreatValue = document.createElement("strong");
  retreatValue.textContent = `${currentTotal}個`;
  retreat.append(retreatLabel, retreatValue);

  const death = document.createElement("div");
  const deathLabel = document.createElement("span");
  deathLabel.textContent = "死ねば";
  const deathValue = document.createElement("strong");
  deathValue.textContent = `${deathLoss}個失う`;
  death.append(deathLabel, deathValue);

  flow.append(retreat, death);
  summary.append(title, flow);
  return summary;
}
