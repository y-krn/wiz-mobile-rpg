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

const { CRAFT_RECIPES } = await import("../../../src/craft.js");
const {
  getDepartureCraftGrants,
  purchaseDepartureCraft
} = await import("../../../src/systems/workshop.js");

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

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] eye drops departure craft: recipe registration, affordability, and material consumption");
