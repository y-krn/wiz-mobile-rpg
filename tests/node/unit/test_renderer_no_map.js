import assert from "assert";

const { state } = await import("../../../src/state.js");
const { menuContext } = await import("../../../src/navigation.js");
const { getRendererInput } = await import("../../../src/state/renderer_view.js");
const { getScreenViewState } = await import("../../../src/state/view_state.js");
const { getVisibleCorridorTopology } = await import("../../../src/rules/renderer_topology.js");

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
  const input = getRendererInput(state, menuContext);
  assert.equal(input.sceneVisibility.showTownBackground, true, "no-map solo_start uses the safe town scene");
  assert.doesNotThrow(
    () => getVisibleCorridorTopology(input.map, input.x, input.y, input.dir),
    "no-map solo_start must not reach map-dependent topology checks"
  );
}

state.maps[1] = [[{ type: "empty", walls: [false, false, false, false] }]];
const mappedInput = getRendererInput(state, menuContext);
assert.equal(mappedInput.sceneVisibility.showTownBackground, false, "mapped solo_start keeps the dungeon scene");

state.gameState = "submenu";
state.maps[1] = null;
state.combatState = { phase: "choose_actions" };
menuContext.type = undefined;
menuContext.prevGameState = undefined;
const partialView = getScreenViewState(state, menuContext);
assert.equal(partialView.menuType, "", "partial submenu context is normalized");
assert.equal(partialView.hasCombat, false, "partial combat state is not renderable");
assert.doesNotThrow(() => getRendererInput(state, menuContext), "partial screen state stays render-safe");

console.log("RENDERER-NEUTRAL NO-MAP CONTRACT TEST PASSED");
