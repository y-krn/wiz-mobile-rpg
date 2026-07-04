import { CRAFT_RECIPES } from "../src/craft.js";
import { ITEMS } from "../src/data.js";
import assert from "assert";

console.log("=== STARTING CRAFT SAVINGS SIMULATION & VERIFICATION ===");

CRAFT_RECIPES.forEach(recipe => {
  const shopItem = ITEMS[recipe.resultId];
  if (!shopItem) {
    throw new Error(`Item ${recipe.resultId} not found in ITEMS`);
  }

  const shopPrice = shopItem.price;
  const craftGold = recipe.gold;
  
  // 1. ゴールド割引比率の検証 (0.5 <= 比率 <= 0.7)
  const discountRatio = craftGold / shopPrice;
  console.log(`[${recipe.resultId}] Shop Price: ${shopPrice}G, Craft Gold: ${craftGold}G, Ratio: ${discountRatio.toFixed(3)}`);
  
  assert.ok(discountRatio >= 0.5 && discountRatio <= 0.7, 
    `Discount ratio for ${recipe.resultId} (${discountRatio}) is out of [0.5, 0.7] range`);

  // 2. 素材あたり節約期待値の検証 (10G <= 1素材あたり節約額 <= 40G)
  const totalMatsCount = Object.values(recipe.mats).reduce((a, b) => a + b, 0);
  const savings = shopPrice - craftGold;
  const savingsPerMat = savings / totalMatsCount;
  console.log(`[${recipe.resultId}] Total Mats: ${totalMatsCount}, Net Savings: ${savings}G, Savings/Mat: ${savingsPerMat.toFixed(2)}G`);

  assert.ok(savingsPerMat >= 10 && savingsPerMat <= 40,
    `Savings per material for ${recipe.resultId} (${savingsPerMat}G) is out of [10G, 40G] range`);
});

console.log("-> [PASS] All craft recipes within reasonable discount and material value margins.");
console.log("=== CRAFT SAVINGS SIMULATION PASSED ===");
