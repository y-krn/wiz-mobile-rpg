import assert from "node:assert/strict";
import {
  canTraverseKnownRouteEdge,
  getPartialSecretDoorPlan
} from "../../../scratch/simulations/sim_depth_material_ev.js";

assert.doesNotMatch(
  getPartialSecretDoorPlan.toString(),
  /secretDoor|secretFound/,
  "partial-information search planning must not inspect hidden door state"
);

const searchRoute = {
  current: { x: 2, y: 2 },
  secretSearchDirectionByCell: new Map(),
  searchedSecretDoorKeys: new Set()
};
assert.deepEqual(getPartialSecretDoorPlan(searchRoute), {
  source: { x: 2, y: 2 },
  room: { x: 2, y: 1 },
  direction: 0,
  key: "2,2>2,1"
});

const hiddenDoorGrid = [[
  { walls: [false, true, true, true], blockEnter: [false, false, false, false], secretDoor: { 1: true } },
  { walls: [true, true, true, true], blockEnter: [false, false, false, false] }
]];
const hiddenDoorRoute = {
  knownCellKeys: new Set(["0,0"]),
  revealedSecretDoorKeys: new Set()
};
assert.equal(
  canTraverseKnownRouteEdge(
    { grid: hiddenDoorGrid },
    hiddenDoorRoute,
    { x: 0, y: 0 },
    { dx: 1, dy: 0, dir: 1 }
  ),
  false,
  "unrevealed secret edge remains blocked"
);
hiddenDoorRoute.revealedSecretDoorKeys.add("0,0>1,0");
assert.equal(
  canTraverseKnownRouteEdge(
    { grid: hiddenDoorGrid },
    hiddenDoorRoute,
    { x: 0, y: 0 },
    { dx: 1, dy: 0, dir: 1 }
  ),
  true,
  "revealed secret edge becomes traversable"
);

console.log("[PASS] partial-information known/hidden route boundary contract");
