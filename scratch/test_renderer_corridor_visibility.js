import assert from "assert";

globalThis.document = {
  getElementById: () => ({
    getContext: () => ({}),
    width: 0,
    height: 0
  })
};

const { DX, DY } = await import("../src/constants/directions.js");
const { getVisibleCorridorCells } = await import("../src/renderer.js");

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

function keys(grid) {
  return getVisibleCorridorCells(grid, CENTER.x, CENTER.y, DIR)
    .map(({ z, column }) => `${z}:${column}`)
    .sort();
}

assert.deepEqual(keys(makeGrid()), ["0:0"], "a dead end renders only the current cell");

const straight = makeGrid();
for (let y = CENTER.y; y > CENTER.y - 3; y--) carve(straight, CENTER.x, y, DIR);
assert.deepEqual(
  keys(straight),
  ["0:0", "1:0", "2:0", "3:0"],
  "a straight corridor renders only its connected forward depth"
);

const sideOpenings = makeGrid();
carve(sideOpenings, CENTER.x, CENTER.y, 3);
carve(sideOpenings, CENTER.x, CENTER.y, 1);
assert.deepEqual(
  keys(sideOpenings),
  ["0:-1", "0:0", "0:1"],
  "left and right openings remain visible when the front is a wall"
);

const tee = makeGrid();
carve(tee, CENTER.x, CENTER.y, DIR);
carve(tee, CENTER.x, CENTER.y - 1, 3);
carve(tee, CENTER.x, CENTER.y - 1, 1);
assert.deepEqual(
  keys(tee),
  ["0:0", "1:-1", "1:0", "1:1"],
  "a T-junction renders the forward branch and both connected turns"
);

const oneWay = makeGrid();
carve(oneWay, CENTER.x, CENTER.y, DIR);
oneWay[CENTER.y - 1][CENTER.x].blockEnter[2] = true;
assert.deepEqual(
  keys(oneWay),
  ["0:0"],
  "a one-way entrance is closed in the same direction as movement"
);

console.log("[PASS] renderer corridor visibility follows reachable map connections");
