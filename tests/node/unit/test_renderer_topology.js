import assert from "assert";
import * as facade from "../../../src/rules/renderer_topology.js";
import * as owner from "../../../src/rules/renderer_topology.ts";
import {
  getVisibleCorridorCells,
  getVisibleCorridorTopology,
  isRenderableCorridorCell,
  isVisibleWorldObjectCell
} from "../../../src/rules/renderer_topology.js";
import { DX, DY } from "../../../src/constants/directions.js";

const CENTER = { x: 4, y: 4 };
const DIR = 0;

assert.deepEqual(Object.keys(facade).sort(), Object.keys(owner).sort());
for (const name of Object.keys(owner)) assert.strictEqual(facade[name], owner[name], `${name} facade identity`);

for (const value of [null, undefined, false, 0, ""]) {
  assert.strictEqual(isRenderableCorridorCell(value), value, `falsey cell ${String(value)} returns unchanged`);
}
assert.equal(isRenderableCorridorCell({ walls: [true, true, true, true] }), true, "blockEnter is not required");
assert.equal(isRenderableCorridorCell({ walls: [true, , true, true] }), true, "sparse walls retain Array.every semantics");
for (const cell of [
  {},
  { walls: [true, true, true] },
  { walls: [true, true, true, true, true] },
  { walls: [true, true, true, 1] }
]) assert.strictEqual(isRenderableCorridorCell(cell), false);
assert.strictEqual(isVisibleWorldObjectCell({ valid: true, z: 1, column: 0, cell: 0 }), 0);
assert.strictEqual(isVisibleWorldObjectCell({ valid: true, z: 1, column: 0, cell: undefined }), undefined);
assert.strictEqual(isVisibleWorldObjectCell({ valid: 1, z: 1, column: 0, cell: { walls: [true, true, true, true] } }), false);
assert.strictEqual(isVisibleWorldObjectCell({ valid: true, z: 0, column: 0, cell: { walls: [true, true, true, true] } }), false);
assert.strictEqual(isVisibleWorldObjectCell({ valid: true, z: "1", column: 0, cell: { walls: [true, true, true, true] } }), true);
assert.strictEqual(isVisibleWorldObjectCell({ valid: true, z: 1, column: "0", cell: { walls: [true, true, true, true] } }), false);

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

function topologyFor(grid, z = 0, column = 0, dir = DIR) {
  return getVisibleCorridorTopology(grid, CENTER.x, CENTER.y, dir)
    .find(cell => cell.z === z && cell.column === column);
}

const deadEnd = makeGrid();
assert.equal(isRenderableCorridorCell(deadEnd[CENTER.y][CENTER.x]), true);
assert.deepEqual(getVisibleCorridorCells(deadEnd, CENTER.x, CENTER.y, DIR), [{ z: 0, column: 0 }]);
assert.deepEqual(
  topologyFor(deadEnd),
  {
    z: 0,
    column: 0,
    x: CENTER.x,
    y: CENTER.y,
    cell: deadEnd[CENTER.y][CENTER.x],
    valid: true,
    leftBlocked: true,
    rightBlocked: true,
    frontWall: true,
    frontBlocked: true,
    backBlocked: true,
    frontOneWayBarrier: false,
    leftOneWayBarrier: false,
    rightOneWayBarrier: false,
    backOneWayBarrier: false
  },
  "a closed cell reports all three visible walls"
);

const openFront = makeGrid();
carve(openFront, CENTER.x, CENTER.y, DIR);
const front = topologyFor(openFront);
assert.equal(front.frontWall, false);
assert.equal(front.frontBlocked, false);
assert.equal(front.frontOneWayBarrier, false);
assert.equal(topologyFor(openFront, 1, 0).x, CENTER.x);
assert.equal(isVisibleWorldObjectCell(topologyFor(openFront, 1, 0)), true);

const solidFrontWallWithObject = makeGrid();
carve(solidFrontWallWithObject, CENTER.x, CENTER.y, DIR);
solidFrontWallWithObject[CENTER.y - 1][CENTER.x].event = "chest";
const solidObjectCell = topologyFor(solidFrontWallWithObject, 1, 0);
assert.equal(solidObjectCell.frontWall, true);
assert.equal(solidObjectCell.frontBlocked, true);
assert.equal(isVisibleWorldObjectCell(solidObjectCell), true, "visible floor object remains admitted when its front wall is solid");

const occludedObject = makeGrid();
carve(occludedObject, CENTER.x, CENTER.y, DIR);
carve(occludedObject, CENTER.x, CENTER.y - 1, DIR);
occludedObject[CENTER.y - 2][CENTER.x].event = "chest";
occludedObject[CENTER.y - 1][CENTER.x].walls[DIR] = true;
const occludedTopology = topologyFor(occludedObject, 2, 0);
assert.equal(occludedTopology, undefined, "world object beyond a front wall is absent from renderer topology");

