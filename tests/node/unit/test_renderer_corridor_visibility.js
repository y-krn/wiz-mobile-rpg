import assert from "assert";

globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const { DX, DY } = await import("../../../src/constants/directions.js");
const { getVisibleCorridorCells } = await import("../../../src/renderer.js");
const { getVisibleCorridorTopology } = await import("../../../src/rules/renderer_topology.js");
const { isMapDirectionBlocked } = await import("../../../src/rules/map_movement.js");

const CENTER = { x: 4, y: 4 };
const DIR = 0;

function makeGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: "empty"
  })));
}

function carve(grid, x, y, dir) {
  const nextX = x + DX[dir];
  const nextY = y + DY[dir];
  grid[y][x].walls[dir] = false;
  grid[nextY][nextX].walls[(dir + 2) % 4] = false;
}

function orderedKeys(grid, ...limits) {
  return getVisibleCorridorCells(grid, CENTER.x, CENTER.y, DIR, ...limits)
    .map(({ z, column }) => `${z}:${column}`);
}

assert.deepEqual(orderedKeys(makeGrid()), ["0:0"], "a dead end renders only the current cell");

const straight = makeGrid();
for (let y = CENTER.y; y > CENTER.y - 3; y--) carve(straight, CENTER.x, y, DIR);
assert.deepEqual(
  orderedKeys(straight),
  ["0:0", "1:0", "2:0", "3:0"],
  "a straight corridor renders only its connected forward depth"
);

const sideOpenings = makeGrid();
carve(sideOpenings, CENTER.x, CENTER.y, 3);
carve(sideOpenings, CENTER.x, CENTER.y, 1);
assert.deepEqual(
  orderedKeys(sideOpenings),
  ["0:0", "0:1", "0:-1"],
  "left and right openings remain visible when the front is a wall"
);

const tee = makeGrid();
carve(tee, CENTER.x, CENTER.y, DIR);
carve(tee, CENTER.x, CENTER.y - 1, 3);
carve(tee, CENTER.x, CENTER.y - 1, 1);
assert.deepEqual(
  orderedKeys(tee),
  ["0:0", "1:0", "1:1", "1:-1"],
  "a T-junction renders the forward branch and both connected turns"
);

const oneWay = makeGrid();
carve(oneWay, CENTER.x, CENTER.y, DIR);
oneWay[CENTER.y - 1][CENTER.x].blockEnter[2] = true;
assert.deepEqual(
  orderedKeys(oneWay),
  ["0:0"],
  "a one-way entrance is closed in the same direction as movement"
);

const bounded = makeGrid();
for (let y = CENTER.y; y > CENTER.y - 4; y--) carve(bounded, CENTER.x, y, DIR);
assert.deepEqual(orderedKeys(bounded, 1, 0), ["0:0", "1:0"], "maxDepth bounds forward traversal");
assert.deepEqual(orderedKeys(sideOpenings, 3, 0), ["0:0"], "maxColumn bounds side traversal");

const duplicatePaths = makeGrid();
carve(duplicatePaths, CENTER.x, CENTER.y, DIR);
carve(duplicatePaths, CENTER.x, CENTER.y, 1);
carve(duplicatePaths, CENTER.x, CENTER.y - 1, 1);
carve(duplicatePaths, CENTER.x + 1, CENTER.y, DIR);
assert.deepEqual(orderedKeys(duplicatePaths, 1, 1), ["0:0", "1:0", "0:1", "1:1"]);
assert.equal(new Set(orderedKeys(duplicatePaths, 1, 1)).size, orderedKeys(duplicatePaths, 1, 1).length,
  "seen prevents duplicate visits through intersecting paths");

const malformedDestination = makeGrid();
carve(malformedDestination, CENTER.x, CENTER.y, DIR);
delete malformedDestination[CENTER.y - 1][CENTER.x].blockEnter;
assert.equal(
  isMapDirectionBlocked(malformedDestination, CENTER.x, CENTER.y, DIR),
  true,
  "movement rejects a destination with missing blockEnter metadata"
);
assert.deepEqual(
  orderedKeys(malformedDestination),
  ["0:0"],
  "renderer closes a destination with missing blockEnter metadata"
);
assert.equal(
  getVisibleCorridorTopology(sideOpenings, CENTER.x, CENTER.y, DIR)
    .find(({ z, column }) => z === 0 && column === 1).rightBlocked,
  true,
  "shared topology exposes the same side-wall fact to every renderer"
);

console.log("[PASS] renderer corridor visibility follows reachable map connections");
