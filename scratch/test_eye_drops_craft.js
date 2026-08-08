// 目薬（#425）の工房レシピ・支払い・素材消費を決定論で固定する。
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
const { state } = await import("../src/state.js");
const {
  getDepartureCraftGrants,
  purchaseDepartureCraft
} = await import("../src/systems/workshop.js");

const recipe = CRAFT_RECIPES.find(({ resultId }) => resultId === "EYE_DROPS");
check("eye drops recipe is registered", Boolean(recipe));
check(
  "eye drops recipe uses one spirit powder",
  JSON.stringify(recipe?.mats) === JSON.stringify({ "霊粉": 1 }),
  JSON.stringify(recipe?.mats)
);

const departureBank = { "霊粉": 1 };
const departurePurchase = purchaseDepartureCraft(departureBank, ["EYE_DROPS"]);
check("departure craft accepts one spirit powder", departurePurchase.ok);
check(
  "departure craft spends one spirit powder",
  JSON.stringify(departurePurchase.cost) === JSON.stringify({ "霊粉": 1 }),
  JSON.stringify(departurePurchase.cost)
);
check(
  "departure craft leaves zero spirit powder",
  departurePurchase.metaMaterials?.["霊粉"] === 0,
  JSON.stringify(departurePurchase.metaMaterials)
);

const shortDepartureBank = { "霊粉": 0 };
const shortDeparturePurchase = purchaseDepartureCraft(shortDepartureBank, ["EYE_DROPS"]);
check(
  "departure craft fails without spirit powder",
  !shortDeparturePurchase.ok && shortDeparturePurchase.reason === "insufficient_materials",
  JSON.stringify(shortDeparturePurchase)
);
check(
  "failed departure craft keeps the source balance",
  JSON.stringify(shortDepartureBank) === JSON.stringify({ "霊粉": 0 }),
  JSON.stringify(shortDepartureBank)
);

const departureGrants = getDepartureCraftGrants(["EYE_DROPS"]);
check(
  "departure craft grants eye drops as an item",
  JSON.stringify(departureGrants.items) === JSON.stringify(["EYE_DROPS"]),
  JSON.stringify(departureGrants.items)
);
check(
  "eye drops is not misclassified as identify powder",
  departureGrants.identifyPowder === 0,
  JSON.stringify(departureGrants)
);

state.inventory = [];
state.metaMaterials = { "霊粉": 0 };
const inventoryBeforeShortage = [...state.inventory];
const materialsBeforeShortage = { ...state.metaMaterials };
check("craft fails when spirit powder is missing", executeCraft("EYE_DROPS") === false);
check(
  "shortage does not change inventory",
  JSON.stringify(state.inventory) === JSON.stringify(inventoryBeforeShortage),
  JSON.stringify(state.inventory)
);
check(
  "shortage does not consume materials",
  JSON.stringify(state.metaMaterials) === JSON.stringify(materialsBeforeShortage),
  JSON.stringify(state.metaMaterials)
);

state.metaMaterials = { "霊粉": 2 };
check("craft succeeds with enough spirit powder", executeCraft("EYE_DROPS") === true);
check(
  "craft adds eye drops to inventory",
  JSON.stringify(state.inventory) === JSON.stringify(["EYE_DROPS"]),
  JSON.stringify(state.inventory)
);
check(
  "craft consumes exactly one spirit powder",
  state.metaMaterials["霊粉"] === 1,
  JSON.stringify(state.metaMaterials)
);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] eye drops craft: shortage, success, inventory grant, and material consumption");
