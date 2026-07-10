import { EVENT_TYPES, START_X, START_Y, TRAP_TYPES } from "../src/data.js";
import { generateRandomMap } from "../src/map_generator.js";

const SEED_COUNT = 100;
const FLOORS = [1, 2, 3, 4, 5];
const DIRS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

const TARGETS = {
  reachableCells: { min: 20, max: 30 },
  gimmicksTotal: { min: 1, max: 2 },
  criticalExpectedCombats: { min: 5, max: 6 },
  avoidTargets: { min: 0, max: 1 }
};

function coordKey(coord) {
  return `${coord.x},${coord.y}`;
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x], x, y)) return { x, y };
    }
  }
  return null;
}

function getNeighbors(grid, pos) {
  const cell = grid[pos.y]?.[pos.x];
  if (!cell) return [];

  return DIRS.flatMap(({ dx, dy, dir }) => {
    if (cell.walls[dir]) return [];
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    const next = grid[ny]?.[nx];
    if (!next) return [];
    if (next.blockEnter?.[(dir + 2) % 4]) return [];
    return [{ x: nx, y: ny }];
  });
}

function getDistances(grid, start) {
  const queue = [{ ...start, dist: 0 }];
  const distances = new Map([[coordKey(start), 0]]);

  for (const pos of queue) {
    for (const next of getNeighbors(grid, pos)) {
      const key = coordKey(next);
      if (distances.has(key)) continue;
      const dist = pos.dist + 1;
      distances.set(key, dist);
      queue.push({ ...next, dist });
    }
  }

  return distances;
}

function shortestDistance(grid, start, target) {
  if (!start || !target) return Infinity;
  const distances = getDistances(grid, start);
  return distances.get(coordKey(target)) ?? Infinity;
}

function countReachableDeadEnds(grid, reachableKeys) {
  let count = 0;
  for (const key of reachableKeys) {
    const [x, y] = key.split(",").map(Number);
    const cell = grid[y]?.[x];
    if (!cell) continue;
    const openCount = cell.walls.filter(wall => !wall).length;
    if (openCount === 1) count++;
  }
  return count;
}

function countCells(grid, predicate) {
  let count = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x], x, y)) count++;
    }
  }
  return count;
}

function countDirectionalFlags(grid, field) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      count += cell[field]?.filter(Boolean).length ?? 0;
    }
  }
  return count;
}

