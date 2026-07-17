import { generateRandomMap } from "../src/map_generator.js";

const SEED_COUNT = 1000;
// Allow fallback placement below the preferred distance threshold of 10 when dead ends are scarce or nearby.
const MIN_DISTANCE = 5;
const FLOOR_RANGE = [1, 2, 3, 4];
const GRID_SIZE = 24;

function findCellsByType(grid, type) {
  const matches = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === type) matches.push({ x, y });
    }
  }
  return matches;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function formatSummary(label, distances) {
  const violations = distances.filter(distance => distance < MIN_DISTANCE).length;
  return `${label}: min=${Math.min(...distances)}, median=${median(distances)}, violations=${violations}/${distances.length}`;
}

const distancesByFloor = new Map(FLOOR_RANGE.map(floor => [floor, []]));
const distanceDistribution = new Map();
const failures = [];

for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex++) {
  const seed = `stairs-min-distance-${seedIndex}`;
  let parentStairsCoord = null;

  for (const floor of FLOOR_RANGE) {
    const { grid } = generateRandomMap(floor, parentStairsCoord, seed);
    const hasExpectedDimensions = grid.length === GRID_SIZE &&
      grid.every(row => row.length === GRID_SIZE);
    if (!hasExpectedDimensions) {
      failures.push(`${seed}/B${floor}: expected ${GRID_SIZE}x${GRID_SIZE} grid`);
    }

    const stairsUp = findCellsByType(grid, "stairs-up");
    const stairsDown = findCellsByType(grid, "stairs-down");
    if (stairsUp.length !== 1 || stairsDown.length !== 1) {
      failures.push(`${seed}/B${floor}: stairs-up=${stairsUp.length}, stairs-down=${stairsDown.length}`);
      parentStairsCoord = stairsDown[0] || null;
      continue;
    }

    const distance = Math.abs(stairsUp[0].x - stairsDown[0].x) +
      Math.abs(stairsUp[0].y - stairsDown[0].y);
    distancesByFloor.get(floor).push(distance);
    distanceDistribution.set(distance, (distanceDistribution.get(distance) || 0) + 1);
    if (distance < MIN_DISTANCE) {
      failures.push(`${seed}/B${floor}: distance=${distance}, up=${stairsUp[0].x},${stairsUp[0].y}, down=${stairsDown[0].x},${stairsDown[0].y}`);
    }
    parentStairsCoord = stairsDown[0];
  }
}

const allDistances = [...distancesByFloor.values()].flat();
for (const floor of FLOOR_RANGE) {
  console.log(formatSummary(`B${floor}`, distancesByFloor.get(floor)));
}
console.log(formatSummary("All", allDistances));
console.log(`Distance distribution: ${[...distanceDistribution.entries()]
  .sort(([a], [b]) => a - b)
  .map(([distance, count]) => `${distance}:${count}`)
  .join(", ")}`);

if (failures.length > 0) {
  failures.slice(0, 20).forEach(failure => console.error(`[FAIL] ${failure}`));
  if (failures.length > 20) console.error(`[FAIL] ... ${failures.length - 20} more`);
  process.exit(1);
}

console.log(`[PASS] ${SEED_COUNT} seeds x ${FLOOR_RANGE.length} floors satisfy stairs distance >= ${MIN_DISTANCE}.`);
