import { STARTING_KITS, addLog, createStartingKitCharacter, getStartingKit, state, INVENTORY_CAPACITY } from "../state.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import { getCharMaxMp } from "../data.js";
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
import { getEquipmentHandConflict } from "../rules/equipment_hands.js";
import {
  consumeSelectedRunQuestTemplateIds,
  getPendingRunQuestTemplateIds
} from "./run_quest_board.js";
import { createActionCard } from "./action_card.js";
import { RUN_QUEST_TEMPLATES } from "../data/run_quests.js";
import { getFloorTheme } from "../data/floor_themes.js";
import { isMedium, syncMediumState } from "../rules/magic_rules.js";

// 選択は階を選ぶまで確定しない。支払いは startRun で1回だけ。
let departureCraftQuantities = new Map();
let selectedStartFloor = null;
const DEPARTURE_BAG_CAPACITY = INVENTORY_CAPACITY;
const DEPARTURE_ITEM_LIMITS = Object.freeze({ TOWN_PORTAL: 1 });

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

function startRun(startingKitId, startingGear = null, startFloor = 1) {
  const kit = getStartingKit(startingKitId);
  const character = applyWorkshopToCharacter(createStartingKitCharacter(startingKitId), state.workshop);
  const item = ITEMS[startingGear];
  const slot = getEquipmentSlotsForType(item?.type)[0]?.id;
  const handConflict = slot ? getEquipmentHandConflict(character, startingGear, slot) : null;
  if (handConflict) {
    addLog(`[開始不可] ${handConflict.message}`);
    return;
  }
  clearDepartureStartFooter();
  const runQuestTemplateIds = consumeSelectedRunQuestTemplateIds();
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
  if (startingGear) {
    if (slot) {
      const preserveRunes = startingKitId === "arcana" && isMedium(startingGear);
      character.equipment[slot] = startingGear;
      syncMediumState(character, { preserveRunes });
    }
  }
  state.party = [character];
  addLog(`${kit.name}で単独潜行を開始する。`);
  executeEnterDungeon(startFloor, { departureCraft, runQuestTemplateIds });
}

function getSelectedRecipeIds() {
  return [...departureCraftQuantities.entries()].flatMap(([recipeId, quantity]) =>
    Array.from({ length: quantity }, () => recipeId)
  );
}

function getSelectedBagItems(recipeIds = getSelectedRecipeIds()) {
  const fixedItems = getWorkshopGrants(state.workshop).returnItems || [];
  const craftedItems = getDepartureCraftRecipes(recipeIds)
    .filter(recipe => !recipe.identifyPowder)
    .map(recipe => recipe.resultId);
  return [...fixedItems, ...craftedItems];
}

function getCraftSelectionBlockReason(recipe, selectedRecipeIds) {
  const selectedItems = getSelectedBagItems(selectedRecipeIds);
  if (!recipe.identifyPowder && selectedItems.length >= DEPARTURE_BAG_CAPACITY) {
    return "バッグ上限（20枠）";
  }
  const itemLimit = DEPARTURE_ITEM_LIMITS[recipe.resultId];
  if (itemLimit && selectedItems.filter(itemId => itemId === recipe.resultId).length >= itemLimit) {
    return "帰還の翼は1個まで";
  }
  if (!canAffordDepartureCraft(state.metaMaterials, [...selectedRecipeIds, recipe.resultId])) {
    return "素材不足";
  }
  return "";
}

function getCraftAvailability(recipe, selectedRecipeIds) {
  const reason = getCraftSelectionBlockReason(recipe, selectedRecipeIds);
  if (reason) return `あと0個・${reason}`;
  const availableSlots = recipe.identifyPowder
    ? Infinity
    : DEPARTURE_BAG_CAPACITY - getSelectedBagItems(selectedRecipeIds).length;
  const additional = getAdditionalCraftableCount(
    state.metaMaterials,
    selectedRecipeIds,
    recipe.resultId,
    Number.isFinite(availableSlots) ? availableSlots : 99
  );
  return `あと${Math.min(additional, DEPARTURE_ITEM_LIMITS[recipe.resultId] || additional)}個`;
}

function getFloorBand(floor) {
  if (floor === 1) return "浅層";
  if (floor >= 15) return "深層";
  return "中層";
}

function getShortItemName(itemId) {
  const name = ITEMS[itemId]?.name || itemId;
  return name.replace(/\s*[（(].*?[）)]/g, "").replace("帰還の翼", "翼");
}

function appendPreparationRow(container, label, value, className = "") {
  const row = document.createElement("div");
  row.className = `solo-preparation-row${className ? ` ${className}` : ""}`;
  const rowLabel = document.createElement("span");
  rowLabel.textContent = label;
  const rowValue = document.createElement("strong");
  rowValue.textContent = value;
  row.append(rowLabel, rowValue);
  container.appendChild(row);
}

