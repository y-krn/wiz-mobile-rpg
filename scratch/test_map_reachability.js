import assert from "assert";
import { generateRandomMap } from "../src/map_generator.js";

const DIRS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x], x, y)) return { x, y };
    }
  }
  return null;
}

function canReach(grid, start, target) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) return true;
    const cell = grid[pos.y][pos.x];

    DIRS.forEach(({ dx, dy, dir }) => {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[dir]) return;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    });
  }

  return false;
}

function generateDungeon(seed) {
  const b1 = generateRandomMap(1, null, seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, seed);
  const b3 = generateRandomMap(3, b2.stairsDownCoord, seed);
  return { b1, b2, b3 };
}

console.log("Starting Map Reachability Verification Tests...");

for (let i = 0; i < 5000; i++) {
  const seed = `SEED${i}`;
  const { b3 } = generateDungeon(seed);
  const stairsUp = findCell(b3.grid, cell => cell.type === "stairs-up");
  const midboss = findCell(b3.grid, cell => cell.event === "midboss");

  assert.ok(stairsUp, `B3F stairs-up should exist for ${seed}`);
  assert.ok(midboss, `B3F midboss should exist for ${seed}`);
  assert.ok(canReach(b3.grid, stairsUp, midboss), `B3F midboss should be reachable for ${seed}`);
}

console.log("All Map Reachability verification tests passed successfully!");
