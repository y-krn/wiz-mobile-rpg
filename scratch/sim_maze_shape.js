import { generateRandomMap } from "../src/map_generator.js";

const DEFAULT_SEED_COUNT = 1000;
const FLOOR_COUNT = 5;
const MIN_REACHABLE_DEAD_ENDS = 13;
// Measured on origin/main with maze-shape-0..999 across B1F-B5F.
const CURRENT_TIGHT_UTURN_BASELINE = 55.203;
const MAX_TIGHT_UTURN_RATIO = 0.20;
const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 }
];

function getSeedCount() {
  const index = process.argv.indexOf("--seeds");
  if (index === -1) return DEFAULT_SEED_COUNT;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--seeds must be followed by a positive integer");
  }
  return value;
}

function isPassage(cell) {
  return cell.walls.some(wall => !wall);
}

function canTraverse(cell, next, dir, allowUnlocks) {
  const canUnlock = allowUnlocks && (cell.secretDoor?.[dir] || cell.sealedGate?.[dir]);
  if (cell.walls[dir] && !canUnlock) return false;
  return !next.blockEnter?.[(dir + 2) % 4];
}

function getReachableKeys(grid, start, allowUnlocks = true) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < DIRS.length; dir++) {
      const nx = pos.x + DIRS[dir].dx;
      const ny = pos.y + DIRS[dir].dy;
      const next = grid[ny]?.[nx];
      if (!next || !canTraverse(cell, next, dir, allowUnlocks)) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

function hasShortPath(grid, start, target, maxDistance) {
  const queue = [{ ...start, distance: 0 }];
  const seen = new Set([`${start.x},${start.y}`]);

  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) return true;
    if (pos.distance === maxDistance) continue;
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < DIRS.length; dir++) {
      const nx = pos.x + DIRS[dir].dx;
      const ny = pos.y + DIRS[dir].dy;
      const next = grid[ny]?.[nx];
      if (!next || cell.walls[dir] || next.walls[(dir + 2) % 4]) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny, distance: pos.distance + 1 });
      }
    }
  }
  return false;
}

function countTightUTurns(grid) {
  let count = 0;
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (!isPassage(grid[y][x])) continue;
      for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }]) {
        const middle = grid[y + dy]?.[x + dx];
        const target = grid[y + dy * 2]?.[x + dx * 2];
        if (!middle || !target || !middle.walls.every(Boolean) || !isPassage(target)) continue;
        if (hasShortPath(grid, { x, y }, { x: x + dx * 2, y: y + dy * 2 }, 4)) count++;
      }
    }
  }
  return count;
}

function findStart(grid) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === "stairs-up") return { x, y };
    }
  }
  return null;
}

function countReachableDeadEnds(grid, start) {
  const reachable = getReachableKeys(grid, start);
  let count = 0;
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (cell.type === "stairs-up" || !reachable.has(`${x},${y}`)) continue;
      if (cell.walls.filter(wall => !wall).length === 1) count++;
    }
  }
  return count;
}

function validateRequiredReachability(grid, start, seed, floor) {
  const reachable = getReachableKeys(grid, start);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      const required = cell.type === "stairs-down" || cell.event || cell.trap;
      if (required && !reachable.has(`${x},${y}`)) {
        throw new Error(`${seed}/B${floor}F required cell unreachable at ${x},${y}`);
      }
    }
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const seedCount = getSeedCount();
const rows = [];
const failures = [];

for (let index = 0; index < seedCount; index++) {
  const seed = `maze-shape-${index}`;
  let parentStairsCoord = null;
  for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
    try {
      const generated = generateRandomMap(floor, parentStairsCoord, seed);
      const start = findStart(generated.grid);
      if (!start) throw new Error(`${seed}/B${floor}F stairs-up missing`);
      validateRequiredReachability(generated.grid, start, seed, floor);
      const reachableDeadEnds = countReachableDeadEnds(generated.grid, start);
      if (reachableDeadEnds < MIN_REACHABLE_DEAD_ENDS) {
        failures.push(`${seed}/B${floor}F reachable dead ends ${reachableDeadEnds} < ${MIN_REACHABLE_DEAD_ENDS}`);
      }
      rows.push({
        floor,
        tightUTurns: countTightUTurns(generated.grid),
        reachableDeadEnds
      });
      parentStairsCoord = generated.stairsDownCoord;
    } catch (error) {
      failures.push(error.message);
    }
  }
}

for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
  const floorRows = rows.filter(row => row.floor === floor);
  console.log(
    `B${floor}F tightUTurns=${mean(floorRows.map(row => row.tightUTurns)).toFixed(3)} ` +
    `reachableDeadEnds=${mean(floorRows.map(row => row.reachableDeadEnds)).toFixed(3)}`
  );
}

const tightUTurnMean = mean(rows.map(row => row.tightUTurns));
console.log(`ALL tightUTurns=${tightUTurnMean.toFixed(3)} reachableDeadEnds=${mean(rows.map(row => row.reachableDeadEnds)).toFixed(3)}`);

if (CURRENT_TIGHT_UTURN_BASELINE !== null) {
  const maximum = CURRENT_TIGHT_UTURN_BASELINE * MAX_TIGHT_UTURN_RATIO;
  if (tightUTurnMean > maximum) {
    failures.push(`tight U-turn mean ${tightUTurnMean.toFixed(3)} > target ${maximum.toFixed(3)}`);
  }
}

if (failures.length > 0) {
  failures.slice(0, 10).forEach(failure => console.error(`[FAIL] ${failure}`));
  console.error(`[FAIL] ${failures.length} failure(s)`);
  process.exit(1);
}

console.log(`[PASS] ${seedCount * FLOOR_COUNT} floors verified`);