function getGreedyRouteDistance(grid, start, stops, end) {
  let current = start;
  let total = 0;
  const remaining = [...stops];

  while (remaining.length > 0) {
    const distances = getDistances(grid, current);
    let bestIndex = -1;
    let bestDistance = Infinity;

    remaining.forEach((stop, index) => {
      const distance = distances.get(coordKey(stop)) ?? Infinity;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex === -1 || !Number.isFinite(bestDistance)) return Infinity;
    total += bestDistance;
    current = remaining.splice(bestIndex, 1)[0];
  }

  const finalDistance = shortestDistance(grid, current, end);
  if (!Number.isFinite(finalDistance)) return Infinity;
  return total + finalDistance;
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return NaN;
  const index = Math.floor((sortedValues.length - 1) * ratio);
  return sortedValues[index];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    mean,
    median,
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9)
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "inf";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSummary(summary) {
  return `mean ${formatNumber(summary.mean)} / median ${formatNumber(summary.median)} / p10 ${formatNumber(summary.p10)} / p90 ${formatNumber(summary.p90)}`;
}

function judge(summary, target) {
  if (summary.p90 < target.min) return "LOW";
  if (summary.p10 > target.max) return "HIGH";
  if (summary.mean < target.min || summary.mean > target.max) return "MIXED";
  return "OK";
}

function generateDungeon(seed) {
  const floors = [];
  let parentStairsCoord = null;
  for (const floor of FLOORS) {
    const generated = generateRandomMap(floor, parentStairsCoord, seed);
    floors.push({ floor, ...generated });
    parentStairsCoord = generated.stairsDownCoord;
  }
  return floors;
}

function measureFloor(seed, generated) {
  const { floor, grid, stairsDownCoord, bossCoord } = generated;
  const start = floor === 1 ? { x: START_X, y: START_Y } : findCell(grid, cell => cell.type === "stairs-up");
  if (!start) throw new Error(`B${floor}F start not found`);

  const distances = getDistances(grid, start);
  const reachableKeys = new Set(distances.keys());
  const down = stairsDownCoord || findCell(grid, cell => cell.type === "stairs-down");
  const midboss = findCell(grid, cell => cell.event === EVENT_TYPES.MIDBOSS || cell.event === "midboss");
  const boss = bossCoord || findCell(grid, cell => cell.event === EVENT_TYPES.BOSS || cell.event === "boss");
  const requiredTargets = [down, floor === 3 ? midboss : null, floor === 5 ? boss : null].filter(Boolean);
  const requiredDistances = requiredTargets.map(target => distances.get(coordKey(target)) ?? Infinity);
  const criticalPath = Math.max(...requiredDistances);

  const chests = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].event === EVENT_TYPES.CHEST && reachableKeys.has(`${x},${y}`)) chests.push({ x, y });
    }
  }
  const routeEnd = down || boss;
  const routeCollectPath = routeEnd ? getGreedyRouteDistance(grid, start, chests, routeEnd) : Infinity;
  const oneWayCount = countDirectionalFlags(grid, "blockEnter");
  const secretDoorCount = countDirectionalFlags(grid, "secretDoor") / 2;
  const pitfallCount = countCells(grid, cell => cell.trap?.type === TRAP_TYPES.PITFALL);
  const trapCount = countCells(grid, cell => cell.trap);
  const eventCounts = {
    chest: countCells(grid, cell => cell.event === EVENT_TYPES.CHEST),
    spring: countCells(grid, cell => cell.event === EVENT_TYPES.SPRING),
    tablet: countCells(grid, cell => cell.event === EVENT_TYPES.TABLET),
    merchant: countCells(grid, cell => cell.event === EVENT_TYPES.MERCHANT)
  };
  const reachableEventCounts = {
    reachableChest: 0,
    reachableSpring: 0,
    reachableTablet: 0,
    reachableMerchant: 0
  };
  for (const key of reachableKeys) {
    const [x, y] = key.split(",").map(Number);
    const event = grid[y]?.[x]?.event;
    if (event === EVENT_TYPES.CHEST) reachableEventCounts.reachableChest++;
    if (event === EVENT_TYPES.SPRING) reachableEventCounts.reachableSpring++;
    if (event === EVENT_TYPES.TABLET) reachableEventCounts.reachableTablet++;
    if (event === EVENT_TYPES.MERCHANT) reachableEventCounts.reachableMerchant++;
  }

  const errors = [];
  requiredTargets.forEach((target, index) => {
    if (!Number.isFinite(requiredDistances[index])) {
      errors.push(`${seed} B${floor}F required target unreachable at ${coordKey(target)}`);
    }
  });
  if (
    reachableEventCounts.reachableChest !== 6 ||
    reachableEventCounts.reachableSpring !== 2 ||
    reachableEventCounts.reachableTablet !== 2 ||
    reachableEventCounts.reachableMerchant !== 1
  ) {
    errors.push(`${seed} B${floor}F reachable fixed event count mismatch ${JSON.stringify(reachableEventCounts)}`);
  }
  if (trapCount !== 6 + floor) {
    errors.push(`${seed} B${floor}F trap count mismatch ${trapCount} !== ${6 + floor}`);
  }

  return {
    floor,
    reachableCells: reachableKeys.size,
    criticalPath,
    routeCollectPath,
    criticalExpectedCombats: criticalPath * 0.10,
    criticalLightCombats: criticalPath * 0.07,
    criticalLomilwaCombats: criticalPath * 0.05,
    routeExpectedCombats: routeCollectPath * 0.10,
    routeLightCombats: routeCollectPath * 0.07,
    routeLomilwaCombats: routeCollectPath * 0.05,
    oneWayCount,
    secretDoorCount,
    pitfallCount,
    gimmicksTotal: oneWayCount + secretDoorCount + pitfallCount,
    trapCount,
    deadEnds: countReachableDeadEnds(grid, reachableKeys),
    avoidTargets: (floor >= 4 ? 1 : 0) + (floor === 3 ? 1 : 0) + (floor === 5 ? 1 : 0),
    ...eventCounts,
    ...reachableEventCounts,
    errors
  };
}

const metricsByFloor = new Map(FLOORS.map(floor => [floor, []]));
const errors = [];

for (let i = 0; i < SEED_COUNT; i++) {
  const seed = `density-audit-${i}`;
  try {
    const dungeon = generateDungeon(seed);
    dungeon.forEach(generated => {
      const metrics = measureFloor(seed, generated);
      metricsByFloor.get(metrics.floor).push(metrics);
      errors.push(...metrics.errors);
    });
  } catch (error) {
    errors.push(`${seed} ${error.message}`);
  }
}

const metricNames = [
  "reachableCells",
  "criticalPath",
  "routeCollectPath",
  "criticalExpectedCombats",
  "criticalLightCombats",
  "criticalLomilwaCombats",
  "routeExpectedCombats",
  "routeLightCombats",
  "routeLomilwaCombats",
  "oneWayCount",
  "secretDoorCount",
  "pitfallCount",
  "gimmicksTotal",
  "trapCount",
  "deadEnds",
  "reachableChest",
  "reachableSpring",
  "reachableTablet",
  "reachableMerchant",
  "chest",
  "spring",
  "tablet",
  "merchant",
  "avoidTargets"
];

for (const floor of FLOORS) {
  const rows = metricsByFloor.get(floor);
  console.log(`\nB${floor}F (${rows.length} samples)`);
  for (const metricName of metricNames) {
    const summary = summarize(rows.map(row => row[metricName]));
    const target = TARGETS[metricName];
    const suffix = target ? ` [${judge(summary, target)} target ${target.min}-${target.max}]` : "";
    console.log(`${metricName}: ${formatSummary(summary)}${suffix}`);
  }
}

if (errors.length > 0) {
  console.error(`\n[FAIL] anomalies: ${errors.length}`);
  errors.slice(0, 20).forEach(error => console.error(`- ${error}`));
  if (errors.length > 20) console.error(`... ${errors.length - 20} more`);
  process.exit(1);
}

console.log("\nanomalies: 0");
