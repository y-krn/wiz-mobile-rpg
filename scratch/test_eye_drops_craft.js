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

const recipe = CRAFT_RECIPES.find(({ resultId }) => resultId === "EYE_DROPS");
check("eye drops recipe is registered", Boolean(recipe));
check(
  "eye drops recipe uses one spirit powder",
  JSON.stringify(recipe?.mats) === JSON.stringify({ "霊粉": 1 }),
  JSON.stringify(recipe?.mats)
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
