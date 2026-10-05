import assert from "assert";
import { DX, DY } from "../../../src/constants/directions.js";
import { resolveRendererRequest } from "../../../src/renderer_selection.js";
import {
  FIRST_PERSON_RADIUS,
  WALL_TORCH_DENSITY,
  collectThreeViewCells,
  collectThreeViewWallFaces,
  easeOutCubic,
  getCameraPose,
  getLightRadius,
  getNextThreeViewMode,
  getShortestYawDelta,
  getThreeViewRig,
  getTopDownDistance,
  getWallEdgeKey,
  getYawForDir,
  hasWallTorch,
  interpolateAnchor,
  planCameraMove,
  resolveThreeViewRequest
} from "../../../src/rules/three_view.ts";

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

// --- The request: off unless ?view3d= asks, and never through ?renderer= ---
assert.deepEqual(resolveThreeViewRequest(""), { mode: null, effects: true, scale: 1 });
assert.equal(Object.isFrozen(resolveThreeViewRequest("")), true);
assert.equal(resolveThreeViewRequest("?view3d=fp").mode, "first-person");
assert.equal(resolveThreeViewRequest("?view3d=first-person").mode, "first-person");
assert.equal(resolveThreeViewRequest("?view3d=TD").mode, "top-down");
assert.equal(resolveThreeViewRequest("?view3d=top-down").mode, "top-down");
for (const search of ["?view3d=", "?view3d=1", "?view3d=three", "?renderer=three", "?renderer=fp"]) {
  assert.equal(resolveThreeViewRequest(search).mode, null, `${search} leaves the prototype off`);
}
assert.equal(resolveRendererRequest("?view3d=fp").requestedRenderer, "pixi", "the prototype never changes the renderer request");
assert.equal(resolveThreeViewRequest("?view3d=fp&view3dFx=0").effects, false);
assert.equal(resolveThreeViewRequest("?view3d=fp&view3dFx=1").effects, true);
assert.equal(resolveThreeViewRequest("?view3d=fp&view3dScale=0.5").scale, 0.5);
assert.equal(resolveThreeViewRequest("?view3d=fp&view3dScale=9").scale, 2);
assert.equal(resolveThreeViewRequest("?view3d=fp&view3dScale=0.01").scale, 0.25);
for (const value of ["0", "-1", "abc", ""]) {
  assert.equal(resolveThreeViewRequest(`?view3d=fp&view3dScale=${value}`).scale, 1, `scale ${value} falls back`);
}

assert.equal(getNextThreeViewMode("first-person"), "top-down");
assert.equal(getNextThreeViewMode("top-down"), null);
assert.equal(getNextThreeViewMode(null), "first-person");

// --- Facing: the camera's forward vector is the movement direction ---
for (let dir = 0; dir < 4; dir += 1) {
  const yaw = getYawForDir(dir);
  near(-Math.sin(yaw), DX[dir], `dir ${dir} forward x`);
  near(-Math.cos(yaw), DY[dir], `dir ${dir} forward z`);
}
assert.equal(getYawForDir(4), getYawForDir(0));
assert.equal(getYawForDir(-1), getYawForDir(3));
assert.equal(Object.is(getYawForDir(0), 0), true, "north is exactly zero, not negative zero");

// A turn takes the short way round, including across the north seam.
near(getShortestYawDelta(getYawForDir(0), getYawForDir(1)), -Math.PI / 2, "north to east");
near(getShortestYawDelta(getYawForDir(0), getYawForDir(3)), Math.PI / 2, "north to west");
near(getShortestYawDelta(getYawForDir(3), getYawForDir(0)), -Math.PI / 2, "west to north");
near(Math.abs(getShortestYawDelta(getYawForDir(1), getYawForDir(3))), Math.PI, "about-face");
near(getShortestYawDelta(0.3, 0.3 + Math.PI * 6), 0, "full turns cancel");

// --- Camera rigs ---
const portrait = 390 / 844;
const firstPerson = getThreeViewRig("first-person", portrait);
assert.equal(firstPerson.ceiling, true);
assert.equal(firstPerson.wallHeight, 1);
assert.ok(firstPerson.back > 0 && firstPerson.back < 0.46, "the first-person camera stays inside its own cell");
assert.ok(firstPerson.fov > getThreeViewRig("first-person", 16 / 9).fov, "a portrait screen gets a wider lens");

const topDown = getThreeViewRig("top-down", portrait);
assert.equal(topDown.ceiling, false);
assert.ok(topDown.wallHeight < 1, "top-down walls are cut low");
assert.ok(topDown.height > topDown.back, "the top-down camera looks down more than along");
// The chosen distance makes the requested number of cells span the screen.
const halfWidth = getTopDownDistance(portrait, 34, 4.6) * Math.tan(Math.atan(Math.tan((34 * Math.PI) / 360) * portrait));
near(halfWidth * 2, 4.6, "cells across at the focus distance");
assert.ok(getTopDownDistance(portrait) > getTopDownDistance(1), "a narrower screen backs the camera off");
assert.ok(Number.isFinite(getThreeViewRig("top-down", 0).focus), "a zero aspect does not produce NaN");
assert.ok(Number.isFinite(getThreeViewRig("first-person", NaN).fov));

