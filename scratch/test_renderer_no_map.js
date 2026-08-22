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

state.maps[1] = [[{ type: "empty" }]];
const mappedVisibility = renderer.getSceneVisibility();
assert.equal(mappedVisibility.showTownBackground, false, "mapped solo_start keeps the dungeon scene");

console.log("RENDERER NO-MAP SOLO_START TEST PASSED");
