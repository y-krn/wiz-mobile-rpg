import assert from "assert";
import { getRendererInput, isRendererInput } from "../../../src/state/renderer_view.js";

function createCell() {
  return { type: "empty", walls: [false, false, false, false] };
}

const map = [[createCell(), createCell()], [createCell(), createCell()]];
const stateLike = {
  gameState: "combat",
  floor: 2,
  x: 1,
  y: 0,
  dir: 1,
  map,
  visitedMap: [[true, false], [false, false]],
  mapRevision: 7,
  lightTurns: 3,
  lightPower: "",
  roamingMonsters: [],
  dungeonMemory: { mapFragments: { 2: ["1,1"] } },
  party: [{ name: "Fighter", status: "ok", hp: 10, equipment: {} }],
  combatState: { phase: "choose_actions", monsters: [{ name: "Biter" }] },
  chestState: null,
  transitioning: false
};

const input = getRendererInput(stateLike, null);
assert.equal(isRendererInput(input), true, "renderer input has an explicit boundary marker");
assert.deepEqual(
  Object.keys(input).sort(),
  [
    "arcaneSense", "combatMonsters", "depthCorruption", "dir", "floor", "hasArcaneSense",
    "kind", "lightPower", "lightTurns", "map", "mapFragments", "mapRevision", "party",
    "roamingMonsters", "sceneVisibility", "view", "visitedMap", "visual", "x", "y"
  ].sort(),
  "renderer input exposes the documented render data only"
);
assert.equal(input.sceneVisibility.showCombat, true, "combat scene is projected once");
assert.equal(input.view.hasMap, true, "valid map is accepted by the screen boundary");
assert.equal(input.combatMonsters, stateLike.combatState.monsters, "combat data is passed without a render-loop copy");
assert.deepEqual(input.mapFragments, ["1,1"], "floor-specific map fragments are projected");

stateLike.x = 0;
assert.equal(input.x, 1, "a render input is a stable per-operation snapshot");

const invalidMapInput = getRendererInput({
  gameState: "explore",
  floor: 1,
  map: [[{ type: "empty", walls: [true, false] }]]
}, null);
assert.equal(invalidMapInput.view.hasMap, false, "partial maps fail closed at the boundary");
assert.equal(invalidMapInput.map, null, "invalid maps are not exposed to drawing code");
assert.equal(invalidMapInput.sceneVisibility.showTownBackground, true, "invalid maps use the safe scene");

console.log("RENDERER VIEW MODEL TEST PASSED");