const oneWay = makeGrid();
carve(oneWay, CENTER.x, CENTER.y, DIR);
oneWay[CENTER.y - 1][CENTER.x].blockEnter[2] = true;
assert.deepEqual(getVisibleCorridorCells(oneWay, CENTER.x, CENTER.y, DIR), [{ z: 0, column: 0 }]);
const oneWayFront = topologyFor(oneWay);
assert.equal(oneWayFront.frontWall, false);
assert.equal(oneWayFront.frontBlocked, true);
assert.equal(oneWayFront.frontOneWayBarrier, true);

const oneWayAllDirections = makeGrid();
for (let direction = 0; direction < 4; direction++) {
  const nx = CENTER.x + DX[direction];
  const ny = CENTER.y + DY[direction];
  oneWayAllDirections[CENTER.y][CENTER.x].walls[direction] = false;
  oneWayAllDirections[ny][nx].walls[(direction + 2) % 4] = false;
  oneWayAllDirections[ny][nx].blockEnter[(direction + 2) % 4] = true;
}
const allBarriers = getVisibleCorridorTopology(oneWayAllDirections, CENTER.x, CENTER.y, DIR, 0, 0)[0];
assert.deepEqual([
  allBarriers.frontOneWayBarrier,
  allBarriers.leftOneWayBarrier,
  allBarriers.rightOneWayBarrier,
  allBarriers.backOneWayBarrier
], [true, true, true, true]);
assert.equal(allBarriers.frontWall, false);
assert.equal(allBarriers.frontBlocked, true);

const invalidDestination = makeGrid();
carve(invalidDestination, CENTER.x, CENTER.y, DIR);
delete invalidDestination[CENTER.y - 1][CENTER.x].blockEnter;
assert.equal(topologyFor(invalidDestination).frontBlocked, true);
assert.equal(topologyFor(invalidDestination).frontOneWayBarrier, true);

const invalidCurrent = makeGrid();
delete invalidCurrent[CENTER.y][CENTER.x].walls;
assert.equal(topologyFor(invalidCurrent).valid, false);
assert.equal(topologyFor(invalidCurrent).cell, null);

const invalidMapTopology = getVisibleCorridorTopology(undefined, CENTER.x, CENTER.y, DIR);
assert.equal(invalidMapTopology.length, 1, "invalid map retains the initial centre offset");
assert.deepEqual(Object.keys(invalidMapTopology[0]), ["z", "column", "x", "y", "cell", "valid"]);
assert.deepEqual(invalidMapTopology[0], {
  z: 0, column: 0, x: CENTER.x, y: CENTER.y, cell: null, valid: false
});
assert.equal(Object.isFrozen(invalidMapTopology[0]), true);
assert.equal(Object.isFrozen(invalidMapTopology), false);

const validTopology = getVisibleCorridorTopology(openFront, CENTER.x, CENTER.y, DIR);
assert.deepEqual(Object.keys(validTopology[0]), [
  "z", "column", "x", "y", "cell", "valid", "leftBlocked", "rightBlocked",
  "frontWall", "frontBlocked", "backBlocked", "frontOneWayBarrier",
  "leftOneWayBarrier", "rightOneWayBarrier", "backOneWayBarrier"
]);
assert.equal(validTopology[0].cell, openFront[CENTER.y][CENTER.x]);
assert.equal(Object.isFrozen(validTopology[0]), true);
assert.equal(Object.isFrozen(validTopology), false);
const mutableOffsets = getVisibleCorridorCells(deadEnd, CENTER.x, CENTER.y, DIR);
assert.equal(Object.isFrozen(mutableOffsets), false);
assert.equal(Object.isFrozen(mutableOffsets[0]), false);

const beforeNonmutation = structuredClone(openFront);
getVisibleCorridorTopology(openFront, CENTER.x, CENTER.y, DIR);
assert.deepEqual(openFront, beforeNonmutation, "topology queries do not mutate the map");

assert.deepEqual(getVisibleCorridorCells(undefined, CENTER.x, CENTER.y, DIR), [{ z: 0, column: 0 }]);
assert.deepEqual(getVisibleCorridorCells(makeGrid(), "4", 4, "0"), [{ z: 0, column: 0 }]);
const numericStringBounds = makeGrid();
carve(numericStringBounds, CENTER.x, CENTER.y, DIR);
assert.deepEqual(getVisibleCorridorCells(numericStringBounds, CENTER.x, CENTER.y, DIR, "1", "0"), [
  { z: 0, column: 0 }, { z: 1, column: 0 }
]);

console.log("RENDERER TOPOLOGY TEST PASSED");
