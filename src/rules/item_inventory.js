import { ITEMS } from "../data/items.js";
import { ITEM_CATEGORY, ITEM_CATEGORY_ORDER } from "../constants/item_categories.js";
import { getItemBaseId } from "./item_rules.js";

const ITEM_DEFINITION_ORDER = new Map(Object.keys(ITEMS).map((itemKey, index) => [itemKey, index]));
const FALLBACK_CATEGORY_ORDER = ITEM_CATEGORY_ORDER.length;

function getCategoryOrder(item) {
  const category = ITEM_CATEGORY[item?.id];
  const order = ITEM_CATEGORY_ORDER.indexOf(category);
  return order === -1 ? FALLBACK_CATEGORY_ORDER : order;
}

function getDefinitionOrder(item) {
  return ITEM_DEFINITION_ORDER.get(item?.id) ?? Number.MAX_SAFE_INTEGER;
}

export function getUsableInventoryItems(inventory) {
  if (!Array.isArray(inventory)) return [];

  return inventory
    .map((itemKey, idx) => {
      const item = ITEMS[getItemBaseId(itemKey)];
      return { itemKey, idx, item };
    })
    .filter(({ item }) => item?.type === "usable")
    .sort((a, b) => {
      const categoryOrder = getCategoryOrder(a.item) - getCategoryOrder(b.item);
      if (categoryOrder !== 0) return categoryOrder;

      const definitionOrder = getDefinitionOrder(a.item) - getDefinitionOrder(b.item);
      if (definitionOrder !== 0) return definitionOrder;

      return a.idx - b.idx;
    });
}
