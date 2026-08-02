// 出発クラフト（#348）のレシピ・数量・支払い・初期inventoryを固定する。
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

const { CRAFT_RECIPES, executeCraft } = await import("../src/craft.js");
const { MATERIAL_TYPES } = await import("../src/data/materials.js");
const { RUN_QUEST_TEMPLATES } = await import("../src/data/run_quests.js");
const workshopData = await import("../src/data/workshop.js");
const {
  RETIRED_WORKSHOP_NODES,
  WORKSHOP_NODES
} = workshopData;
const {
  canAffordDepartureCraft,
  getDepartureCraftCost,
  getDepartureCraftGrants,
  getDepartureCraftRecipes,
  getWorkshopGrants,
  purchaseDepartureCraft
} = await import("../src/systems/workshop.js");
const { normalizeSavePayload } = await import("../src/state/save_migrations.js");
const { RECOVERY_BALANCE } = await import("../src/rules/recovery_rules.js");
const { state, initNewGame } = await import("../src/state.js");

console.log("=== DEPARTURE CRAFT (#348) ===");

const recipeMaterialNames = new Set(
  CRAFT_RECIPES.flatMap(recipe => Object.keys(recipe.mats || {}))
);
check(
  "all ten material types appear in departure recipes",
  MATERIAL_TYPES.every(material => recipeMaterialNames.has(material)),
  `missing=${MATERIAL_TYPES.filter(material => !recipeMaterialNames.has(material)).join(",")}`
);
check("departure craft has no recipe-count cap", !Object.hasOwn(workshopData, "DEPARTURE_CRAFT_MAX_SLOTS"));
check("starting heal potion supply is removed", RECOVERY_BALANCE.startingHealPotions === 0);
const milestoneQuest = RUN_QUEST_TEMPLATES.find(quest => quest.id === "reach_milestone");
check(
  "guard material is not added to the shallow milestone reward",
  milestoneQuest?.reward?.materials?.["竜鱗"] === undefined,
  JSON.stringify(milestoneQuest?.reward?.materials)
);

const recipeIds = ["HEAL_POTION", "ANTIDOTE", "TRAP_KIT", "TOWN_PORTAL"];
const recipeRows = getDepartureCraftRecipes(recipeIds);
const recipeCost = getDepartureCraftCost(recipeIds);
check("selected recipes resolve in order", recipeRows.length === recipeIds.length);
check(
  "selected recipe costs include the expected item costs",
  recipeCost.any === 8
    && recipeCost.typed["獣の牙"] === 1
    && recipeCost.typed["硬い皮"] === 2
    && recipeCost.typed["毒腺"] === 1
    && !recipeCost.typed["霊粉"]
    && !recipeCost.typed["骨片"]
    && recipeCost.typed["鉄片"] === 2,
  JSON.stringify(recipeCost)
);

const bank = {
  "獣の牙": 10,
  "硬い皮": 10,
  "毒腺": 2,
  "霊粉": 5,
  "骨片": 2,
  "鉄片": 4
};
check("selected recipes are affordable", canAffordDepartureCraft(bank, recipeIds));
const purchase = purchaseDepartureCraft(bank, recipeIds);
check("departure craft purchase succeeds", purchase.ok);
check(
  "purchase returns each selected item once",
  purchase.ok && JSON.stringify(purchase.itemIds) === JSON.stringify(recipeIds),
  JSON.stringify(purchase?.itemIds)
);
check(
  "purchase subtracts exact typed costs",
  purchase.ok
    && purchase.payment.any === 8
    && purchase.metaMaterials["獣の牙"] === 1
    && purchase.metaMaterials["硬い皮"] === 8
    && purchase.metaMaterials["毒腺"] === 1
    && purchase.metaMaterials["霊粉"] === 5
    && purchase.metaMaterials["骨片"] === 2
    && purchase.metaMaterials["鉄片"] === 2
    && Object.values(purchase.cost).reduce((sum, amount) => sum + amount, 0) === 14,
  JSON.stringify(purchase?.metaMaterials)
);
check(
  "craft grants match purchased items",
  JSON.stringify(getDepartureCraftGrants(recipeIds).items) === JSON.stringify(recipeIds)
);

const short = { "獣の牙": 5, "硬い皮": 5, "毒腺": 1, "霊粉": 3, "骨片": 1, "鉄片": 1 };
const shortPurchase = purchaseDepartureCraft(short, recipeIds);
check("purchase fails when one material is short", !shortPurchase.ok && shortPurchase.reason === "insufficient_materials");
check("affordability fails when one material is short", !canAffordDepartureCraft(short, recipeIds));
check("failed purchase does not mutate the source balance", short["獣の牙"] === 5 && short["鉄片"] === 1);

