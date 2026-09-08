import assert from "assert";
import {
  getVisibleCorridorCells,
  getVisibleCorridorTopology,
  isRenderableCorridorCell
} from "../../../src/rules/renderer_topology.js";
import { DX, DY } from "../../../src/constants/directions.js";

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
    frontOneWayBarrier: false
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

const oneWay = makeGrid();
carve(oneWay, CENTER.x, CENTER.y, DIR);
oneWay[CENTER.y - 1][CENTER.x].blockEnter[2] = true;
assert.deepEqual(getVisibleCorridorCells(oneWay, CENTER.x, CENTER.y, DIR), [{ z: 0, column: 0 }]);
const oneWayFront = topologyFor(oneWay);
assert.equal(oneWayFront.frontWall, false);
assert.equal(oneWayFront.frontBlocked, true);
assert.equal(oneWayFront.frontOneWayBarrier, true);

const invalidDestination = makeGrid();
carve(invalidDestination, CENTER.x, CENTER.y, DIR);
delete invalidDestination[CENTER.y - 1][CENTER.x].blockEnter;
assert.equal(topologyFor(invalidDestination).frontBlocked, true);
assert.equal(topologyFor(invalidDestination).frontOneWayBarrier, true);

const invalidCurrent = makeGrid();
delete invalidCurrent[CENTER.y][CENTER.x].walls;
assert.equal(topologyFor(invalidCurrent).valid, false);
assert.equal(topologyFor(invalidCurrent).cell, null);

console.log("RENDERER TOPOLOGY TEST PASSED");
