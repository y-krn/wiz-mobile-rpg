// 出発クラフト（#348）のレシピ・枠・支払い・初期inventoryを固定する。
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

const { CRAFT_RECIPES } = await import("../src/craft.js");
const { MATERIAL_TYPES } = await import("../src/data/materials.js");
const { RUN_QUEST_TEMPLATES } = await import("../src/data/run_quests.js");
const {
  DEPARTURE_CRAFT_MAX_SLOTS,
  RETIRED_WORKSHOP_NODES,
  WORKSHOP_NODES
} = await import("../src/data/workshop.js");
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
  CRAFT_RECIPES.flatMap(recipe => Object.keys(recipe.mats))
);
check(
  "all ten material types appear in departure recipes",
  MATERIAL_TYPES.every(material => recipeMaterialNames.has(material)),
  `missing=${MATERIAL_TYPES.filter(material => !recipeMaterialNames.has(material)).join(",")}`
);
check("departure craft has a finite slot cap", DEPARTURE_CRAFT_MAX_SLOTS === 5);
check("starting heal potion supply is removed", RECOVERY_BALANCE.startingHealPotions === 0);
const milestoneQuest = RUN_QUEST_TEMPLATES.find(quest => quest.id === "reach_milestone");
check(
  "guard material has a reachable milestone reward",
  milestoneQuest?.reward?.materials?.["竜鱗"] === 1,
  JSON.stringify(milestoneQuest?.reward?.materials)
);

const recipeIds = ["HEAL_POTION", "ANTIDOTE", "TRAP_KIT", "TOWN_PORTAL"];
const recipeRows = getDepartureCraftRecipes(recipeIds);
const recipeCost = getDepartureCraftCost(recipeIds);
check("selected recipes resolve without duplication", recipeRows.length === recipeIds.length);
check(
  "selected recipe costs include the expected item costs",
  recipeCost["獣の牙"] === 5
    && recipeCost["硬い皮"] === 5
    && recipeCost["毒腺"] === 1
    && recipeCost["霊粉"] === 2
    && !recipeCost["骨片"]
    && recipeCost["鉄片"] === 3,
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
    && purchase.metaMaterials["獣の牙"] === 5
    && purchase.metaMaterials["硬い皮"] === 5
    && purchase.metaMaterials["毒腺"] === 1
    && purchase.metaMaterials["霊粉"] === 3
    && purchase.metaMaterials["骨片"] === 2
    && purchase.metaMaterials["鉄片"] === 1,
  JSON.stringify(purchase?.metaMaterials)
);
check(
  "craft grants match purchased items",
  JSON.stringify(getDepartureCraftGrants(recipeIds).items) === JSON.stringify(recipeIds)
);

const short = { "獣の牙": 5, "硬い皮": 5, "毒腺": 1, "霊粉": 3, "骨片": 1, "鉄片": 2 };
const shortPurchase = purchaseDepartureCraft(short, recipeIds);
check("purchase fails when one material is short", !shortPurchase.ok && shortPurchase.reason === "insufficient_materials");
check("affordability fails when one material is short", !canAffordDepartureCraft(short, recipeIds));
check("failed purchase does not mutate the source balance", short["獣の牙"] === 5 && short["鉄片"] === 2);

const tooMany = [...recipeIds, "MANA_POTION", "HOLY_WATER"];
const slotPurchase = purchaseDepartureCraft(bank, tooMany);
check("purchase rejects selections over the slot cap", !slotPurchase.ok && slotPurchase.reason === "slot_limit");
check("empty selection is valid", purchaseDepartureCraft({}, []).ok);

const powderPurchase = purchaseDepartureCraft(
  { "霊粉": 5, "呪布": 2 },
  ["IDENTIFY_POWDER"]
);
check("identify powder recipe grants a ticket, not an inventory item", powderPurchase.ok);
check(
  "identify powder grant is separated from item grants",
  powderPurchase.ok
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

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}
console.log(`[PASS] departure craft: ${CRAFT_RECIPES.length} recipes, ${DEPARTURE_CRAFT_MAX_SLOTS} slots, all materials covered`);