// First-person stands behind the cell centre and looks along the facing.
for (let dir = 0; dir < 4; dir += 1) {
  const pose = getCameraPose(firstPerson, { x: 5, z: 7, yaw: getYawForDir(dir) });
  near(pose.position[0], 5 - DX[dir] * firstPerson.back, `first-person x, dir ${dir}`);
  near(pose.position[2], 7 - DY[dir] * firstPerson.back, `first-person z, dir ${dir}`);
  near(pose.target[0] - pose.position[0], DX[dir] * (firstPerson.back + firstPerson.lookAhead), `looks ahead x, dir ${dir}`);
  near(pose.target[2] - pose.position[2], DY[dir] * (firstPerson.back + firstPerson.lookAhead), `looks ahead z, dir ${dir}`);
}
// Top-down stays behind the player whichever way they face, so forward is always "up the screen".
for (let dir = 0; dir < 4; dir += 1) {
  const pose = getCameraPose(topDown, { x: 5, z: 7, yaw: getYawForDir(dir) });
  const behind = (5 - pose.position[0]) * DX[dir] + (7 - pose.position[2]) * DY[dir];
  const ahead = (pose.target[0] - 5) * DX[dir] + (pose.target[2] - 7) * DY[dir];
  assert.ok(behind > 1, `the camera is behind the player, dir ${dir}`);
  assert.ok(ahead > 0, `the camera looks past the player, dir ${dir}`);
  assert.ok(pose.position[1] > 3, "and well above the floor");
}

// --- Moving between poses ---
const at = (x, z, dir) => ({ x, z, yaw: getYawForDir(dir) });
assert.deepEqual(planCameraMove(null, at(1, 1, 0)), { duration: 0, kind: "cut" });
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 1, 0)), { duration: 0, kind: "none" });
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 0, 0)), { duration: 180, kind: "step" });
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 2, 0)), { duration: 180, kind: "step" }, "a backward step is still a step");
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 1, 1)), { duration: 180, kind: "turn" });
assert.deepEqual(planCameraMove(at(1, 1, 3), at(1, 1, 0)), { duration: 180, kind: "turn" });
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 1, 2)), { duration: 220, kind: "turn-around" });
assert.deepEqual(planCameraMove(at(1, 1, 0), at(9, 9, 0)), { duration: 0, kind: "cut" }, "a teleport is not walked");
assert.deepEqual(planCameraMove(at(1, 1, 0), at(1, 0, 0), false), { duration: 0, kind: "cut" }, "a new floor is not walked");
// A move that starts mid-motion continues from where the camera is.
assert.equal(planCameraMove({ x: 1, z: 0.4, yaw: 0 }, at(1, 0, 0)).kind, "step");

assert.equal(easeOutCubic(0), 0);
assert.equal(easeOutCubic(1), 1);
assert.equal(easeOutCubic(5), 1);
assert.ok(easeOutCubic(0.5) > 0.5, "most of the motion happens early");

const halfway = interpolateAnchor(at(1, 1, 3), at(1, 0, 0), 0.5);
near(halfway.z, 0.5, "position is halfway");
near(halfway.yaw, getYawForDir(3) - Math.PI / 4, "the turn takes the short way");
assert.deepEqual(interpolateAnchor(at(1, 1, 0), at(2, 1, 0), 2), { x: 2, z: 1, yaw: 0 }, "progress is clamped");

// --- What may be drawn ---
function makeGrid(size = 9) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: "empty"
  })));
}
function open(grid, x, y, dir) {
  grid[y][x].walls[dir] = false;
  grid[y + DY[dir]][x + DX[dir]].walls[(dir + 2) % 4] = false;
}
const keys = (cells) => cells.map(({ x, y }) => `${x},${y}`).sort();

// A corridor running north from (4,4) to (4,1), with a closed room at (6,4).
const grid = makeGrid();
open(grid, 4, 4, 0);
open(grid, 4, 3, 0);
open(grid, 4, 2, 0);
const base = { map: grid, x: 4, y: 4, dir: 0 };

const firstPersonCells = collectThreeViewCells({ ...base, mode: "first-person" });
assert.equal(firstPersonCells.length, 81, "first-person draws every cell nearby and lets the walls hide them");
assert.ok(firstPersonCells.every((cell) => cell.inSight));
const bigGrid = makeGrid(30);
assert.equal(
  collectThreeViewCells({ map: bigGrid, x: 15, y: 15, dir: 0, mode: "first-person" }).length,
  (FIRST_PERSON_RADIUS * 2 + 1) ** 2,
  "first-person is bounded by its radius"
);

