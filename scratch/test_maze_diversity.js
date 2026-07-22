import assert from "node:assert/strict";
import { createMazeProfile, generateRandomMap, MAZE_PROFILE_RANGES } from "../src/map_generator.js";
import { createRng } from "../src/seed_rng.js";

const DIRS = [
  { dx: 0, dy: -1, opposite: 2 },
  { dx: 1, dy: 0, opposite: 3 },
  { dx: 0, dy: 1, opposite: 0 },
  { dx: -1, dy: 0, opposite: 1 }
];

function reachableKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  for (const { x, y } of queue) {
    const cell = grid[y][x];
    DIRS.forEach(({ dx, dy, opposite }, dir) => {
      const nx = x + dx;
      const ny = y + dy;
      const next = grid[ny]?.[nx];
      const canOpen = cell.secretDoor?.[dir] || cell.sealedGate?.[dir];
      if (!next || (cell.walls[dir] && !canOpen) || next.blockEnter?.[opposite]) return;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    });
  }
  return seen;
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function isPassage(cell) {
  return cell.walls.some(wall => !wall);
}

function measure(grid) {
  const deadEnds = grid.flat().filter(cell => isPassage(cell) && cell.walls.filter(wall => !wall).length === 1).length;
  const runs = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      for (const dir of [1, 2]) {
        const cell = grid[y][x];
        const previous = grid[y - DIRS[dir].dy]?.[x - DIRS[dir].dx];
        if (!isPassage(cell) || cell.walls[dir] || (previous && !previous.walls[dir])) continue;
        let length = 0;
        let cx = x;
        let cy = y;
        while (!grid[cy]?.[cx]?.walls[dir]) {
          length++;
          cx += DIRS[dir].dx;
          cy += DIRS[dir].dy;
        }
        runs.push(length);
      }
    }
  }
  return {
    deadEnds,
    averageStraightLength: runs.reduce((sum, length) => sum + length, 0) / runs.length
  };
}

function coefficientOfVariation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

const metrics = [];
const digStarts = new Set();
for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
  const seed = `maze-metrics-${seedIndex}`;
  let parentStairsCoord = null;
  for (let floor = 1; floor <= 5; floor++) {
    const profile = createMazeProfile(floor, createRng(`${seed}:map:B${floor}`));
    const ranges = MAZE_PROFILE_RANGES[floor];
    assert(profile.straightBias >= ranges.straightBias[0] && profile.straightBias <= ranges.straightBias[1]);
    assert(profile.loopRate >= ranges.loopRate[0] && profile.loopRate <= ranges.loopRate[1]);
    assert.equal(profile.digStart.x % 2, 1);
    assert.equal(profile.digStart.y % 2, 0);
    digStarts.add(`${profile.digStart.x},${profile.digStart.y}`);

    const generated = generateRandomMap(floor, parentStairsCoord, seed);
    const start = findCell(generated.grid, cell => cell.type === "stairs-up");
    assert(start, `${seed}/B${floor}F start missing`);
    const reachable = reachableKeys(generated.grid, start);
    if (generated.stairsDownCoord) {
      assert(reachable.has(`${generated.stairsDownCoord.x},${generated.stairsDownCoord.y}`), `${seed}/B${floor}F stairs unreachable`);
    }
    if (generated.bossCoord) {
      assert(reachable.has(`${generated.bossCoord.x},${generated.bossCoord.y}`), `${seed}/B${floor}F boss unreachable`);
    }
    for (let y = 0; y < generated.grid.length; y++) {
      for (let x = 0; x < generated.grid[y].length; x++) {
        if (generated.grid[y][x].event || generated.grid[y][x].trap) {
          assert(reachable.has(`${x},${y}`), `${seed}/B${floor}F event unreachable at ${x},${y}`);
        }
      }
    }
    metrics.push(measure(generated.grid));
    parentStairsCoord = generated.stairsDownCoord;
  }
}

assert(digStarts.size > 80, `dig start variation too low: ${digStarts.size}`);
// Growing every profile toward 15 dead ends removes the artificial 15/38
// target split while preserving natural variation between generated mazes.
assert(coefficientOfVariation(metrics.map(metric => metric.deadEnds)) > 0.17, "dead-end variation did not exceed baseline CV 0.17");
assert(coefficientOfVariation(metrics.map(metric => metric.averageStraightLength)) > 0.10, "straight-length variation did not exceed baseline CV 0.063");

const first = generateRandomMap(1, null, "maze-repeatability");
const second = generateRandomMap(1, null, "maze-repeatability");
assert.deepEqual(first, second, "same seed must reproduce the same map");

console.log("[PASS] 100 seeds x 5 floors preserve reachability, repeatability, and increased structural variation.");
