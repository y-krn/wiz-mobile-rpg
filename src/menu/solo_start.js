import { SOLO_CLASSES, addLog, createSoloCharacter, state } from "../state.js";
import { getClassJpName } from "../data.js";
import { ELITE_CLASSES } from "../data/classes.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import {
  applyWorkshopToCharacter,
  canAffordDepartureCraft,
  getAdditionalCraftableCount,
  getDepartureCraftBalance,
  getDepartureCraftCost,
  getDepartureCraftRecipes,
  getWorkshopGrants,
  purchaseDepartureCraft
} from "../systems/workshop.js";
import { CRAFT_RECIPES } from "../craft.js";
import { getSortedCraftRecipes } from "../rules/craft_rules.js";
import { MATERIAL_DROP_BALANCE, MATERIAL_TYPES } from "../data/materials.js";
import { getEquipmentSlotsForType } from "../rules/equipment_slots.js";

// 選択は階を選ぶまで確定しない。支払いは startRun で1回だけ。
let departureCraftQuantities = new Map();

function formatCraftPayment(payment) {
  const typed = Object.entries(payment?.typed || {})
    .map(([material, quantity]) => `${material}${quantity}`)
    .join("・");
  const any = payment?.any > 0
    ? `素材${payment.any}個（種別不問）`
    : "";
  return [typed, any].filter(Boolean).join("・") || "素材0個";
}

function getMaterialBalanceTotal(balance) {
  return Object.values(balance || {}).reduce(
    (sum, quantity) => sum + Math.max(0, Math.floor(Number(quantity) || 0)),
    0
  );
}

function formatCraftPaymentWithBalance(recipe, balance) {
  const payment = getDepartureCraftCost([recipe.resultId]);
  const typed = Object.entries(payment.typed || {})
    .map(([material, quantity]) => `${material} ${quantity}/${balance?.[material] || 0}`)
    .join("・");
  const any = payment.any > 0
    ? `素材${payment.any}個（種別不問）/残${getMaterialBalanceTotal(balance)}個`
    : "";
  return [typed, any].filter(Boolean).join("・") || "素材0個";
}

function startRun(className, startingGear = null, startFloor = 1) {
  clearDepartureStartFooter();
  const selectedRecipeIds = getSelectedRecipeIds();
  let departureCraft = [];
  if (selectedRecipeIds.length > 0) {
    const purchase = purchaseDepartureCraft(state.metaMaterials, selectedRecipeIds);
    if (purchase.ok) {
      state.metaMaterials = purchase.metaMaterials;
      departureCraft = purchase.recipeIds;
      addLog(
        `出発クラフト：${purchase.recipeIds.length}品を製作した（` +
        `${formatCraftPayment(purchase.payment)}）。`
      );
    } else {
      addLog("出発クラフトの素材が不足したため、何も持たずに出発する。");
    }
  }
  departureCraftQuantities = new Map();
  const character = applyWorkshopToCharacter(createSoloCharacter(className), state.workshop);
  if (startingGear) {
    const item = ITEMS[startingGear];
    const slot = getEquipmentSlotsForType(item?.type)[0]?.id;
    if (slot) character.equipment[slot] = startingGear;
  }
  state.party = [character];
  addLog(`${character.name}（${getClassJpName(className)}）が単独で潜行を開始する。`);
  executeEnterDungeon(startFloor, { departureCraft });
}

function getSelectedRecipeIds() {
  return [...departureCraftQuantities.entries()].flatMap(([recipeId, quantity]) =>
    Array.from({ length: quantity }, () => recipeId)
  );
}

function getDepartureCraftQuantity(recipeId) {
  return departureCraftQuantities.get(recipeId) || 0;
}

function changeDepartureCraftQuantity(optGrid, className, startingGear, recipeId, delta) {
  const current = getDepartureCraftQuantity(recipeId);
  const next = Math.max(0, current + delta);
  if (next === current) return;
  const candidateIds = getSelectedRecipeIds();
  if (delta > 0) candidateIds.push(recipeId);
  if (delta > 0 && !canAffordDepartureCraft(state.metaMaterials, candidateIds)) return;
  if (next === 0) {
    departureCraftQuantities.delete(recipeId);
  } else {
    departureCraftQuantities.set(recipeId, next);
  }
  renderStartFloorChoices(optGrid, className, startingGear);
}

