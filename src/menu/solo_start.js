import { addLog, getStartingKit, getStartingKitItems, state } from "../state.js";
import { executeEnterDungeon } from "../movement.js";
import { ITEMS } from "../data/items.js";
import { getCharMaxMp } from "../data.js";
import {
  getAdditionalCraftableCount,
  getDepartureCraftBalance,
  getDepartureCraftCost,
  getDepartureCraftRecipes,
  purchaseDepartureCraft
} from "../systems/workshop.js";
import {
  DEPARTURE_BAG_CAPACITY,
  DEPARTURE_ITEM_LIMITS,
  createDepartureCharacter as buildDepartureCharacter,
  describeDroppedPreparation,
  getCraftSelectionBlockReason as getSelectionBlockReason,
  getAvailableStartingKits,
  getDepartureBagItems,
  getStartingGearName,
  isStartingKitAvailable,
  getStartingGearOptions as listStartingGearOptions,
  resolveLastPreparation
} from "../systems/departure_preparation.js";
import { normalizeLastPreparation } from "../state/last_preparation.js";
import { formatFeatProgress, getNearestFeats } from "../systems/feats.js";
import { CRAFT_RECIPES } from "../craft.js";
import { getSortedCraftRecipes } from "../rules/craft_rules.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getEquipmentLoadPlayerCopy } from "../rules/equipment_load.js";
import { createActionCard } from "./action_card.js";
import { DUNGEON_FLOOR_COUNT } from "../data/dungeons.js";
import { getDungeonEntryFloor, getDungeonForFloor } from "../rules/dungeons.js";
import { getDungeonOpener, listDungeons } from "../systems/dungeon_progress.js";
import {
  canPinCoreFamily,
  getDrawableCoreFamilyIds,
  getLikelyCoreFamilies,
  pinCoreFamilyForDungeon
} from "../systems/core_families.js";
import { formatCoreFamilies, getCoreFamily } from "../rules/core_families.js";
import {
  getActiveRuneSpellKeys,
  getEquippedMedium,
  getRuneItemId
} from "../rules/magic_rules.js";
import { restoreFocusAfterRender } from "../ui/focus_manager.js";
import { getStartingKitCopy } from "../data/starting_kit_copy.js";
import { TECHNIQUE_BY_PROFILE } from "../data/techniques.js";
import { getWeaponBehaviorProfile } from "../data/weapon_behavior_profiles.js";
import { getCharDerivedStats } from "../rules/character_stats.js";

// 選択は階を選ぶまで確定しない。支払いは startRun で1回だけ。
let departureCraftQuantities = new Map();
let selectedStartFloor = null;
// Kit selection is a two-step choice: pick a kit to read its details, then
// confirm. The picked kit and weapon swap survive "choose again".
let selectedKitId = null;
let selectedStartingGear = null;
// Choices of the previous preparation that cannot be made right now. Shown
// once on the preparation screen so nothing is dropped silently (#2002).
let droppedPreparationLines = [];

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

function getStoredCraftCount(itemId) {
  return state.storage.filter(item => (typeof item === "string" ? item : item?.baseId) === itemId).length;
}

function formatCraftPaymentWithBalance(recipe, balance, selectedRecipeIds) {
  const selectedFromStorage = selectedRecipeIds.filter(id => id === recipe.resultId).length;
  if (getStoredCraftCount(recipe.resultId) > selectedFromStorage) {
    return `倉庫在庫${getStoredCraftCount(recipe.resultId) - selectedFromStorage}個・次の1個は在庫使用`;
  }
  const payment = getDepartureCraftCost([recipe.resultId]);
  const typed = Object.entries(payment.typed || {})
    .map(([material, quantity]) => `${material} ${quantity}/${balance?.[material] || 0}`)
    .join("・");
  const any = payment.any > 0
    ? `素材${payment.any}個（種別不問）/残${getMaterialBalanceTotal(balance)}個`
    : "";
  const materialCost = [typed, any].filter(Boolean).join("・") || "素材0個";
  return `倉庫0個・${materialCost}`;
}