function renderPreparationSummary(optGrid, startingKitId, startingGear) {
  const selectedRecipeIds = getSelectedRecipeIds();
  const selectedItems = getSelectedBagItems(selectedRecipeIds);
  const craftedItemCount = selectedRecipeIds.filter(recipeId => (
    !getDepartureCraftRecipes([recipeId])[0]?.identifyPowder
  )).length;
  const summary = document.createElement("section");
  summary.className = "solo-start-craft-summary solo-preparation-summary";
  summary.setAttribute("aria-label", "今回の出発条件");
  summary.setAttribute("aria-live", "polite");

  const heading = document.createElement("div");
  heading.className = "solo-preparation-heading";
  const title = document.createElement("strong");
  title.textContent = "今回の出発条件";
  const count = document.createElement("span");
  count.className = "solo-start-craft-summary-title";
  count.textContent = `持ち込み ${selectedItems.length}/${DEPARTURE_BAG_CAPACITY}（出発クラフト ${craftedItemCount}品）`;
  heading.append(title, count);
  summary.appendChild(heading);

  const slotNote = document.createElement("div");
  slotNote.className = "solo-preparation-slot-note";
  slotNote.textContent = `空き ${DEPARTURE_BAG_CAPACITY - selectedItems.length}枠：戦果を持ち帰る余地`;
  summary.appendChild(slotNote);

  const slots = document.createElement("div");
  slots.className = "solo-preparation-slots";
  slots.setAttribute("aria-label", `持ち込みバッグ ${selectedItems.length}/${DEPARTURE_BAG_CAPACITY}`);
  for (let index = 0; index < DEPARTURE_BAG_CAPACITY; index += 1) {
    const slot = document.createElement("span");
    const itemId = selectedItems[index];
    slot.className = `solo-preparation-slot${itemId ? " is-filled" : " is-open"}`;
    slot.dataset.slotIndex = String(index + 1);
    slot.textContent = itemId ? getShortItemName(itemId) : "空き";
    slot.setAttribute("aria-label", itemId
      ? `${index + 1}枠目：${ITEMS[itemId]?.name || itemId}`
      : `${index + 1}枠目：戦果を持ち帰る余地`);
    slots.appendChild(slot);
  }
  summary.appendChild(slots);

  const conditions = document.createElement("div");
  conditions.className = "solo-preparation-conditions";
  appendPreparationRow(conditions, "開始キット", getStartingKit(startingKitId)?.name || "—");
  appendPreparationRow(
    conditions,
    "開始装備",
    startingGear ? `${ITEMS[startingGear]?.name || startingGear}（バッグ外）` : "なし（バッグ外）",
    "solo-preparation-equipment"
  );
  const pendingQuestIds = getPendingRunQuestTemplateIds();
  const questNames = pendingQuestIds
    .map(id => RUN_QUEST_TEMPLATES.find(template => template.id === id)?.name)
    .filter(Boolean);
  appendPreparationRow(conditions, "選択依頼", questNames.length > 0 ? questNames.join("・") : "自動で1〜2件");
  const startFloorLabel = selectedStartFloor === null
    ? "未選択"
    : `B${selectedStartFloor}F・${getFloorBand(selectedStartFloor)}（${getFloorTheme(selectedStartFloor).name}）`;
  appendPreparationRow(conditions, "開始階", startFloorLabel);
  summary.appendChild(conditions);

  optGrid.appendChild(summary);
}

function getDepartureCraftQuantity(recipeId) {
  return departureCraftQuantities.get(recipeId) || 0;
}

function changeDepartureCraftQuantity(optGrid, startingKitId, startingGear, recipeId, delta) {
  const current = getDepartureCraftQuantity(recipeId);
  const next = Math.max(0, current + delta);
  if (next === current) return;
  if (delta > 0) {
    const recipe = CRAFT_RECIPES.find(candidate => candidate.resultId === recipeId);
    if (!recipe || getCraftSelectionBlockReason(recipe, getSelectedRecipeIds())) return;
  }
  if (next === 0) {
    departureCraftQuantities.delete(recipeId);
  } else {
    departureCraftQuantities.set(recipeId, next);
  }
  renderStartFloorChoices(optGrid, startingKitId, startingGear);
}

function clearDepartureStartFooter() {
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
}

