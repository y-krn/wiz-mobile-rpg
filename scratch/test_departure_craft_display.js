globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const failures = [];

function check(label, condition, detail = "") {
  if (condition) return;
  failures.push(detail ? `${label}: ${detail}` : label);
}

function repeatRecipe(recipeId, count) {
  return Array.from({ length: count }, () => recipeId);
}

const {
  canAffordDepartureCraft,
  getAdditionalCraftableCount,
  getDepartureCraftBalance
} = await import("../src/systems/workshop.js");
const { getSortedCraftRecipes } = await import("../src/rules/craft_rules.js");
const { CRAFT_RECIPES } = await import("../src/craft.js");

const sortedCraftRecipeIds = getSortedCraftRecipes(CRAFT_RECIPES).map(recipe => recipe.resultId);
check(
  "departure craft recipes sort by category with unknown recipes last",
  JSON.stringify(sortedCraftRecipeIds) === JSON.stringify([
    "HEAL_POTION",
    "HOLY_WATER",
    "MANA_POTION",
    "GREATER_HEAL",
    "ANTIDOTE",
    "EYE_DROPS",
    "GUARD_POTION",
    "TRAP_KIT",
    "TOWN_PORTAL",
    "IDENTIFY_POWDER"
  ]),
  JSON.stringify(sortedCraftRecipeIds)
);
check(
  "sorting does not mutate the recipe definition order",
  JSON.stringify(CRAFT_RECIPES.map(recipe => recipe.resultId)) === JSON.stringify([
    "HEAL_POTION",
    "ANTIDOTE",
    "HOLY_WATER",
    "MANA_POTION",
    "TRAP_KIT",
    "TOWN_PORTAL",
    "GREATER_HEAL",
    "GUARD_POTION",
    "IDENTIFY_POWDER",
    "EYE_DROPS"
  ]),
  JSON.stringify(CRAFT_RECIPES.map(recipe => recipe.resultId))
);
const sameCategoryCraftRecipeIds = getSortedCraftRecipes([
  { resultId: "MANA_POTION" },
  { resultId: "HEAL_POTION" },
  { resultId: "IDENTIFY_POWDER" },
  { resultId: "ANTIDOTE" },
  { resultId: "UNKNOWN_RECIPE" }
]).map(recipe => recipe.resultId);
check(
  "same-category and unknown recipes retain input order",
  JSON.stringify(sameCategoryCraftRecipeIds) === JSON.stringify([
    "MANA_POTION",
    "HEAL_POTION",
    "ANTIDOTE",
    "IDENTIFY_POWDER",
    "UNKNOWN_RECIPE"
  ]),
  JSON.stringify(sameCategoryCraftRecipeIds)
);

const HEAL_POTION = "HEAL_POTION";
const TOWN_PORTAL = "TOWN_PORTAL";

const untouched = { "獣の牙": 4, "硬い皮": 3 };
const emptySelectionBalance = getDepartureCraftBalance(untouched, []);
check(
  "empty selection keeps the input balance",
  JSON.stringify(emptySelectionBalance) === JSON.stringify(untouched),
  JSON.stringify(emptySelectionBalance)
);

const healBalanceSource = { "獣の牙": 5, "硬い皮": 5, "毒腺": 2 };
const healBalance = getDepartureCraftBalance(
  healBalanceSource,
  [HEAL_POTION, HEAL_POTION]
);
check(
  "two heal potions subtract two fangs and hides",
  healBalance["獣の牙"] === 3 && healBalance["硬い皮"] === 3,
  JSON.stringify(healBalance)
);
check(
  "balance calculation does not mutate the input",
  healBalanceSource["獣の牙"] === 5 && healBalanceSource["硬い皮"] === 5,
  JSON.stringify(healBalanceSource)
);

const typedBalance = { "獣の牙": 3, "硬い皮": 3 };
const typedAdditional = getAdditionalCraftableCount(typedBalance, [], HEAL_POTION);
check("typed recipe additional count reaches the boundary", typedAdditional === 3, String(typedAdditional));
check(
  "typed recipe count is affordable",
  canAffordDepartureCraft(typedBalance, repeatRecipe(HEAL_POTION, typedAdditional))
);
check(
  "typed recipe boundary disables the next item",
  !canAffordDepartureCraft(typedBalance, repeatRecipe(HEAL_POTION, typedAdditional + 1))
);

const mixedBalance = { "獣の牙": 8, "硬い皮": 8, "鉄片": 9 };
const mixedSelection = [TOWN_PORTAL, HEAL_POTION];
const mixedAdditional = getAdditionalCraftableCount(mixedBalance, mixedSelection, TOWN_PORTAL);
check("mixed typed and any-material boundary has one additional item", mixedAdditional === 1, String(mixedAdditional));
check(
  "mixed typed and any-material selection is affordable",
  canAffordDepartureCraft(mixedBalance, mixedSelection)
);
check(
  "mixed selection additional count is affordable",
  canAffordDepartureCraft(
    mixedBalance,
    [...mixedSelection, ...repeatRecipe(TOWN_PORTAL, mixedAdditional)]
  )
);
check(
  "mixed selection boundary rejects one more any-material recipe",
  !canAffordDepartureCraft(
    mixedBalance,
    [...mixedSelection, ...repeatRecipe(TOWN_PORTAL, mixedAdditional + 1)]
  )
);

check(
  "empty materials return zero without unbounded growth",
  getAdditionalCraftableCount({}, [], HEAL_POTION) === 0
);
check(
  "additional craft count respects the cap",
  getAdditionalCraftableCount({ "獣の牙": 20, "硬い皮": 20 }, [], HEAL_POTION, 2) === 2
);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] departure craft display balance and boundary checks");
