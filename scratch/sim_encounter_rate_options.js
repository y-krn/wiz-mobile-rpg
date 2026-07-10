import { EVENT_TYPES, START_X, START_Y } from "../src/data.js";
import { generateRandomMap } from "../src/map_generator.js";

const SEED_COUNT = 100;
const FLOORS = [1, 2, 3, 4, 5];
const DIRS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];

const POLICIES = {
  flat10: ({ light = "none" } = {}) => lightRate(0.10, light),
  flat07: ({ light = "none" } = {}) => lightRate(0.07, light),
  flat06: ({ light = "none" } = {}) => lightRate(0.06, light),
  visitedDecay: ({ wasVisited, light = "none" }) => lightRate(wasVisited ? 0.04 : 0.10, light),
  stepDecay25: ({ stepIndex, light = "none" }) => lightRate(stepIndex <= 25 ? 0.10 : 0.04, light),
  stepDecay30: ({ stepIndex, light = "none" }) => lightRate(stepIndex <= 30 ? 0.10 : 0.04, light)
};

function lightRate(baseRate, light) {
  if (light === "lomilwa") return Math.max(0, baseRate - 0.05);
  if (light === "milwa") return Math.max(0, baseRate - 0.03);
  return baseRate;
}

function coordKey(coord) {
  return `${coord.x},${coord.y}`;
}

function sameCoord(a, b) {
  return a.x === b.x && a.y === b.y;
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

function shortestPath(grid, start, target) {
  if (!start || !target) return null;
  const queue = [start];
  const previous = new Map([[coordKey(start), null]]);

  for (const pos of queue) {
    if (sameCoord(pos, target)) break;
    for (const next of getNeighbors(grid, pos)) {
      const key = coordKey(next);
      if (previous.has(key)) continue;
      previous.set(key, pos);
      queue.push(next);
    }
  }

  const targetKey = coordKey(target);
  if (!previous.has(targetKey)) return null;

  const path = [];
  let current = target;
  while (current && !sameCoord(current, start)) {
    path.push(current);
    current = previous.get(coordKey(current));
  }
  return path.reverse();
}

function shortestDistance(grid, start, target) {
  const path = shortestPath(grid, start, target);
  return path ? path.length : Infinity;
}

function getReachableKeys(grid, start) {
  const queue = [start];
  const reachable = new Set([coordKey(start)]);

  for (const pos of queue) {
    for (const next of getNeighbors(grid, pos)) {
      const key = coordKey(next);
      if (reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }
  return reachable;
}

function getGreedyRoute(grid, start, stops, end) {
  let current = start;
  const route = [];
  const remaining = [...stops];

  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestPath = null;

    remaining.forEach((stop, index) => {
      const path = shortestPath(grid, current, stop);
      if (!path) return;
      if (!bestPath || path.length < bestPath.length) {
        bestIndex = index;
        bestPath = path;
      }
    });

    if (bestIndex === -1) return null;
    route.push(...bestPath);
    current = remaining.splice(bestIndex, 1)[0];
  }

  const finalPath = shortestPath(grid, current, end);
  if (!finalPath) return null;
  route.push(...finalPath);
  return route;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  return {
    mean,
    median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    p10: sorted[Math.floor((sorted.length - 1) * 0.1)],
    p90: sorted[Math.floor((sorted.length - 1) * 0.9)]
  };
}

function format(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function expectedCombats(route, policyName, initiallyVisited = new Set(), light = "none") {
  const visited = new Set(initiallyVisited);
  let expected = 0;
  route.forEach((pos, index) => {
    const key = coordKey(pos);
    expected += POLICIES[policyName]({
      stepIndex: index + 1,
      wasVisited: visited.has(key),
      light
    });
    visited.add(key);
  });
  return expected;
}

function measureFloor(seed, floor, generated) {
  const { grid, stairsDownCoord, bossCoord } = generated;
  const start = floor === 1 ? { x: START_X, y: START_Y } : findCell(grid, cell => cell.type === "stairs-up");
  const down = stairsDownCoord || findCell(grid, cell => cell.type === "stairs-down");
  const midboss = findCell(grid, cell => cell.event === EVENT_TYPES.MIDBOSS || cell.event === "midboss");
  const boss = bossCoord || findCell(grid, cell => cell.event === EVENT_TYPES.BOSS || cell.event === "boss");
  const requiredTargets = [down, floor === 3 ? midboss : null, floor === 5 ? boss : null].filter(Boolean);
  const criticalTarget = requiredTargets
    .map(target => ({ target, distance: shortestDistance(grid, start, target) }))
    .sort((a, b) => b.distance - a.distance)[0]?.target;
  const criticalRoute = shortestPath(grid, start, criticalTarget);
  const reachableKeys = getReachableKeys(grid, start);

  const chests = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].event === EVENT_TYPES.CHEST && reachableKeys.has(`${x},${y}`)) chests.push({ x, y });
    }
  }
  const collectRoute = getGreedyRoute(grid, start, chests, criticalTarget);
  if (!criticalRoute || !collectRoute) {
    throw new Error(`${seed} B${floor}F route unavailable`);
  }

  const knownCriticalVisited = new Set([coordKey(start), ...criticalRoute.map(coordKey)]);
  return {
    floor,
    criticalSteps: criticalRoute.length,
    collectSteps: collectRoute.length,
    collectUniqueSteps: new Set(collectRoute.map(coordKey)).size,
    collectRevisitSteps: collectRoute.length - new Set(collectRoute.map(coordKey)).size,
    policies: Object.fromEntries(Object.keys(POLICIES).map(policyName => [
      policyName,
      {
        critical: expectedCombats(criticalRoute, policyName),
        collect: expectedCombats(collectRoute, policyName),
        knownTransit: expectedCombats(criticalRoute, policyName, knownCriticalVisited),
        collectMilwa: expectedCombats(collectRoute, policyName, new Set(), "milwa"),
        collectLomilwa: expectedCombats(collectRoute, policyName, new Set(), "lomilwa")
      }
    ]))
  };
}

