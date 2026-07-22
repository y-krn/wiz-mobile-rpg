import {
  generateRandomMap,
  placeWardenGate,
  placeWardenGateWithStairFallback
} from "../src/map_generator.js";
import { ensureWardenGate } from "../src/state/warden_gates.js";

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function findCellByType(grid, type) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === type) return { x, y };
    }
  }
  return null;
}

function canReach(grid, start, target) {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  const targetKey = `${target.x},${target.y}`;

  for (const pos of queue) {
    if (`${pos.x},${pos.y}` === targetKey) return true;
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const x = pos.x + DX[dir];
      const y = pos.y + DY[dir];
      const next = grid[y]?.[x];
      if (!next || next.blockEnter?.[(dir + 2) % 4]) continue;
      const key = `${x},${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x, y });
      }
    }
  }
  return false;
}

const generated = generateRandomMap(1, null, "fallback-fixture-16", { generateWardenGate: false });
const grid = generated.grid;
const start = findCellByType(grid, "stairs-up");
const generatedStairsDown = findCellByType(grid, "stairs-down");
const forcedStairsDown = { x: 10, y: 12 };

check(start?.x === 7 && start?.y === 8, "fixture stairs-up changed");
check(generatedStairsDown?.x === 27 && generatedStairsDown?.y === 28, "fixture stairs-down changed");

grid[generatedStairsDown.y][generatedStairsDown.x].type = "empty";
grid[generatedStairsDown.y][generatedStairsDown.x].message = null;
grid[forcedStairsDown.y][forcedStairsDown.x].type = "stairs-down";
grid[forcedStairsDown.y][forcedStairsDown.x].message = "forced fallback fixture";

const directGate = placeWardenGate(
  structuredClone(grid),
  1,
  start,
  forcedStairsDown,
  () => 0.5
);
check(directGate === null, "fixture no longer forces the stair fallback");

const ensured = ensureWardenGate(structuredClone(grid), 1, null, () => 0.5);
check(Boolean(ensured.gate), "ensureWardenGate did not return the fallback gate");
check(
  ensured.stairsDownCoord?.x === generatedStairsDown.x &&
    ensured.stairsDownCoord?.y === generatedStairsDown.y,
  "ensureWardenGate did not propagate the relocated stairs-down coordinate"
);

const rowRefs = grid.map(row => row);
const cellRefs = grid.map(row => row.map(cell => cell));
const result = placeWardenGateWithStairFallback(grid, 1, start, forcedStairsDown, () => 0.5);

check(Boolean(result.gate), "fallback did not place a warden gate");
check(
  result.stairsDownCoord.x !== forcedStairsDown.x || result.stairsDownCoord.y !== forcedStairsDown.y,
  "fallback did not relocate stairs-down"
);
check(grid[forcedStairsDown.y][forcedStairsDown.x].type === "empty", "old stairs-down was not reset to empty");
check(grid[forcedStairsDown.y][forcedStairsDown.x].message === null, "old stairs-down message was not cleared");
check(
  grid[result.stairsDownCoord.y][result.stairsDownCoord.x].type === "stairs-down",
  "relocated cell is not stairs-down"
);
check(canReach(grid, start, result.stairsDownCoord), "relocated stairs-down is unreachable from stairs-up");

for (let y = 0; y < grid.length; y++) {
  check(grid[y] === rowRefs[y], `row identity changed at y=${y}`);
  for (let x = 0; x < grid[y].length; x++) {
    check(grid[y][x] === cellRefs[y][x], `cell identity changed at (${x}, ${y})`);
  }
}

const stairsDownCount = grid.flat().filter(cell => cell.type === "stairs-down").length;
check(stairsDownCount === 1, `expected one stairs-down, found ${stairsDownCount}`);

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] warden gate stair fallback preserves identity and consistency");