const repeatedRecipeIds = [
  "HEAL_POTION", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION", "TOWN_PORTAL"
];
const repeatedPurchase = purchaseDepartureCraft(
  { "獣の牙": 12, "硬い皮": 4 },
  repeatedRecipeIds
);
check("purchase allows repeated recipes while materials remain", repeatedPurchase.ok);
check(
  "repeated purchase returns every requested item",
  repeatedPurchase.ok && JSON.stringify(repeatedPurchase.itemIds) === JSON.stringify(repeatedRecipeIds),
  JSON.stringify(repeatedPurchase?.itemIds)
);
check(
  "repeated purchase charges the aggregate cost",
  repeatedPurchase.ok
    && repeatedPurchase.payment.any === 8
    && repeatedPurchase.payment.typed["獣の牙"] === 4
    && repeatedPurchase.payment.typed["硬い皮"] === 4,
  JSON.stringify(repeatedPurchase?.payment)
);
const orderIndependentPurchase = purchaseDepartureCraft(
  { "獣の牙": 9, "硬い皮": 9 },
  ["TOWN_PORTAL", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION", "HEAL_POTION"]
);
check("any-material payment preserves typed demand regardless of selection order", orderIndependentPurchase.ok);
check("empty selection is valid", purchaseDepartureCraft({}, []).ok);

const powderPurchase = purchaseDepartureCraft(
  { "霊粉": 5, "呪布": 2 },
  ["IDENTIFY_POWDER"]
);
check("identify powder recipe grants a ticket, not an inventory item", powderPurchase.ok);
check(
  "identify powder grant is separated from item grants",
  powderPurchase.ok
    && powderPurchase.payment.any === 7
    && getDepartureCraftGrants(["IDENTIFY_POWDER"]).identifyPowder === 1
    && getDepartureCraftGrants(["IDENTIFY_POWDER"]).items.length === 0
);

const fullWorkshop = { ranks: Object.fromEntries(WORKSHOP_NODES.map(node => [node.id, node.maxRank || 1])) };
const workshopGrants = getWorkshopGrants(fullWorkshop);
check("workshop nodes no longer grant departure items", workshopGrants.returnItems.length === 0);
check("workshop nodes no longer grant departure powder", workshopGrants.identifyPowder === 0);

const retiredRanks = Object.fromEntries(RETIRED_WORKSHOP_NODES.map(node => [node.id, 1]));
const restored = normalizeSavePayload({
  version: 13,
  workshop: { ranks: { ...retiredRanks, stat_str: 2 } },
  metaMaterials: { "霊粉": 1 },
  inventory: ["HEAL_POTION"]
});
RETIRED_WORKSHOP_NODES.forEach(node => {
  check(`retired node ${node.id} is removed from save`, restored.workshop.ranks[node.id] === undefined);
});
check("surviving node ranks are untouched", restored.workshop.ranks.stat_str === 2);
check(
  "retired node costs are refunded",
  restored.metaMaterials["霊粉"] === 6
    && restored.metaMaterials["呪布"] === 2
    && restored.metaMaterials["黒角"] === 4
    && restored.metaMaterials["竜鱗"] === 1,
  JSON.stringify(restored.metaMaterials)
);
check("existing save inventory is preserved", restored.inventory.length === 1 && restored.inventory[0] === "HEAL_POTION");

initNewGame();
check("new game starts with an empty inventory", state.inventory.length === 0, JSON.stringify(state.inventory));
const inventoryBeforePseudoCraft = [...state.inventory];
const materialsBeforePseudoCraft = { ...state.metaMaterials };
check(
  "identify powder pseudo-recipe cannot enter inventory through executeCraft",
  executeCraft("IDENTIFY_POWDER") === false
    && JSON.stringify(state.inventory) === JSON.stringify(inventoryBeforePseudoCraft)
    && JSON.stringify(state.metaMaterials) === JSON.stringify(materialsBeforePseudoCraft)
);
check(
  "any-material departure item cannot enter inventory through executeCraft",
  executeCraft("TOWN_PORTAL") === false
);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}
console.log(`[PASS] departure craft: ${CRAFT_RECIPES.length} recipes, material-balance quantity limit, all materials covered`);
