import assert from "node:assert/strict";

const { state } = await import("../../../src/state.js");
const { menuContext } = await import("../../../src/navigation.js");
const { getRendererInput } = await import("../../../src/state/renderer_view.js");
const { getVisibleCorridorTopology } = await import("../../../src/rules/renderer_topology.js");

function createCell() {
  return {
    walls: [false, false, false, false],
    blockEnter: [false, false, false, false],
    type: "empty"
  };
}

function configureExploration(map) {
  state.floor = 1;
  state.maps = [map];
  state.visitedMaps = [map?.map(row => row?.map(() => true) || []) || []];
  state.x = 0;
  state.y = 0;
  state.dir = 0;
  state.gameState = "explore";
  state.party = [];
  state.roamingMonsters = [];
  state.combatState = null;
  state.chestState = null;
  state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
  menuContext.type = "";
  menuContext.prevGameState = null;
}

function assertRendererContractIsSafe(message) {
  const input = getRendererInput(state, menuContext);
  assert.doesNotThrow(
    () => getVisibleCorridorTopology(input.map, input.x, input.y, input.dir),
    message
  );
  assert.equal(input.sceneVisibility.showTownBackground, input.map === null, message + ": map absence selects the safe scene");
  assert.equal(input.map === null || Array.isArray(input.map), true, message + ": map is normalized");
}

configureExploration([null]);
assertRendererContractIsSafe("renderer input tolerates an uninitialized floor map");

configureExploration([undefined]);
assertRendererContractIsSafe("renderer input tolerates a malformed map row");

const partialMap = Array.from({ length: 5 }, () => Array.from({ length: 5 }, createCell));
delete partialMap[0][1];
configureExploration(partialMap);
assertRendererContractIsSafe("renderer topology tolerates a sparse visible map cell");

const validMap = Array.from({ length: 5 }, () => Array.from({ length: 5 }, createCell));
configureExploration(validMap);
assertRendererContractIsSafe("renderer input preserves a valid map cell");

console.log("RENDERER-NEUTRAL UNDEFINED MAP CONTRACT TEST PASSED");