function createDepartureCharacter(startingKitId, startingGear = null) {
  return buildDepartureCharacter(startingKitId, startingGear, state.workshop);
}

// Every departure goes through here: the preparation screen and the repeat
// departure from the result screen pay and start by the same steps.
function launchRun(startingKitId, startingGear, startFloor, selectedRecipeIds) {
  const kit = getStartingKit(startingKitId);
  if (!kit || !isStartingKitAvailable(startingKitId, state.facilities)) return false;
  const { character, handConflict } = createDepartureCharacter(startingKitId, startingGear);
  if (handConflict) {
    addLog(handConflict.message);
    return false;
  }
  clearDepartureStartFooter();
  let departureCraft = [];
  if (selectedRecipeIds.length > 0) {
    const purchase = purchaseDepartureCraft(state.metaMaterials, selectedRecipeIds, state.storage);
    if (purchase.ok) {
      state.metaMaterials = purchase.metaMaterials;
      state.storage = purchase.storage;
      departureCraft = purchase.recipeIds;
      addLog(
        `出発前に${purchase.recipeIds.length}品を作った（` +
        `${formatCraftPayment(purchase.payment)}）。`
      );
    } else {
      addLog("素材が足りず、何も作らずに出発する。");
    }
  }
  state.lastPreparation = normalizeLastPreparation({
    kitId: startingKitId,
    startingGear,
    recipeIds: departureCraft,
    startFloor
  });
  departureCraftQuantities = new Map();
  droppedPreparationLines = [];
  state.party = [character];
  addLog(`${kit.name}で、ひとり迷宮へ向かう。`);
  executeEnterDungeon(startFloor, { departureCraft });
  return true;
}

function startRun(startingKitId, startingGear = null, startFloor = 1) {
  // The first call synchronously replaces the preparation surface with the
  // exploration surface. Replayed events from the old button must not start
  // another run or charge its preparation choices twice.
  if (state.gameState !== "submenu") return false;
  return launchRun(startingKitId, startingGear, startFloor, getSelectedRecipeIds());
}

/** The previous preparation checked against what can be chosen right now. */
export function getRepeatDeparturePlan() {
  return resolveLastPreparation(state.lastPreparation, state);
}

/** What a repeat departure pays, for the button that starts it. */
export function formatRepeatDepartureCost(plan) {
  if (!plan || plan.recipeIds.length === 0) return "持ち込む道具なし";
  const paidCount = plan.recipeIds.length - plan.storedCount;
  const parts = [];
  if (plan.storedCount > 0) parts.push(`倉庫から${plan.storedCount}品`);
  if (paidCount > 0) parts.push(`支払い：${formatCraftPayment(plan.payment)}`);
  return `道具${plan.recipeIds.length}品（${parts.join("・")}）`;
}

/**
 * Start the next run from the town with the previous preparation, without
 * opening the preparation screen. Refuses unless every previous choice can
 * be made again, so it never leaves with less than last time.
 */
export function repeatLastDeparture() {
  if (state.gameState !== "town") return false;
  const plan = getRepeatDeparturePlan();
  if (!plan?.canRepeat) return false;
  return launchRun(plan.kitId, plan.startingGear, plan.startFloor, plan.recipeIds);
}

function getSelectedRecipeIds() {
  return [...departureCraftQuantities.entries()].flatMap(([recipeId, quantity]) =>
    Array.from({ length: quantity }, () => recipeId)
  );
}

function getSelectedBagItems(recipeIds = getSelectedRecipeIds()) {
  return getDepartureBagItems(recipeIds, state.workshop, selectedKitId);
}

function getCraftSelectionBlockReason(recipe, selectedRecipeIds) {
  return getSelectionBlockReason(recipe, selectedRecipeIds, {
    workshop: state.workshop,
    metaMaterials: state.metaMaterials,
    storage: state.storage,
    startingKitId: selectedKitId
  });
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
    Number.isFinite(availableSlots) ? availableSlots : 99,
    state.storage
  );
  return `あと${Math.min(additional, DEPARTURE_ITEM_LIMITS[recipe.resultId] || additional)}個`;
}

