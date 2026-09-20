// sim-scope: infra

import { CRAFT_RECIPES } from "../../src/craft.js";
import {
  getDepartureCraftPaymentTotal,
  getDepartureCraftRecipePayment,
  spendDepartureCraftRecipes
} from "../../src/rules/craft_rules.js";

function totalMaterials(materials) {
  return Object.values(materials).reduce((total, quantity) => total + quantity, 0);
}

function scaleCostToTotal(baseCost, targetTotal) {
  const target = Math.max(0, Math.floor(Number(targetTotal) || 0));
  if (target === totalMaterials(baseCost)) return { ...baseCost };
  const entries = Object.entries(baseCost);
  if (entries.length === 0) return {};
  let remaining = target;
  const scaled = {};
  entries.forEach(([material, quantity], index) => {
    if (index === entries.length - 1) {
      scaled[material] = remaining;
      return;
    }
    const amount = Math.max(
      0,
      Math.min(remaining, Math.round((quantity / totalMaterials(baseCost)) * target))
    );
    scaled[material] = amount;
    remaining -= amount;
  });
  return scaled;
}

function getScenarioRecipeIds(scenario) {
  return [...(scenario.recipeIds || [])];
}

function getScenarioRecipe(scenario, recipeId) {
  const sourceRecipe = CRAFT_RECIPES.find(recipe => recipe.resultId === recipeId);
  if (!sourceRecipe) return null;
  if (scenario.wingCostOverride && recipeId === "TOWN_PORTAL") {
    const payment = getDepartureCraftRecipePayment(sourceRecipe);
    if (payment.mode === "any") {
      return {
        ...sourceRecipe,
        departureCost: { mode: "any", total: scenario.wingCostOverride }
      };
    }
    return {
      ...sourceRecipe,
      mats: scaleCostToTotal(sourceRecipe.mats, scenario.wingCostOverride)
    };
  }
  if (scenario.powderCostOverride && recipeId === "IDENTIFY_POWDER") {
    const payment = getDepartureCraftRecipePayment(sourceRecipe);
    if (payment.mode === "any") {
      return {
        ...sourceRecipe,
        departureCost: { mode: "any", total: scenario.powderCostOverride }
      };
    }
    return {
      ...sourceRecipe,
      mats: scaleCostToTotal(sourceRecipe.mats, scenario.powderCostOverride)
    };
  }
  return sourceRecipe;
}

function emptyCraftPurchase() {
  return {
    purchased: false,
    cost: {},
    balance: null,
    recipeIds: [],
    attempts: {},
    shortages: {},
    shortageMaterials: {}
  };
}

function emptyCraftPurchaseWithBalance(bank) {
  return { ...emptyCraftPurchase(), balance: { ...bank } };
}

function getCraftPriorityRecipeIds(scenario, priority) {
  const recipeIds = getScenarioRecipeIds(scenario);
  if (priority === "wing-first") return recipeIds;
  return recipeIds
    .map((recipeId, index) => ({
      recipeId,
      index,
      cost: getDepartureCraftPaymentTotal(getScenarioRecipe(scenario, recipeId))
    }))
    .sort((left, right) => left.cost - right.cost || left.index - right.index)
    .map(entry => entry.recipeId);
}

// Pure policy helper for current regression coverage. No CLI or simulation entrypoint.
export function purchaseCraftFromBank(bank, scenario, priority = "wing-first") {
  const recipeIds = getScenarioRecipeIds(scenario);
  if (recipeIds.length === 0) {
    return emptyCraftPurchaseWithBalance(bank);
  }
  let balance = { ...bank };
  const selectedRecipeIds = [];
  const cost = {};
  const attempts = {};
  const shortages = {};
  const shortageMaterials = {};
  const priorityRecipeIds = getCraftPriorityRecipeIds(scenario, priority);
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const recipeId of priorityRecipeIds) {
      attempts[recipeId] = (attempts[recipeId] || 0) + 1;
      const recipe = getScenarioRecipe(scenario, recipeId);
      if (!recipe) throw new Error(`craft sweep recipe validation failed: ${recipeId}`);
      const payment = getDepartureCraftRecipePayment(recipe);
      const candidateRecipeIds = [...selectedRecipeIds, recipeId];
      const purchase = spendDepartureCraftRecipes(
        bank,
        candidateRecipeIds.map(candidateId => getScenarioRecipe(scenario, candidateId))
      );
      // UIと同じく、払えない品を飛ばしながら優先順位を周回する。
      if (!purchase) {
        shortages[recipeId] = (shortages[recipeId] || 0) + 1;
        if (payment.mode === "any") {
          if (!shortageMaterials[recipeId]) shortageMaterials[recipeId] = {};
          shortageMaterials[recipeId]["種別不問合計"] =
            (shortageMaterials[recipeId]["種別不問合計"] || 0) + 1;
        } else {
          Object.entries(payment.mats).forEach(([material, quantity]) => {
            if ((balance[material] || 0) >= quantity) return;
            if (!shortageMaterials[recipeId]) shortageMaterials[recipeId] = {};
            shortageMaterials[recipeId][material] =
              (shortageMaterials[recipeId][material] || 0) + 1;
          });
        }
        continue;
      }
      balance = purchase.balance;
      selectedRecipeIds.push(recipeId);
      Object.assign(cost, purchase.spent);
      madeProgress = true;
    }
  }
  if (selectedRecipeIds.length === 0) {
    return {
      ...emptyCraftPurchaseWithBalance(bank),
      attempts,
      shortages,
      shortageMaterials
    };
  }
  return {
    purchased: true,
    cost,
    balance,
    recipeIds: selectedRecipeIds,
    attempts,
    shortages,
    shortageMaterials
  };
}