const rows = [];
const errors = [];

for (let i = 0; i < SEED_COUNT; i++) {
  const seed = `encounter-rate-${i}`;
  let parentStairsCoord = null;
  for (const floor of FLOORS) {
    try {
      const generated = generateRandomMap(floor, parentStairsCoord, seed);
      rows.push(measureFloor(seed, floor, generated));
      parentStairsCoord = generated.stairsDownCoord;
    } catch (error) {
      errors.push(error.message);
    }
  }
}

for (const floor of FLOORS) {
  const floorRows = rows.filter(row => row.floor === floor);
  const steps = ["criticalSteps", "collectSteps", "collectUniqueSteps", "collectRevisitSteps"];
  console.log(`\nB${floor}F (${floorRows.length} samples)`);
  steps.forEach(name => {
    const summary = summarize(floorRows.map(row => row[name]));
    console.log(`${name}: mean ${format(summary.mean)} / p10 ${format(summary.p10)} / p90 ${format(summary.p90)}`);
  });
  Object.keys(POLICIES).forEach(policyName => {
    const critical = summarize(floorRows.map(row => row.policies[policyName].critical));
    const collect = summarize(floorRows.map(row => row.policies[policyName].collect));
    const knownTransit = summarize(floorRows.map(row => row.policies[policyName].knownTransit));
    const collectMilwa = summarize(floorRows.map(row => row.policies[policyName].collectMilwa));
    const collectLomilwa = summarize(floorRows.map(row => row.policies[policyName].collectLomilwa));
    console.log(
      `${policyName}: critical ${format(critical.mean)} / collect ${format(collect.mean)} / ` +
      `knownTransit ${format(knownTransit.mean)} / milwaCollect ${format(collectMilwa.mean)} / ` +
      `lomilwaCollect ${format(collectLomilwa.mean)}`
    );
  });
}

if (errors.length > 0) {
  console.error(`\n[FAIL] errors: ${errors.length}`);
  errors.slice(0, 20).forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