function getShortItemName(itemId) {
  const name = ITEMS[itemId]?.name || itemId;
  return name.replace(/\s*[（(].*?[）)]/g, "").replace("帰還の翼", "翼");
}

function createDeparturePreviewCharacter(startingKitId, startingGear = null) {
  return createDepartureCharacter(startingKitId, startingGear).character;
}

function formatLoadCopy(load) {
  return `${load.label}（${load.description}）`;
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
  summary.setAttribute("aria-label", "今回の支度");
  summary.setAttribute("aria-live", "polite");

  const heading = document.createElement("div");
  heading.className = "solo-preparation-heading";
  const title = document.createElement("strong");
  title.textContent = "今回の支度";
  const count = document.createElement("span");
  count.className = "solo-start-craft-summary-title";
  // What is newly made is said only when something is.
  count.textContent = `持ち込み ${selectedItems.length}/${DEPARTURE_BAG_CAPACITY}${craftedItemCount > 0 ? `（うち${craftedItemCount}品は出発前に作る）` : ""}`;
  heading.append(title, count);
  summary.appendChild(heading);

  const slotNote = document.createElement("div");
  slotNote.className = "solo-preparation-slot-note";
  slotNote.textContent = `空き ${DEPARTURE_BAG_CAPACITY - selectedItems.length}枠は、迷宮で拾う品のために残る。`;
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
      : `${index + 1}枠目：空き`);
    slots.appendChild(slot);
  }
  summary.appendChild(slots);

  const conditions = document.createElement("div");
  conditions.className = "solo-preparation-conditions";
  const startingCharacter = createDeparturePreviewCharacter(startingKitId, startingGear);
  const equipmentLoad = getEquipmentLoadPlayerCopy(startingCharacter);
  // Only what applies to this kit is listed: no row says "none".
  appendPreparationRow(conditions, "開始キット", getStartingKit(startingKitId)?.name || "—");
  appendPreparationRow(
    conditions,
    "行動の速さ",
    formatLoadCopy(equipmentLoad),
    "solo-preparation-load"
  );
  if (startingGear) {
    appendPreparationRow(
      conditions,
      "替えた武器",
      `${getStartingGearName(startingGear)}（工房で解放）`,
      "solo-preparation-equipment"
    );
  }
  const startingEquipment = Object.values(startingCharacter.equipment || {})
    .filter(Boolean)
    .map(itemId => ITEMS[itemId]?.name || itemId)
    .join("・");
  if (startingEquipment) {
    appendPreparationRow(conditions, "身につける品", startingEquipment, "solo-preparation-equipment");
  }
  const medium = getEquippedMedium(startingCharacter);
  if (medium) {
    appendPreparationRow(
      conditions,
      "呪文の媒体",
      `${ITEMS[medium.item]?.name || medium.item}（ルーン枠 ${medium.runeSlots}）`,
      "solo-preparation-medium"
    );
  }
  const activeRunes = getActiveRuneSpellKeys(startingCharacter)
    .map(spellKey => ITEMS[getRuneItemId(spellKey)]?.name || spellKey)
    .join("・");
  if (activeRunes) appendPreparationRow(conditions, "使うルーン", activeRunes, "solo-preparation-runes");
  const nearestFeat = getNearestFeats(state.feats, null, 1)[0];
  if (nearestFeat) {
    appendPreparationRow(
      conditions,
      "近い偉業",
      `${nearestFeat.feat.name}（${formatFeatProgress(nearestFeat.feat, nearestFeat.progress)}）`,
      "solo-preparation-feat"
    );
  }
  const destinationLabel = selectedStartFloor === null
    ? "まだ選んでいない"
    : `${getDungeonForFloor(selectedStartFloor).name}（地下${DUNGEON_FLOOR_COUNT}階まで）`;
  appendPreparationRow(conditions, "行き先", destinationLabel, "solo-preparation-floor");
  summary.appendChild(conditions);

  optGrid.appendChild(summary);
}