function renderDepartureCraftOptions(optGrid, startingKitId, startingGear) {
  const selectedRecipeIds = getSelectedRecipeIds();
  renderPreparationSummary(optGrid, startingKitId, startingGear);
  const selectedCost = getDepartureCraftCost(selectedRecipeIds);
  const selectedBalance = getDepartureCraftBalance(state.metaMaterials, selectedRecipeIds);
  const summary = optGrid.querySelector(".solo-preparation-summary");
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
  balances.setAttribute("aria-label", `クラフト後の残素材：${formatCraftPayment(selectedCost)}`);
  summary.appendChild(balances);

  const craftHeading = document.createElement("h3");
  craftHeading.className = "solo-preparation-section-heading";
  craftHeading.textContent = "持ち込む道具を選ぶ";
  optGrid.appendChild(craftHeading);

  getSortedCraftRecipes(CRAFT_RECIPES).forEach(recipe => {
    const quantity = getDepartureCraftQuantity(recipe.resultId);
    const availability = getCraftAvailability(recipe, selectedRecipeIds);
    const canAdd = !getCraftSelectionBlockReason(recipe, selectedRecipeIds);
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
      changeDepartureCraftQuantity(optGrid, startingKitId, startingGear, recipe.resultId, -1);
    });

    const payment = getDepartureCraftCost([recipe.resultId]);
    const hasEmptyMaterial = Object.keys(payment.typed || {}).some(
      material => (selectedBalance?.[material] || 0) <= 0
    ) || (payment.any > 0 && getMaterialBalanceTotal(selectedBalance) === 0);
    const button = createActionCard({
      name: `${recipe.name}：${quantity}個`,
      description: recipe.desc,
      cost: `${formatCraftPaymentWithBalance(recipe, selectedBalance)} ・ ${availability}`,
      costClassName: `solo-start-craft-cost${hasEmptyMaterial ? " is-insufficient" : ""}`,
      className: "solo-start-craft-option",
      selected: quantity > 0,
      disabled: !canAdd,
      ariaPressed: quantity > 0,
      dataset: { recipeId: recipe.resultId },
      onClick: () => {
        changeDepartureCraftQuantity(optGrid, startingKitId, startingGear, recipe.resultId, 1);
      }
    });
    stepper.append(decrement, button);
    optGrid.appendChild(stepper);
  });
}

function renderStartFloorChoices(optGrid, startingKitId, startingGear) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-floor-grid";
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
  const changeKit = document.createElement("button");
  changeKit.type = "button";
  changeKit.className = "btn btn-block solo-start-change";
  changeKit.textContent = "開始キットを選び直す";
  changeKit.addEventListener("click", () => renderSoloStart(optGrid));
  optGrid.appendChild(changeKit);

  renderDepartureCraftOptions(optGrid, startingKitId, startingGear);

  const floorHeading = document.createElement("div");
  floorHeading.className = "solo-start-floor-heading";
  floorHeading.innerHTML = "<strong>開始階を選ぶ</strong><span>深度帯を主情報に、素材倍率は補足表示</span>";
  if (footer) footer.appendChild(floorHeading);

  const floors = [1, ...(state.unlockedMilestones || [])];
  floors.forEach(floor => {
    const multiplier = floor === 1 ? 1 : MATERIAL_DROP_BALANCE.milestoneStartMultiplier;
    const theme = getFloorTheme(floor);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-neon btn-block solo-start-floor-option${selectedStartFloor === floor ? " is-selected" : ""}`;
    button.innerHTML = `<strong>B${floor}Fから開始 · ${getFloorBand(floor)}</strong><span>${theme.name} / 素材収入 ${Math.round(multiplier * 100)}%</span>`;
    button.dataset.startFloor = String(floor);
    button.setAttribute("aria-pressed", String(selectedStartFloor === floor));
    button.addEventListener("click", () => {
      selectedStartFloor = floor;
      renderStartFloorChoices(optGrid, startingKitId, startingGear);
    });
    if (footer) footer.appendChild(button);
  });

  const startButton = document.createElement("button");
  startButton.id = "btn-departure-start";
  startButton.type = "button";
  startButton.className = "btn btn-neon btn-block solo-start-confirm";
  startButton.textContent = "迷宮へ向かう";
  startButton.disabled = selectedStartFloor === null;
  startButton.addEventListener("click", () => {
    if (selectedStartFloor !== null) startRun(startingKitId, startingGear, selectedStartFloor);
  });
  if (footer) footer.appendChild(startButton);
}

export function renderSoloStart(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-grid";
  clearDepartureStartFooter();
  departureCraftQuantities = new Map();
  selectedStartFloor = null;

  STARTING_KITS.forEach(kit => {
    const character = createStartingKitCharacter(kit.id);
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block solo-starting-kit-option";
    button.innerHTML = `<strong>${kit.name}</strong><span>${kit.description} · HP ${character.maxHp} / MP ${getCharMaxMp(character)}</span>`;
    button.addEventListener("click", () => renderStartFloorChoices(optGrid, kit.id, null));
    optGrid.appendChild(button);

    getWorkshopGrants(state.workshop).startingGear.forEach(itemId => {
      const item = ITEMS[itemId];
      if (!item) return;
      const option = document.createElement("button");
      option.className = "btn btn-neon btn-block solo-starting-kit-option";
      const conflict = getEquipmentHandConflict(
        createStartingKitCharacter(kit.id),
        itemId,
        getEquipmentSlotsForType(item.type)[0]?.id
      );
      option.disabled = Boolean(conflict);
      option.title = conflict?.message || "";
      option.innerHTML = conflict
        ? `<strong>${kit.name} + ${item.name}</strong><span>選択不可：${conflict.message}</span>`
        : `<strong>${kit.name} + ${item.name}</strong><span>工房アンロック装備</span>`;
      if (!conflict) option.addEventListener("click", () => renderStartFloorChoices(optGrid, kit.id, itemId));
      optGrid.appendChild(option);
    });
  });
}
