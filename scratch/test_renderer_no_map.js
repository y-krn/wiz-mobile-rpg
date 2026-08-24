import assert from "assert";

globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const { state } = await import("../src/state.js");
const { menuContext } = await import("../src/navigation.js");
const { DungeonRenderer } = await import("../src/renderer.js");
const { getScreenViewState } = await import("../src/state/view_state.js");

const renderer = new DungeonRenderer("dungeon-canvas");
state.floor = 2;
state.gameState = "submenu";
state.combatState = null;
state.chestState = null;
state.party = [];
state.roamingMonsters = [];
state.damageTexts = [];
menuContext.type = "solo_start";
menuContext.prevGameState = "town";

for (const missingMap of [null, undefined]) {
  state.maps = [[[{ type: "empty" }]], missingMap, null, null, null];
  assert.equal(state.map, missingMap, "regression state must leave the current floor map uninitialized");
  const noMapVisibility = renderer.getSceneVisibility();
  assert.equal(noMapVisibility.showTownBackground, true, "no-map solo_start uses the safe town scene");
  assert.doesNotThrow(
    () => renderer.isAnimating(noMapVisibility),
    "no-map solo_start must not reach map-dependent animation checks"
  );
  assert.equal(renderer.isAnimating(noMapVisibility), false, "no-map solo_start is not animated");
}

state.maps[1] = [[{ type: "empty", walls: [false, false, false, false] }]];
const mappedVisibility = renderer.getSceneVisibility();
assert.equal(mappedVisibility.showTownBackground, false, "mapped solo_start keeps the dungeon scene");

state.gameState = "submenu";
state.maps[1] = null;
state.combatState = { phase: "choose_actions" };
menuContext.type = undefined;
menuContext.prevGameState = undefined;
const partialView = getScreenViewState(state, menuContext);
assert.equal(partialView.menuType, "", "partial submenu context is normalized");
assert.equal(partialView.hasCombat, false, "partial combat state is not renderable");
assert.doesNotThrow(() => renderer.getSceneVisibility(), "partial screen state stays render-safe");

console.log("RENDERER NO-MAP SOLO_START TEST PASSED");
