// balance-impact: none — departure choice validation moved out of the menu,
// plus restoring the previous preparation (#2002). No rule, cost, or reward
// changes: the same checks the preparation screen has always applied.

import {
  STARTING_KITS,
  createStartingKitCharacter,
  getStartingKit,
  getStartingKitItems
} from "../state/initial_state.js";
import { ITEMS } from "../data/items.js";
import { getCharMaxMp } from "../data.js";
import {
  applyWorkshopToCharacter,
  canAffordDepartureCraft,
  getDepartureCraftCost,
  getDepartureCraftRecipes,
  getWorkshopGrants
} from "./workshop.js";
import { CRAFT_RECIPES } from "../craft.js";
import { getEquipmentSlotsForType } from "../rules/equipment_slots.js";
import { getEquipmentHandConflict } from "../rules/equipment_hands.js";
import { isMedium, syncMediumState } from "../rules/magic_rules.js";
import { getVNextTrialBaseId } from "../rules/equipment_vnext_trial.js";
import { INVENTORY_CAPACITY } from "../rules/item_inventory.js";
import { normalizeLastPreparation } from "../state/last_preparation.js";
import { getDungeonForFloor, getOpenEntryFloors } from "../rules/dungeons.js";
import { getUnlockedStartingKitIds } from "./facilities.js";

export const DEPARTURE_BAG_CAPACITY = INVENTORY_CAPACITY;
export const DEPARTURE_ITEM_LIMITS = Object.freeze({ TOWN_PORTAL: 1 });

// Build the character exactly as a run would start it: the kit's equipment
// resolved to the bases actually in play, then the optional Workshop weapon.
// The departure screens preview this same character, so what the player reads
// is what the run starts with.
export function createDepartureCharacter(startingKitId, startingGear = null, workshop = null) {
  const character = applyWorkshopToCharacter(createStartingKitCharacter(startingKitId), workshop);
  const trialStartingGear = getVNextTrialBaseId(startingGear) || startingGear;
  Object.keys(character.equipment || {}).forEach(slotId => {
    const productionId = character.equipment[slotId];
    character.equipment[slotId] = getVNextTrialBaseId(productionId) || productionId;
  });
  // A medium raises max MP; start the run with the kit's capacity filled.
  // This is set before the Workshop weapon is applied, as it always has been,
  // so swapping the weapon does not change the starting MP rule.
  character.mp = getCharMaxMp(character);
  const item = ITEMS[trialStartingGear];
  const slot = getEquipmentSlotsForType(item?.type)[0]?.id;
  const handConflict = slot ? getEquipmentHandConflict(character, trialStartingGear, slot) : null;
  if (startingGear && slot && !handConflict) {
    character.equipment[slot] = trialStartingGear;
    syncMediumState(character, {
      preserveRunes: Boolean(getStartingKit(startingKitId)?.startsWithRune) && isMedium(trialStartingGear)
    });
  }
  return { character, handConflict };
}

export function getStartingGearName(startingGear) {
  const resolved = getVNextTrialBaseId(startingGear) || startingGear;
  return ITEMS[resolved]?.name || ITEMS[startingGear]?.name || startingGear;
}

// Workshop weapons that would actually change the kit's starting weapon.
// A swap that resolves to the weapon the kit already carries is not a choice.
export function getStartingGearOptions(startingKitId, workshop = null) {
  const kitWeapon = createDepartureCharacter(startingKitId, null, workshop).character.equipment?.weapon;
  const seen = new Set();
  return (getWorkshopGrants(workshop).startingGear || [])
    .filter(itemId => ITEMS[itemId])
    .map(itemId => ({
      itemId,
      resolvedId: getVNextTrialBaseId(itemId) || itemId,
      conflict: createDepartureCharacter(startingKitId, itemId, workshop).handConflict
    }))
    .filter(option => {
      if (option.resolvedId === kitWeapon || seen.has(option.resolvedId)) return false;
      seen.add(option.resolvedId);
      return true;
    });
}

/** The four base kits plus the kits opened by town facilities, in that order. */
export function getAvailableStartingKits(facilities = null) {
  const unlocked = getUnlockedStartingKitIds(facilities).map(getStartingKit).filter(Boolean);
  return [...STARTING_KITS, ...unlocked];
}

export function isStartingKitAvailable(startingKitId, facilities = null) {
  return getAvailableStartingKits(facilities).some(kit => kit.id === startingKitId);
}

/**
 * Bag contents at departure: the Workshop's fixed items, the kit's own
 * supplies, then crafted tools. Only the crafted tools are departure craft;
 * the rest are handed out every run and never return to storage.
 */
export function getDepartureBagItems(recipeIds, workshop = null, startingKitId = null) {
  const fixedItems = getWorkshopGrants(workshop).returnItems || [];
  const craftedItems = getDepartureCraftRecipes(recipeIds)
    .filter(recipe => !recipe.identifyPowder)
    .map(recipe => recipe.resultId);
  return [...fixedItems, ...getStartingKitItems(startingKitId), ...craftedItems];
}