// Top-down, nothing visited: only what the first-person view shows from here.
assert.deepEqual(keys(collectThreeViewCells({ ...base, mode: "top-down" })), ["4,1", "4,2", "4,3", "4,4"]);
// Facing east, the corridor is a side passage: the same two columns the Pixi view shows.
assert.deepEqual(keys(collectThreeViewCells({ ...base, dir: 1, mode: "top-down" })), ["4,2", "4,3", "4,4"]);
// With the corridor behind, the player sees only their own cell.
assert.deepEqual(keys(collectThreeViewCells({ ...base, dir: 2, mode: "top-down" })), ["4,4"]);

// Visited, lit, and fragment-revealed cells are remembered, and marked as not in sight.
const visitedMap = grid.map((row) => row.map(() => false));
visitedMap[4][6] = true;
const remembered = collectThreeViewCells({ ...base, dir: 2, mode: "top-down", visitedMap, mapFragments: ["0,0"] });
assert.deepEqual(keys(remembered), ["0,0", "4,4", "6,4"]);
assert.equal(remembered.find((cell) => cell.x === 6).inSight, false);
assert.equal(remembered.find((cell) => cell.x === 4).inSight, true);

assert.equal(getLightRadius(0, ""), 0);
assert.equal(getLightRadius(12, "milwa"), 3);
assert.equal(getLightRadius(0, "lomilwa"), 5);
const lit = collectThreeViewCells({ ...base, dir: 2, mode: "top-down", lightTurns: 10, lightPower: "milwa" });
assert.equal(lit.length, 25, "a light spell reveals the minimap's diamond of radius 3");
assert.ok(lit.every((cell) => Math.abs(cell.x - 4) + Math.abs(cell.y - 4) <= 3));

// Malformed input draws nothing instead of throwing.
for (const input of [{ map: null }, { map: grid, x: "a", y: 1 }, { map: grid, x: 1.5, y: 1 }, {}]) {
  assert.deepEqual(collectThreeViewCells({ mode: "top-down", ...input }), []);
}
const holed = makeGrid(3);
holed[1][1] = null;
holed[0] = null;
assert.equal(collectThreeViewCells({ map: holed, x: 1, y: 2, dir: 0, mode: "first-person" }).length, 5);

// --- Wall faces ---
const corridor = collectThreeViewCells({ ...base, mode: "top-down" });
const faces = collectThreeViewWallFaces(grid, corridor);
// Four cells in a line: two side walls each, plus one wall at each end.
assert.equal(faces.length, 10);
assert.ok(faces.every((face) => face.kind === "wall" && face.inSight));
assert.equal(faces.some((face) => face.x === 4 && face.y === 3 && (face.dir === 0 || face.dir === 2)), false, "open sides have no face");

// A one-way opening is a barrier from the side that cannot pass, and open from the other.
const oneWay = makeGrid();
open(oneWay, 4, 4, 0);
oneWay[3][4].blockEnter[2] = true;
const oneWayFaces = collectThreeViewWallFaces(oneWay, [
  { x: 4, y: 4, cell: oneWay[4][4], inSight: true },
  { x: 4, y: 3, cell: oneWay[3][4], inSight: true }
]);
assert.deepEqual(oneWayFaces.filter((face) => face.kind === "one-way"), [{ x: 4, y: 4, dir: 0, kind: "one-way", inSight: true }]);
assert.equal(oneWayFaces.some((face) => face.x === 4 && face.y === 3 && face.dir === 2), false);
// An opening onto nothing is simply a wall.
const edge = makeGrid(1);
edge[0][0].walls[0] = false;
assert.deepEqual(collectThreeViewWallFaces(edge, [{ x: 0, y: 0, cell: edge[0][0], inSight: true }]).map((face) => face.kind), ["wall", "wall", "wall", "wall"]);

// Both sides of one wall name the same edge; different walls never collide.
for (let dir = 0; dir < 4; dir += 1) {
  assert.equal(getWallEdgeKey(3, 5, dir), getWallEdgeKey(3 + DX[dir], 5 + DY[dir], (dir + 2) % 4), `edge key, dir ${dir}`);
}
assert.equal(new Set([0, 1, 2, 3].map((dir) => getWallEdgeKey(3, 5, dir))).size, 4);

// --- Torches stay where they are ---
const torchAt = (x, y, dir, seed = "RUN") => hasWallTorch({ seed, floor: 2, x, y, dir });
let torches = 0;
let total = 0;
for (let x = 0; x < 40; x += 1) for (let y = 0; y < 40; y += 1) for (let dir = 0; dir < 4; dir += 1) {
  assert.equal(torchAt(x, y, dir), torchAt(x, y, dir), "the same face always answers the same");
  torches += torchAt(x, y, dir) ? 1 : 0;
  total += 1;
}
assert.ok(Math.abs(torches / total - WALL_TORCH_DENSITY) < 0.015, `torch density ${torches / total}`);
let differs = 0;
for (let x = 0; x < 40; x += 1) differs += torchAt(x, 1, 0, "RUN") !== torchAt(x, 1, 0, "OTHER") ? 1 : 0;
assert.ok(differs > 0, "another run places its torches elsewhere");

console.log("three view tests passed");
