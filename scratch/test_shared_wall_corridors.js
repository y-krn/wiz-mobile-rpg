import { generateRandomMap } from "../src/map_generator.js";

const EDGE_DIRS = [
  { dir: 1, dx: 1, dy: 0, opposite: 3 },
  { dir: 2, dx: 0, dy: 1, opposite: 0 }
];
const SEED_COUNT = 400;
const FLOOR_COUNT = 5;
const DEAD_END_RANGE = [15, 38];

function isWalkableCell(cell) {
  return cell.walls.some(wall => !wall) || cell.secretDoor.some(Boolean);
}

function findSharedWallViolations(grid) {
  const violations = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x];
      for (const { dir, dx, dy, opposite } of EDGE_DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const next = grid[ny]?.[nx];
        if (!next || !cell.walls[dir] || !next.walls[opposite]) continue;
        if (cell.secretDoor?.[dir] || next.secretDoor?.[opposite]) continue;
        if (cell.sealedGate?.[dir] || next.sealedGate?.[opposite]) continue;
        if (!isWalkableCell(cell) || !isWalkableCell(next)) continue;
        violations.push({ x, y, nx, ny });
      }
    }
  }
  return violations;
}

let violationCount = 0;
let firstViolation = null;
let totalDeadEnds = 0;

for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex++) {
  const seed = `shared-wall-corridors-${seedIndex}`;
  let parentStairsCoord = null;
  for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
    const generated = generateRandomMap(floor, parentStairsCoord, seed);
    const violations = findSharedWallViolations(generated.grid);
    if (!firstViolation && violations.length > 0) {
      firstViolation = { seed, floor, ...violations[0] };
    }
    violationCount += violations.length;
    totalDeadEnds += generated.grid.flat().filter(cell =>
      cell.walls.filter(wall => !wall).length === 1
    ).length;
    parentStairsCoord = generated.stairsDownCoord;
  }
}

const mapCount = SEED_COUNT * FLOOR_COUNT;
const averageDeadEnds = totalDeadEnds / mapCount;
const failures = [];
if (violationCount !== 0) {
  failures.push(`found ${violationCount} shared-wall corridor edges; first=${JSON.stringify(firstViolation)}`);
}
if (averageDeadEnds < DEAD_END_RANGE[0] || averageDeadEnds > DEAD_END_RANGE[1]) {
  failures.push(`average dead ends ${averageDeadEnds.toFixed(2)} outside ${DEAD_END_RANGE[0]}-${DEAD_END_RANGE[1]}`);
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${SEED_COUNT} chained seeds x ${FLOOR_COUNT} floors have no shared-wall corridor edges; average dead ends ${averageDeadEnds.toFixed(2)}.`);