function getDepartureCraftQuantity(recipeId) {
  return departureCraftQuantities.get(recipeId) || 0;
}

function changeDepartureCraftQuantity(optGrid, startingKitId, startingGear, recipeId, delta, focusSelector = null) {
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
  renderStartFloorChoices(optGrid, startingKitId, startingGear, focusSelector);
}

function clearDepartureStartFooter() {
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
}

function renderDepartureCraftOptions(optGrid, startingKitId, startingGear) {
  const selectedRecipeIds = getSelectedRecipeIds();
  renderPreparationSummary(optGrid, startingKitId, startingGear);
  const selectedCost = getDepartureCraftCost(selectedRecipeIds, state.storage);
  const selectedBalance = getDepartureCraftBalance(state.metaMaterials, selectedRecipeIds, state.storage);
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
  balances.setAttribute("aria-label", `作ったあとの素材：${formatCraftPayment(selectedCost)}`);
  summary.appendChild(balances);

  const craftHeading = document.createElement("h3");
  craftHeading.className = "solo-preparation-section-heading";
  craftHeading.textContent = "持ち込む道具を選ぶ";
  optGrid.appendChild(craftHeading);

  const recipes = getSortedCraftRecipes(CRAFT_RECIPES);
  // With nothing selected and nothing affordable, every row would read
  // "0個・素材不足"; collapse them into one hint instead.
  const hasNoCraftableRecipe = selectedRecipeIds.length === 0 &&
    recipes.every(recipe => getCraftSelectionBlockReason(recipe, selectedRecipeIds));
  if (hasNoCraftableRecipe) {
    const emptyNote = document.createElement("p");
    emptyNote.className = "solo-start-craft-empty";
    emptyNote.textContent = "持ち込める道具はまだない。素材を集めると作れる。";
    optGrid.appendChild(emptyNote);
    return;
  }

  recipes.forEach(recipe => {
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
      changeDepartureCraftQuantity(
        optGrid,
        startingKitId,
        startingGear,
        recipe.resultId,
        -1,
        `[data-craft-recipe-id="${recipe.resultId}"]`
      );
    });

    const hasEmptyMaterial = !canAdd && getCraftSelectionBlockReason(recipe, selectedRecipeIds) === "素材不足";
    const button = createActionCard({
      name: `${recipe.name}：${quantity}個`,
      description: recipe.desc,
      cost: `${formatCraftPaymentWithBalance(recipe, selectedBalance, selectedRecipeIds)} ・ ${availability}`,
      costClassName: `solo-start-craft-cost${hasEmptyMaterial ? " is-insufficient" : ""}`,
      className: "solo-start-craft-option",
      selected: quantity > 0,
      disabled: !canAdd,
      ariaPressed: quantity > 0,
      dataset: { recipeId: recipe.resultId },
      onClick: () => {
        changeDepartureCraftQuantity(
          optGrid,
          startingKitId,
          startingGear,
          recipe.resultId,
          1,
          `[data-recipe-id="${recipe.resultId}"]`
        );
      }
    });
    stepper.append(decrement, button);
    optGrid.appendChild(stepper);
  });
}

