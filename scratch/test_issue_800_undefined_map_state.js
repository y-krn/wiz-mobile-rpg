import assert from "node:assert/strict";

const noopContext = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = () => {};
    return target[property];
  }
});

globalThis.document = {
  getElementById: () => ({
    getContext: () => noopContext,
    width: 0,
    height: 0
  })
};

const { state } = await import("../src/state.js");
const { menuContext } = await import("../src/navigation.js");
const { DungeonRenderer } = await import("../src/renderer.js");

const renderer = new DungeonRenderer("dungeon-canvas");

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

function renderInProductionOrder(message) {
  assert.doesNotThrow(
    () => {
      const sceneVisibility = renderer.getSceneVisibility();
      renderer.isAnimating(sceneVisibility);
      renderer.draw(sceneVisibility);
    },
    message
  );
}

configureExploration([null]);
renderInProductionOrder(
  "renderer does not animate or draw dungeon walls before the floor map is initialized"
);

configureExploration([undefined]);
renderInProductionOrder(
  "renderer does not animate or draw dungeon walls when a map row is malformed"
);

const partialMap = Array.from({ length: 5 }, () => Array.from({ length: 5 }, createCell));
delete partialMap[0][1];
configureExploration(partialMap);
renderInProductionOrder(
  "renderer does not dereference walls from a sparse visible map cell"
);

const validMap = Array.from({ length: 5 }, () => Array.from({ length: 5 }, createCell));
configureExploration(validMap);
assert.deepEqual(state.map[0][0].walls, [false, false, false, false]);
renderInProductionOrder(
  "renderer keeps animating and drawing a valid map cell with walls"
);

console.log("ISSUE 800 UNDEFINED MAP STATE TEST PASSED");