/**
 * Why one more of `recipe` cannot be added to the current selection, or ""
 * when it can. Storage stock is used before materials, as at departure.
 */
export function getCraftSelectionBlockReason(recipe, selectedRecipeIds, {
  workshop = null,
  metaMaterials = {},
  storage = [],
  startingKitId = null
} = {}) {
  const selectedItems = getDepartureBagItems(selectedRecipeIds, workshop, startingKitId);
  if (!recipe.identifyPowder && selectedItems.length >= DEPARTURE_BAG_CAPACITY) {
    return "バッグ上限（20枠）";
  }
  const itemLimit = DEPARTURE_ITEM_LIMITS[recipe.resultId];
  if (itemLimit && selectedItems.filter(itemId => itemId === recipe.resultId).length >= itemLimit) {
    return "帰還の翼は1個まで";
  }
  if (!canAffordDepartureCraft(metaMaterials, [...selectedRecipeIds, recipe.resultId], storage)) {
    return "素材不足";
  }
  return "";
}

function countStoredToolsUsed(recipeIds, storage) {
  const stock = new Map();
  (Array.isArray(storage) ? storage : []).forEach(item => {
    const itemId = typeof item === "string" ? item : item?.baseId;
    if (typeof itemId === "string") stock.set(itemId, (stock.get(itemId) || 0) + 1);
  });
  let used = 0;
  getDepartureCraftRecipes(recipeIds).forEach(recipe => {
    if (recipe.identifyPowder || !(stock.get(recipe.resultId) > 0)) return;
    stock.set(recipe.resultId, stock.get(recipe.resultId) - 1);
    used += 1;
  });
  return used;
}

/**
 * Check the previous preparation against what can be chosen right now.
 *
 * Returns `null` when there is no previous preparation. Otherwise returns
 * the choices that still hold, the ones that had to be dropped (with the
 * reason), and what the kept tools would cost after storage stock is used.
 * `canRepeat` is true only when nothing was dropped: a repeat departure never
 * silently leaves with less than last time.
 */
export function resolveLastPreparation(lastPreparation, {
  workshop = null,
  metaMaterials = {},
  storage = [],
  unlockedMilestones = [],
  facilities = null
} = {}) {
  const last = normalizeLastPreparation(lastPreparation);
  if (!last || !isStartingKitAvailable(last.kitId, facilities)) return null;
  const dropped = [];

  let startingGear = null;
  if (last.startingGear) {
    const option = getStartingGearOptions(last.kitId, workshop)
      .find(candidate => candidate.itemId === last.startingGear);
    if (option && !option.conflict) {
      startingGear = last.startingGear;
    } else {
      dropped.push({ kind: "gear", itemId: last.startingGear, reason: "今は選べない" });
    }
  }

  // The dungeons open right now, as the running number of their first floor.
  const floors = getOpenEntryFloors(unlockedMilestones);
  let startFloor = last.startFloor;
  if (!floors.includes(startFloor)) {
    dropped.push({ kind: "floor", floor: last.startFloor, reason: "今は入れない" });
    startFloor = floors.length === 1 ? floors[0] : null;
  }

  const recipeIds = [];
  last.recipeIds.forEach(recipeId => {
    const recipe = CRAFT_RECIPES.find(candidate => candidate.resultId === recipeId);
    const reason = recipe
      ? getCraftSelectionBlockReason(recipe, recipeIds, { workshop, metaMaterials, storage, startingKitId: last.kitId })
      : "今は作れない";
    if (reason) {
      dropped.push({ kind: "item", itemId: recipeId, reason });
    } else {
      recipeIds.push(recipeId);
    }
  });

  return {
    kitId: last.kitId,
    startingGear,
    recipeIds,
    startFloor,
    // The round-trip prototype (#2066) only exists for a run from the top.
    roundTrip: last.roundTrip === true && startFloor === 1,
    dropped,
    payment: getDepartureCraftCost(recipeIds, storage),
    storedCount: countStoredToolsUsed(recipeIds, storage),
    canRepeat: dropped.length === 0 && startFloor !== null
  };
}

/** One line per dropped choice, grouped so "傷薬×2（素材不足）" reads as one. */
export function describeDroppedPreparation(dropped) {
  const lines = [];
  const itemGroups = new Map();
  (Array.isArray(dropped) ? dropped : []).forEach(entry => {
    if (entry.kind === "gear") {
      lines.push(`開始武器の差し替え「${getStartingGearName(entry.itemId)}」（${entry.reason}）`);
    } else if (entry.kind === "floor") {
      lines.push(`行き先「${getDungeonForFloor(entry.floor).name}」（${entry.reason}）`);
    } else if (entry.kind === "item") {
      const key = `${entry.itemId}\u0000${entry.reason}`;
      itemGroups.set(key, (itemGroups.get(key) || 0) + 1);
    }
  });
  itemGroups.forEach((count, key) => {
    const [itemId, reason] = key.split("\u0000");
    const name = String(ITEMS[itemId]?.name || itemId).replace(/\s*[（(].*?[）)]/g, "");
    lines.push(`${name}×${count}（${reason}）`);
  });
  return lines;
}
