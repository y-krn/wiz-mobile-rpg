import { generateRandomMap } from "../src/map_generator.js";

const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

function getReachableKeys(grid, start) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (const { dx, dy, dir } of DIRECTIONS) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const next = grid[ny]?.[nx];
      const canReveal = cell.secretDoor?.[dir] || cell.sealedGate?.[dir];
      if (!next || (cell.walls[dir] && !canReveal)) continue;
      if (next.blockEnter?.[(dir + 2) % 4]) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return seen;
}

const failures = [];
const starts = new Set();

for (let index = 0; index < 100; index++) {
  const seed = `B1-RANDOM-START-${index}`;
  try {
    const generated = generateRandomMap(1, null, seed);
    const repeated = generateRandomMap(1, null, seed);
    const start = findCell(generated.grid, cell => cell.type === "stairs-up");
    const repeatedStart = findCell(repeated.grid, cell => cell.type === "stairs-up");
    if (!start || !repeatedStart) throw new Error("stairs-up missing");
    if (start.x !== repeatedStart.x || start.y !== repeatedStart.y) {
      throw new Error(`start is not reproducible: ${JSON.stringify(start)} / ${JSON.stringify(repeatedStart)}`);
    }
    const openWalls = generated.grid[start.y][start.x].walls.filter(wall => !wall).length;
    if (openWalls < 2) throw new Error(`start is a dead end: ${start.x},${start.y}`);

    const reachable = getReachableKeys(generated.grid, start);
    generated.grid.forEach((row, y) => row.forEach((cell, x) => {
      const required = cell.type === "stairs-down" || Boolean(cell.event) || Boolean(cell.trap);
      if (required && !reachable.has(`${x},${y}`)) {
        throw new Error(`required cell is unreachable: ${x},${y}`);
      }
    }));
    starts.add(`${start.x},${start.y}`);
  } catch (error) {
    failures.push(`${seed}: ${error.message}`);
  }
}

if (starts.size < 2) failures.push(`start randomization missing: ${starts.size} unique coordinate`);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] 100 B1F seeds: reproducible non-dead-end starts, ${starts.size} unique coordinates, all required cells reachable.`);