function appendLabelledLines(button, title, detail, detailClass = "") {
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  if (detailClass) span.className = detailClass;
  span.textContent = detail;
  button.append(strong, span);
}

function clearDepartureStartFooter() {
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
}

function renderDepartureCraftOptions(optGrid, className, startingGear) {
  const summary = document.createElement("div");
  summary.className = "solo-start-craft-summary";
  summary.setAttribute("aria-live", "polite");
  const selectedRecipeIds = getSelectedRecipeIds();
  const selectedRecipes = getDepartureCraftRecipes(selectedRecipeIds);
  const selectedCost = getDepartureCraftCost(selectedRecipeIds);
  const summaryTitle = document.createElement("div");
  summaryTitle.className = "solo-start-craft-summary-title";
  summaryTitle.textContent = selectedRecipes.length > 0
    ? `出発クラフト ${selectedRecipes.length}品：${formatCraftPayment(selectedCost)}`
    : "出発クラフト 0品：何も持たずに出発可";
  summary.appendChild(summaryTitle);

  const selectedBalance = getDepartureCraftBalance(state.metaMaterials, selectedRecipeIds);
  const balances = document.createElement("div");
  balances.className = "solo-start-craft-balances";
  MATERIAL_TYPES.forEach(material => {
    const original = Math.max(0, Math.floor(Number(state.metaMaterials?.[material]) || 0));
    const remaining = Math.max(0, Math.floor(Number(selectedBalance?.[material]) || 0));
    if (remaining <= 0) return;
    const badge = document.createElement("span");
    badge.className = "solo-start-craft-balance";
    badge.dataset.material = material;
    badge.dataset.balance = String(remaining);
    badge.textContent = `${material} ${remaining}${remaining < original ? ` (-${original - remaining})` : ""}`;
    balances.appendChild(badge);
  });
  summary.appendChild(balances);
  optGrid.appendChild(summary);

  getSortedCraftRecipes(CRAFT_RECIPES).forEach(recipe => {
    const quantity = getDepartureCraftQuantity(recipe.resultId);
    const canAdd = canAffordDepartureCraft(state.metaMaterials, [
      ...selectedRecipeIds,
      recipe.resultId
    ]);
    const additionalCraftable = getAdditionalCraftableCount(
      state.metaMaterials,
      selectedRecipeIds,
      recipe.resultId
    );
    const stepper = document.createElement("div");
    stepper.className = "solo-start-craft-stepper";
    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.className = "btn solo-start-craft-decrement";
    decrement.dataset.craftRecipeId = recipe.resultId;
    decrement.setAttribute("aria-label", `${recipe.name}を1個減らす`);
    decrement.textContent = "−";
    decrement.disabled = quantity === 0;
    decrement.addEventListener("click", () => {
      changeDepartureCraftQuantity(optGrid, className, startingGear, recipe.resultId, -1);
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-block solo-start-craft-option${quantity > 0 ? " is-selected" : ""}`;
    button.dataset.recipeId = recipe.resultId;
    button.disabled = !canAdd;
    button.setAttribute("aria-pressed", String(quantity > 0));
    const availability = canAdd
      ? `あと${additionalCraftable}個`
      : "あと0個・素材不足";
    const payment = getDepartureCraftCost([recipe.resultId]);
    const hasEmptyMaterial = Object.keys(payment.typed || {}).some(
      material => (selectedBalance?.[material] || 0) <= 0
    ) || (payment.any > 0 && getMaterialBalanceTotal(selectedBalance) === 0);
    appendLabelledLines(
      button,
      `${recipe.name}：${quantity}個`,
      `${formatCraftPaymentWithBalance(recipe, selectedBalance)} ・ ${availability}`,
      `solo-start-craft-cost${hasEmptyMaterial ? " is-insufficient" : ""}`
    );
    button.addEventListener("click", () => {
      changeDepartureCraftQuantity(optGrid, className, startingGear, recipe.resultId, 1);
    });
    stepper.append(decrement, button);
    optGrid.appendChild(stepper);
  });
}

function renderStartFloorChoices(optGrid, className, startingGear) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-floor-grid";
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
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
    if (footer) footer.appendChild(button);
  });
}

export function renderSoloStart(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-grid";
  clearDepartureStartFooter();
  departureCraftQuantities = new Map();

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
