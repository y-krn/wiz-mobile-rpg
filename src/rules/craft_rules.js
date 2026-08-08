import { MATERIAL_TYPES } from "../data/materials.js";
import { ITEM_CATEGORY, ITEM_CATEGORY_ORDER } from "../constants/item_categories.js";
import {
  spendAnyMaterials,
  spendMaterials
} from "./material_rules.js";

const FALLBACK_CATEGORY_ORDER = ITEM_CATEGORY_ORDER.length;

function normalizeAnyTotal(total) {
  return Math.max(0, Math.floor(Number(total) || 0));
}

function getCraftRecipeCategoryOrder(recipe) {
  const order = ITEM_CATEGORY_ORDER.indexOf(ITEM_CATEGORY[recipe?.resultId]);
  return order === -1 ? FALLBACK_CATEGORY_ORDER : order;
}

export function getSortedCraftRecipes(recipes) {
  if (!Array.isArray(recipes)) return [];

  return recipes
    .map((recipe, index) => ({ recipe, index }))
    .sort((a, b) => {
      const categoryOrder = getCraftRecipeCategoryOrder(a.recipe) - getCraftRecipeCategoryOrder(b.recipe);
      if (categoryOrder !== 0) return categoryOrder;
      return a.index - b.index;
    })
    .map(({ recipe }) => recipe);
}

export function getDepartureCraftRecipePayment(recipe) {
  if (recipe?.departureCost?.mode === "any") {
    return {
      mode: "any",
      total: normalizeAnyTotal(recipe.departureCost.total)
    };
  }
  return {
    mode: "typed",
    mats: { ...(recipe?.mats || {}) }
  };
}

export function getDepartureCraftCost(recipes) {
  const cost = { typed: {}, any: 0 };
  (recipes || []).forEach(recipe => {
    const payment = getDepartureCraftRecipePayment(recipe);
    if (payment.mode === "any") {
      cost.any += payment.total;
      return;
    }
    Object.entries(payment.mats).forEach(([material, quantity]) => {
      cost.typed[material] = (cost.typed[material] || 0) + quantity;
    });
  });
  return cost;
}

export function getDepartureCraftPaymentTotal(recipe) {
  const payment = getDepartureCraftRecipePayment(recipe);
  return payment.mode === "any"
    ? payment.total
    : Object.values(payment.mats).reduce((sum, quantity) => sum + quantity, 0);
}

function spendDepartureCraftRecipeInternal(balance, recipe) {
  const payment = getDepartureCraftRecipePayment(recipe);
  if (payment.mode === "any") {
    return spendAnyMaterials(balance, payment.total);
  }
  const next = spendMaterials(balance, payment.mats);
  return next ? { balance: next, spent: getTypedSpent(balance, next) } : null;
}

function getTypedSpent(before, after) {
  return Object.fromEntries(
    MATERIAL_TYPES
      .map(material => [material, Math.max(0, (before?.[material] || 0) - (after?.[material] || 0))])
      .filter(([, quantity]) => quantity > 0)
  );
}

export function spendDepartureCraftRecipe(balance, recipe) {
  return spendDepartureCraftRecipeInternal(balance, recipe);
}

// 種別固定の需要を先に確保し、種別不問シンクは残った素材から払う。
// 選択順によって同じ素材残高の購入可否が変わらないようにする。
export function spendDepartureCraftRecipes(balance, recipes) {
  const selected = Array.isArray(recipes) ? recipes : [];
  const typed = selected.filter(recipe => getDepartureCraftRecipePayment(recipe).mode === "typed");
  const any = selected.filter(recipe => getDepartureCraftRecipePayment(recipe).mode === "any");
  let nextBalance = { ...balance };
  const spent = {};
  for (const recipe of [...typed, ...any]) {
    const purchase = spendDepartureCraftRecipeInternal(nextBalance, recipe);
    if (!purchase) return null;
    nextBalance = purchase.balance;
    Object.entries(purchase.spent || {}).forEach(([material, quantity]) => {
      spent[material] = (spent[material] || 0) + quantity;
    });
  }
  return { balance: nextBalance, spent };
}