// A treasure carried out again lets the player fix one likely Core family
// of one open dungeon before the next departure (#2061). It is offered for
// the chosen dungeon and is gone once the run departs.
function appendTreasurePin(optGrid, startingKitId, startingGear) {
  if (selectedStartFloor === null) return;
  const dungeonId = getDungeonForFloor(selectedStartFloor).id;
  if (!canPinCoreFamily(state, dungeonId)) return;
  const likely = getLikelyCoreFamilies(state, dungeonId);
  const section = document.createElement("section");
  section.className = "solo-start-treasure-pin";
  section.setAttribute("aria-label", "至宝の力");
  const heading = document.createElement("div");
  heading.className = "solo-start-rule-heading";
  const title = document.createElement("strong");
  title.textContent = "至宝の力";
  const hint = document.createElement("span");
  hint.textContent = `${getDungeonForFloor(selectedStartFloor).name}の出やすい Core を1つ、好きなものに決められる。使わずに出発すると消える。`;
  heading.append(title, hint);
  const choices = document.createElement("div");
  choices.className = "solo-start-pin-choices";
  getDrawableCoreFamilyIds(state).forEach(familyId => {
    const family = getCoreFamily(familyId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn solo-start-pin-option";
    button.dataset.family = familyId;
    const already = likely.includes(familyId);
    button.disabled = already;
    button.textContent = already ? `${family.name}（もう出やすい）` : family.name;
    button.addEventListener("click", () => {
      if (!pinCoreFamilyForDungeon(state, dungeonId, familyId)) return;
      renderStartFloorChoices(optGrid, startingKitId, startingGear, `[data-start-floor="${selectedStartFloor}"]`);
    });
    choices.appendChild(button);
  });
  section.append(heading, choices);
  optGrid.appendChild(section);
}

function renderStartFloorChoices(optGrid, startingKitId, startingGear, focusSelector = null) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-floor-grid";
  const footer = document.getElementById("departure-start-footer");
  if (footer) footer.replaceChildren();
  const changeKit = document.createElement("button");
  changeKit.type = "button";
  changeKit.className = "btn btn-block solo-start-change";
  changeKit.textContent = "開始キットを選び直す";
  changeKit.addEventListener("click", () => renderKitChoice(optGrid, ".solo-starting-kit-option"));
  optGrid.appendChild(changeKit);

  if (droppedPreparationLines.length > 0) {
    const dropped = document.createElement("section");
    dropped.className = "solo-preparation-dropped";
    dropped.setAttribute("role", "status");
    const droppedTitle = document.createElement("strong");
    droppedTitle.textContent = "前回の準備から外したもの";
    const droppedList = document.createElement("ul");
    droppedPreparationLines.forEach(line => {
      const item = document.createElement("li");
      item.textContent = line;
      droppedList.appendChild(item);
    });
    dropped.append(droppedTitle, droppedList);
    optGrid.appendChild(dropped);
  }

  // The dungeon choice (#2060) lives in the single scrolling surface; only
  // the confirm action stays pinned in the footer so it is always reachable.
  // A dungeon is kept as the running number of its first floor.
  const floorSection = document.createElement("section");
  floorSection.className = "solo-start-floor-section";
  floorSection.setAttribute("aria-label", "行き先選択");
  const floorHeading = document.createElement("div");
  floorHeading.className = "solo-start-floor-heading";
  const floorTitle = document.createElement("strong");
  floorTitle.textContent = "行き先を選ぶ";
  floorHeading.append(floorTitle);
  floorSection.appendChild(floorHeading);

  const dungeons = listDungeons(state);
  const openDungeons = dungeons.filter(dungeon => dungeon.open);
  // What the dungeons have in common only matters once there is a choice.
  if (openDungeons.length > 1) {
    const floorHint = document.createElement("span");
    floorHint.textContent = `どの迷宮も地下${DUNGEON_FLOOR_COUNT}階まで。どこへ行っても、冒険はLv1から。`;
    floorHeading.append(floorHint);
  }
  // With a single candidate there is nothing to choose: start with it
  // selected so the confirm button is ready. Several candidates keep the
  // explicit choice.
  if (openDungeons.length === 1 && selectedStartFloor === null) {
    selectedStartFloor = getDungeonEntryFloor(openDungeons[0].index);
  }
  openDungeons.forEach(dungeon => {
    const floor = getDungeonEntryFloor(dungeon.index);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-neon btn-block solo-start-floor-option${selectedStartFloor === floor ? " is-selected" : ""}`;
    const dungeonName = document.createElement("strong");
    dungeonName.textContent = dungeon.name;
    const dungeonDetail = document.createElement("span");
    // Cleared: its guardian was beaten by a run that came home.
    dungeonDetail.textContent = dungeon.cleared ? "踏破済み" : "まだ踏破していない";
    // The three likely Core families of this draw (#2061): a coarse, true
    // statement, never odds.
    const likely = getLikelyCoreFamilies(state, dungeon.id);
    const families = document.createElement("span");
    families.className = "solo-start-dungeon-families";
    families.dataset.families = likely.join(",");
    const pinned = state.coreFamilies?.pinned;
    const pinnedName = pinned?.dungeonId === dungeon.id ? getCoreFamily(pinned.familyId)?.name : null;
    families.textContent = `出やすい Core：${formatCoreFamilies(likely)}${pinnedName ? `（「${pinnedName}」は至宝で決めた）` : ""}`;
    button.append(dungeonName, dungeonDetail, families);
    button.dataset.startFloor = String(floor);
    button.dataset.dungeon = dungeon.id;
    button.setAttribute("aria-pressed", String(selectedStartFloor === floor));
    button.addEventListener("click", () => {
      selectedStartFloor = floor;
      renderStartFloorChoices(
        optGrid,
        startingKitId,
        startingGear,
        `[data-start-floor="${floor}"]`
      );
    });
    floorSection.appendChild(button);
  });
  // A closed dungeon shows its name and what opens it, nothing else.
  const closedDungeons = dungeons.filter(dungeon => !dungeon.open);
  if (closedDungeons.length > 0) {
    const closedList = document.createElement("ul");
    closedList.className = "solo-start-dungeon-closed";
    closedList.setAttribute("aria-label", "まだ入れない迷宮");
    closedDungeons.forEach(dungeon => {
      const opener = getDungeonOpener(dungeon.index);
      const item = document.createElement("li");
      item.dataset.dungeon = dungeon.id;
      const name = document.createElement("strong");
      name.textContent = dungeon.name;
      const condition = document.createElement("span");
      condition.textContent = dungeon.built && opener
        ? `${opener.name}の守護者を倒して生還すると開く`
        : "まだ道が開いていない";
      item.append(name, condition);
      closedList.appendChild(item);
    });
    floorSection.appendChild(closedList);
  }
  optGrid.appendChild(floorSection);
  appendTreasurePin(optGrid, startingKitId, startingGear);

  renderDepartureCraftOptions(optGrid, startingKitId, startingGear);

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
  restoreFocusAfterRender(
    "submenu-controls",
    document.getElementById("submenu-controls"),
    focusSelector
  );
}

function getStartingGearOptions(startingKitId) {
  return listStartingGearOptions(startingKitId, state.workshop);
}

function appendKitDetailRow(container, label, value, className = "") {
  const row = document.createElement("div");
  row.className = `solo-kit-detail-row${className ? ` ${className}` : ""}`;
  const rowLabel = document.createElement("span");
  rowLabel.textContent = label;
  const rowValue = document.createElement("strong");
  rowValue.textContent = value;
  row.append(rowLabel, rowValue);
  container.appendChild(row);
  return row;
}

function appendKitDetailList(container, label, lines, className) {
  if (!lines.length) return;
  const row = document.createElement("div");
  row.className = `solo-kit-detail-row ${className}`;
  const rowLabel = document.createElement("span");
  rowLabel.textContent = label;
  const list = document.createElement("ul");
  lines.forEach(line => {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  });
  row.append(rowLabel, list);
  container.appendChild(row);
}

function renderKitDetail(optGrid, kit) {
  const copy = getStartingKitCopy(kit.id);
  const character = createDeparturePreviewCharacter(kit.id, selectedStartingGear);
  const stats = getCharDerivedStats(character);
  const load = getEquipmentLoadPlayerCopy(character);
  const technique = TECHNIQUE_BY_PROFILE[getWeaponBehaviorProfile(character)?.id] || null;

  const detail = document.createElement("section");
  detail.className = "solo-kit-detail";
  detail.dataset.detailKitId = kit.id;
  detail.dataset.loadClass = load.class;
  detail.setAttribute("aria-label", "選択中の開始キット");
  detail.setAttribute("aria-live", "polite");

  const heading = document.createElement("div");
  heading.className = "solo-kit-detail-heading";
  const name = document.createElement("strong");
  name.textContent = kit.name;
  heading.appendChild(name);
  if (copy.role) {
    const role = document.createElement("span");
    role.className = "solo-kit-role";
    role.textContent = copy.role;
    heading.appendChild(role);
  }
  detail.appendChild(heading);
  if (copy.playstyle) {
    const playstyle = document.createElement("p");
    playstyle.className = "solo-kit-playstyle";
    playstyle.textContent = copy.playstyle;
    detail.appendChild(playstyle);
  }

  const stat = document.createElement("div");
  stat.className = "solo-kit-stats";
  [
    ["攻撃", stats.attack],
    ["防御", stats.defense],
    ["HP", character.maxHp],
    ["MP", getCharMaxMp(character)]
  ].forEach(([label, value]) => {
    const cell = document.createElement("span");
    cell.textContent = `${label} `;
    const number = document.createElement("strong");
    number.textContent = String(value);
    cell.appendChild(number);
    stat.appendChild(cell);
  });
  detail.appendChild(stat);

  appendKitDetailRow(detail, "行動の速さ", formatLoadCopy(load), "solo-kit-load");
  const equipment = Object.values(character.equipment || {})
    .filter(Boolean)
    .map(itemId => ITEMS[itemId]?.name || itemId)
    .join("・") || "なし";
  appendKitDetailRow(detail, "装備", equipment, "solo-kit-equipment");
  const kitItems = getStartingKitItems(kit.id);
  if (kitItems.length > 0) {
    const counts = new Map();
    kitItems.forEach(itemId => counts.set(itemId, (counts.get(itemId) || 0) + 1));
    const supplies = [...counts.entries()]
      .map(([itemId, count]) => `${ITEMS[itemId]?.name || itemId}${count > 1 ? `×${count}` : ""}`)
      .join("・");
    appendKitDetailRow(detail, "持ち物", `${supplies}（毎回支給・倉庫には戻らない）`, "solo-kit-items");
  }
  const runes = getActiveRuneSpellKeys(character)
    .map(spellKey => ITEMS[getRuneItemId(spellKey)]?.name || spellKey);
  if (runes.length > 0) appendKitDetailRow(detail, "ルーン", runes.join("・"), "solo-kit-runes");
  if (technique) {
    const row = appendKitDetailRow(detail, "武器の技", technique.name, "solo-kit-technique");
    const description = document.createElement("p");
    description.textContent = technique.desc;
    row.appendChild(description);
  }
  appendKitDetailList(detail, "強み", copy.strengths, "solo-kit-strengths");
  appendKitDetailList(detail, "弱み", copy.weaknesses, "solo-kit-weaknesses");

  const gearOptions = getStartingGearOptions(kit.id);
  if (gearOptions.length > 0) {
    const group = document.createElement("div");
    group.className = "solo-kit-gear-options";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "開始武器（工房で解放済み）");
    const groupLabel = document.createElement("span");
    groupLabel.textContent = "開始武器（工房で解放済み）";
    group.appendChild(groupLabel);
    const appendGearButton = (itemId, label, conflict = null) => {
      const button = document.createElement("button");
      button.type = "button";
      const selected = selectedStartingGear === itemId;
      button.className = `btn solo-starting-gear-option${selected ? " is-selected" : ""}`;
      button.dataset.startingGear = itemId || "kit";
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = Boolean(conflict);
      const title = document.createElement("strong");
      title.textContent = label;
      button.appendChild(title);
      if (conflict) {
        const reason = document.createElement("small");
        reason.textContent = `選択不可：${conflict.message}`;
        button.appendChild(reason);
      } else {
        button.addEventListener("click", () => {
          selectedStartingGear = itemId;
          renderKitChoice(optGrid, `[data-starting-gear="${itemId || "kit"}"]`);
        });
      }
      group.appendChild(button);
    };
    appendGearButton(null, "キットの武器のまま");
    gearOptions.forEach(option => appendGearButton(
      option.itemId,
      getStartingGearName(option.itemId),
      option.conflict
    ));
    detail.appendChild(group);
  }
  optGrid.appendChild(detail);
}

// Pre-fill the selections from the previous preparation. Choices that cannot
// be made right now are left out and listed for the player.
function seedFromLastPreparation() {
  departureCraftQuantities = new Map();
  selectedStartFloor = null;
  droppedPreparationLines = [];
  const plan = getRepeatDeparturePlan();
  if (!plan) return false;
  selectedKitId = plan.kitId;
  selectedStartingGear = plan.startingGear;
  plan.recipeIds.forEach(recipeId => {
    departureCraftQuantities.set(recipeId, (departureCraftQuantities.get(recipeId) || 0) + 1);
  });
  selectedStartFloor = plan.startFloor;
  droppedPreparationLines = describeDroppedPreparation(plan.dropped);
  return true;
}

// Entry point when the preparation submenu opens. With a previous
// preparation the player lands on the pre-filled tools and floor, one tap
// from departure; "開始キットを選び直す" still leads to the kit choice.
export function renderSoloStart(optGrid) {
  if (seedFromLastPreparation()) {
    renderStartFloorChoices(optGrid, selectedKitId, selectedStartingGear, "#btn-departure-start");
    return;
  }
  renderKitChoice(optGrid);
}

function renderKitChoice(optGrid, focusSelector = null) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid solo-start-grid";
  clearDepartureStartFooter();
  const availableKits = getAvailableStartingKits(state.facilities);
  if (!availableKits.some(kit => kit.id === selectedKitId)) {
    selectedKitId = availableKits[0]?.id || null;
    selectedStartingGear = null;
  }
  if (selectedStartingGear && !getStartingGearOptions(selectedKitId)
    .some(option => option.itemId === selectedStartingGear && !option.conflict)) {
    selectedStartingGear = null;
  }

  const kitList = document.createElement("div");
  kitList.className = "solo-kit-list";
  kitList.setAttribute("role", "group");
  kitList.setAttribute("aria-label", "開始キット");
  availableKits.forEach(kit => {
    const copy = getStartingKitCopy(kit.id);
    const load = getEquipmentLoadPlayerCopy(createDeparturePreviewCharacter(kit.id));
    const selected = kit.id === selectedKitId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-neon btn-block solo-starting-kit-option${selected ? " is-selected" : ""}`;
    button.dataset.kitId = kit.id;
    button.dataset.loadClass = load.class;
    button.setAttribute("aria-pressed", String(selected));
    if (copy.role) {
      const role = document.createElement("span");
      role.className = "solo-kit-role";
      role.textContent = copy.role;
      button.appendChild(role);
    }
    const name = document.createElement("strong");
    name.textContent = kit.name;
    button.appendChild(name);
    if (copy.playstyle) {
      const playstyle = document.createElement("span");
      playstyle.className = "solo-kit-card-playstyle";
      playstyle.textContent = copy.playstyle;
      button.appendChild(playstyle);
    }
    button.addEventListener("click", () => {
      if (selectedKitId !== kit.id) selectedStartingGear = null;
      selectedKitId = kit.id;
      renderKitChoice(optGrid, `[data-kit-id="${kit.id}"]`);
    });
    kitList.appendChild(button);
  });
  optGrid.appendChild(kitList);

  const selectedKit = getStartingKit(selectedKitId);
  if (selectedKit) renderKitDetail(optGrid, selectedKit);

  const footer = document.getElementById("departure-start-footer");
  const confirm = document.createElement("button");
  confirm.id = "btn-kit-confirm";
  confirm.type = "button";
  confirm.className = "btn btn-neon btn-block solo-start-confirm";
  confirm.textContent = "このキットで準備へ";
  confirm.disabled = !selectedKit;
  confirm.addEventListener("click", () => {
    if (!getStartingKit(selectedKitId)) return;
    renderStartFloorChoices(optGrid, selectedKitId, selectedStartingGear, '[data-start-floor="1"]');
  });
  if (footer) footer.appendChild(confirm);
  else optGrid.appendChild(confirm);

  restoreFocusAfterRender(
    "submenu-controls",
    document.getElementById("submenu-controls"),
    focusSelector
  );
}
