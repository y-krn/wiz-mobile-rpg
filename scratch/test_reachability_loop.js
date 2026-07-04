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
  if (!start || !target) return false;
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) return true;
    const cell = grid[pos.y][pos.x];

    for (let i = 0; i < 4; i++) {
      const { dx, dy, dir } = DIRS[i];
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[dir]) continue;

      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}

function generateDungeon(seed) {
  const b1 = generateRandomMap(1, null, seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, seed);
  const b3 = generateRandomMap(3, null, seed);
  const b4 = generateRandomMap(4, b3.stairsDownCoord, seed);
  const b5 = generateRandomMap(5, b4.stairsDownCoord, seed);
  return { b1, b2, b3, b4, b5 };
}

console.log("Starting Loop verification of Map Reachability...");

let failCount = 0;
const ITERATIONS = 500;
for (let i = 0; i < ITERATIONS; i++) {
  const seed = `SEED-LOOP-${i}`;
  try {
    const { b1, b2, b3, b4, b5 } = generateDungeon(seed);

    // Verify each floor
    const floors = [
      { grid: b1.grid, name: "B1F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b1.stairsDownCoord },
      { grid: b2.grid, name: "B2F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b2.stairsDownCoord },
      { grid: b3.grid, name: "B3F", startType: "stairs-up", hasMidboss: true, hasBoss: false, down: b3.stairsDownCoord },
      { grid: b4.grid, name: "B4F", startType: "stairs-up", hasMidboss: false, hasBoss: false, down: b4.stairsDownCoord },
      { grid: b5.grid, name: "B5F", startType: "stairs-up", hasMidboss: false, hasBoss: true, down: null }
    ];

    floors.forEach(f => {
      const start = findCell(f.grid, cell => cell.type === f.startType);
      if (!start) {
        throw new Error(`${f.name} start type ${f.startType} not found`);
      }

      if (f.down) {
        const downCell = findCell(f.grid, cell => cell.type === "stairs-down");
        if (!downCell) {
          throw new Error(`${f.name} stairs-down not found`);
        }
        if (!canReach(f.grid, start, downCell)) {
          throw new Error(`${f.name} stairs-down is not reachable from start`);
        }
      }

      if (f.hasMidboss) {
        const midboss = findCell(f.grid, cell => cell.event === "midboss");
        if (!midboss) {
          throw new Error(`${f.name} midboss not found`);
        }
        if (!canReach(f.grid, start, midboss)) {
          throw new Error(`${f.name} midboss is not reachable from start`);
        }
      }

      if (f.hasBoss) {
        const boss = findCell(f.grid, cell => cell.event === "boss");
        if (!boss) {
          throw new Error(`${f.name} boss not found`);
        }
        if (!canReach(f.grid, start, boss)) {
          throw new Error(`${f.name} boss is not reachable from start`);
        }
      }
    });

  } catch (err) {
    console.error(`[FAIL] Seed: ${seed}, Error: ${err.message}`);
    failCount++;
    if (failCount >= 5) {
      process.exit(1);
    }
  }
}

if (failCount === 0) {
  console.log(`[PASS] ${ITERATIONS} seeds verified. No reachability bugs found in generator.`);
} else {
  console.log(`[FAIL] Total failures: ${failCount}`);
  process.exit(1);
}
