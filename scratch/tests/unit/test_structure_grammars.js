import assert from "node:assert/strict";
import { generateRandomMap, getMapStructureMetrics } from "../../../src/map_generator.js";

const TYPES = ["corridor", "loop", "hub", "openArea"];

function profileFor(type) {
  return Object.fromEntries(TYPES.map(candidate => [candidate, candidate === type ? 1 : 0]));
}

function longestStraightRun(grid) {
  let longest = 0;
  for (let y = 0; y < grid.length; y++) {
    let horizontal = 0;
    for (let x = 0; x < grid[y].length; x++) {
      horizontal = grid[y][x].walls.some(wall => !wall) ? horizontal + 1 : 0;
      longest = Math.max(longest, horizontal);
    }
  }
  for (let x = 0; x < grid[0].length; x++) {
    let vertical = 0;
    for (let y = 0; y < grid.length; y++) {
      vertical = grid[y][x].walls.some(wall => !wall) ? vertical + 1 : 0;
      longest = Math.max(longest, vertical);
    }
  }
  return longest;
}

function generate(type) {
  return generateRandomMap(1, null, `ISSUE-952-${type}`, {
    size: { width: 24, height: 24 },
    roomCountRange: [2, 3],
    structureProfile: profileFor(type),
    criticalPathRange: [20, 30],
    generateStairsDown: true
  });
}

const generated = new Map(TYPES.map(type => [type, generate(type)]));

for (const type of TYPES) {
  const first = generated.get(type);
  const repeated = generate(type);
  assert.deepEqual(first.grid, repeated.grid, `${type} layout is not deterministic`);
  assert.equal(first.structureType, type);
  assert.equal(first.structureMetrics.componentCount, 1, `${type} layout is disconnected`);
  assert.deepEqual(first.structureMetrics, getMapStructureMetrics(first.grid, first.rooms));
  assert.ok(first.validation === undefined || first.stairsDownCoord, `${type} stairs missing`);
}

const corridor = generated.get("corridor");
const loop = generated.get("loop");
const hub = generated.get("hub");
const openArea = generated.get("openArea");

assert.ok(longestStraightRun(corridor.grid) >= 12, "corridor backbone is not visibly long");
assert.ok(corridor.structureMetrics.corridorRatio >= 0.35, "corridor lost its narrow-route emphasis");
assert.ok(loop.structureMetrics.cycleCount >= 7, "loop backbone has no recognizable cycle");
assert.ok(loop.structureMetrics.alternativePathRate >= corridor.structureMetrics.alternativePathRate);
assert.ok(hub.rooms.some(room => room.w === 5 && room.h === 5), "hub anchor is missing");
assert.ok(hub.structureMetrics.junctionCount >= loop.structureMetrics.junctionCount, "hub has no concentrated branching");
assert.ok(openArea.rooms.some(room => room.w === 9 && room.h === 7), "open-area plaza is missing");
assert.ok(openArea.structureMetrics.openAreaCellCount >= 50, "open-area plaza is too small");
assert.ok(openArea.structureMetrics.openAreaCellCount > hub.structureMetrics.openAreaCellCount);

console.log("[PASS] Issue #952 uses deterministic type-specific corridor, loop, hub, and open-area skeletons with distinct anchors and metrics.");
