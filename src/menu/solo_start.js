import { SOLO_CLASSES, addLog, createSoloCharacter, state } from "../state.js";
import { getClassJpName } from "../data.js";
import { ELITE_CLASSES } from "../data/classes.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import {
  applyWorkshopToCharacter,
  canAffordDepartureCraft,
  getDepartureCraftCost,
  getDepartureCraftRecipes,
  getWorkshopGrants,
  purchaseDepartureCraft
} from "../systems/workshop.js";
import { DEPARTURE_CRAFT_MAX_SLOTS } from "../data/workshop.js";
import { CRAFT_RECIPES } from "../craft.js";
import { MATERIAL_DROP_BALANCE } from "../data/materials.js";

// 選択は階を選ぶまで確定しない。支払いは startRun で1回だけ。
let departureCraftSelectedIds = new Set();

function formatCraftCost(cost) {
  return Object.entries(cost)
    .map(([material, quantity]) => `${material}${quantity}`)
    .join("・");
}

function startRun(className, startingGear = null, startFloor = 1) {
  const selectedRecipeIds = [...departureCraftSelectedIds];
  let departureCraft = [];
  if (selectedRecipeIds.length > 0) {
    const purchase = purchaseDepartureCraft(state.metaMaterials, selectedRecipeIds);
    if (purchase.ok) {
      state.metaMaterials = purchase.metaMaterials;
      departureCraft = purchase.recipeIds;
      addLog(`出発クラフト：${purchase.recipeIds.length}品を製作した（${formatCraftCost(purchase.cost)}）。`);
    } else {
      addLog("出発クラフトの素材が不足したため、何も持たずに出発する。");
    }
  }
  departureCraftSelectedIds = new Set();
  const character = applyWorkshopToCharacter(createSoloCharacter(className), state.workshop);
  if (startingGear) {
    const item = ITEMS[startingGear];
    if (item) character.equipment[item.type] = startingGear;
  }
  state.party = [character];
  addLog(`${character.name}（${getClassJpName(className)}）が単独で潜行を開始する。`);
  executeEnterDungeon(startFloor, { departureCraft });
}

function appendLabelledLines(button, title, detail) {
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  button.append(strong, span);
}

function renderDepartureCraftOptions(optGrid, className, startingGear) {
  const summary = document.createElement("div");
  summary.className = "solo-start-craft-summary";
  summary.setAttribute("aria-live", "polite");
  const selectedRecipes = getDepartureCraftRecipes([...departureCraftSelectedIds]);
  const selectedCost = getDepartureCraftCost([...departureCraftSelectedIds]);
  summary.textContent = selectedRecipes.length > 0
    ? `出発クラフト ${selectedRecipes.length}/${DEPARTURE_CRAFT_MAX_SLOTS}枠：${formatCraftCost(selectedCost)}`
    : `出発クラフト 0/${DEPARTURE_CRAFT_MAX_SLOTS}枠：何も持たずに出発可`;
  optGrid.appendChild(summary);

  CRAFT_RECIPES.forEach(recipe => {
    const selected = departureCraftSelectedIds.has(recipe.resultId);
    const candidateIds = selected
      ? [...departureCraftSelectedIds]
      : [...departureCraftSelectedIds, recipe.resultId];
    const canSelect = selected || canAffordDepartureCraft(state.metaMaterials, candidateIds);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-block solo-start-craft-option${selected ? " is-selected" : ""}`;
    button.dataset.recipeId = recipe.resultId;
    button.disabled = !selected && !canSelect;
    button.setAttribute("aria-pressed", String(selected));
    appendLabelledLines(
      button,
      `${recipe.name}：${selected ? "選択中" : canSelect ? "選択" : "素材不足"}`,
      `${formatCraftCost(recipe.mats)} ・ 1枠`
    );
    button.addEventListener("click", () => {
      if (departureCraftSelectedIds.has(recipe.resultId)) {
        departureCraftSelectedIds.delete(recipe.resultId);
      } else if (departureCraftSelectedIds.size < DEPARTURE_CRAFT_MAX_SLOTS) {
        departureCraftSelectedIds.add(recipe.resultId);
      }
      renderStartFloorChoices(optGrid, className, startingGear);
    });
    optGrid.appendChild(button);
  });
}

function renderStartFloorChoices(optGrid, className, startingGear) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-floor-grid";
  const changeClass = document.createElement("button");
  changeClass.type = "button";
  changeClass.className = "btn btn-block solo-start-change";
  changeClass.textContent = "クラスを選び直す";
  changeClass.addEventListener("click", () => renderSoloStart(optGrid));
  optGrid.appendChild(changeClass);

  renderDepartureCraftOptions(optGrid, className, startingGear);

  const floors = [1, ...(state.unlockedMilestones || [])];
  floors.forEach(floor => {
    const multiplier = floor === 1 ? 1 : MATERIAL_DROP_BALANCE.milestoneStartMultiplier;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-neon btn-block solo-start-floor-option";
    button.innerHTML = `<strong>B${floor}Fから開始</strong><span>素材収入 ${Math.round(multiplier * 100)}%</span>`;
    button.addEventListener("click", () => startRun(className, startingGear, floor));
    optGrid.appendChild(button);
  });
}

export function renderSoloStart(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-grid";
  departureCraftSelectedIds = new Set();

  SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className)).forEach(className => {
    const character = createSoloCharacter(className);
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block solo-class-option";
    button.innerHTML = `<strong>${getClassJpName(className)}</strong><span>HP ${character.maxHp} / MP ${character.maxMp}</span>`;
    button.addEventListener("click", () => renderStartFloorChoices(optGrid, className, null));
    optGrid.appendChild(button);

    getWorkshopGrants(state.workshop).startingGear.forEach(itemId => {
      const item = ITEMS[itemId];
      if (!item || (item.classes && !item.classes.includes(className))) return;
      const option = document.createElement("button");
      option.className = "btn btn-neon btn-block solo-class-option";
      option.innerHTML = `<strong>${getClassJpName(className)} + ${item.name}</strong><span>工房アンロック装備</span>`;
      option.addEventListener("click", () => renderStartFloorChoices(optGrid, className, itemId));
      optGrid.appendChild(option);
    });
  });
}
