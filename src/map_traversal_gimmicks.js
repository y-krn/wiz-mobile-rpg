// Placement of biome traversal gimmicks on a finished run floor (#1963).
//
// Gimmicks never decide whether a floor can be finished: every required cell
// stays reachable with each obstacle still in place, and the natural route to
// the stairs stays inside the depth template's critical-path envelope.
//
// - Rubble blocks a corridor cell whose detour costs several steps, so the
//   player chooses between digging (turns and noise) and walking around.
// - A seal closes the only way into a small dead-end branch that holds a
//   chest; a lever elsewhere on the floor opens it, so exploration order
//   decides whether the branch is worth the trip.
// - A crumbling ledge is a one-use shortcut: it falls once crossed, and the
//   floor stays finishable from either side.
// - Flooded cells slow a stretch of the route; a dry detour always exists.
// - Heat vents on the route burn on a visible cycle.
// - Spinners hide on route junctions and turn the player around.

import { DX, DY } from "./constants/directions.js";
import { HEAT_CYCLE_TURNS, TRAVERSAL_GIMMICKS, isTraversalObstacleBlocking } from "./rules/traversal_gimmicks.js";

const OPPOSITE = [2, 3, 0, 1];
const RUBBLE_MIN_DETOUR = 4;
const SEAL_REGION_SIZE = [1, 14];
const LEVER_MIN_DISTANCE = 6;
const LEVER_MIN_GATE_SPACING = 5;
const FLOOD_MAX_DRY_DETOUR = 24;

const key = (x, y) => `${x},${y}`;

function isPassage(cell) {
  return Boolean(cell?.walls?.some(wall => !wall));
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (predicate(grid[y][x])) return { x, y };
    }
  }
  return null;
}

/**
 * Directed BFS distances honoring walls, one-way passages, and obstacles.
 * `reveal` treats secret doors and obstacles as passable, like validation.
 */
function distancesFrom(grid, start, { blocked = new Set(), reveal = false } = {}) {
  const distances = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    for (let dir = 0; dir < 4; dir++) {
      const open = !cell.walls[dir] || (reveal && cell.secretDoor?.[dir]);
      if (!open) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      const nextKey = key(nx, ny);
      if (!next || distances.has(nextKey) || blocked.has(nextKey)) continue;
      if (next.blockEnter?.[OPPOSITE[dir]]) continue;
      if (!reveal && isTraversalObstacleBlocking(next)) continue;
      distances.set(nextKey, distances.get(key(pos.x, pos.y)) + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return distances;
}

function openDirs(cell) {
  return cell.walls.map((wall, dir) => (wall ? -1 : dir)).filter(dir => dir !== -1);
}

function isQuietCell(grid, x, y, start) {
  const cell = grid[y]?.[x];
  if (!cell || cell.type !== "empty" || cell.event || cell.trap || cell.obstacle || cell.lever || cell.hazard) return false;
  if (cell.blockEnter?.some(Boolean) || cell.secretDoor?.some(Boolean)) return false;
  return Math.abs(x - start.x) + Math.abs(y - start.y) > 2;
}

/** Natural shortest route from start to target, as coordinates. */
function shortestRoute(grid, start, target) {
  const previous = new Map([[key(start.x, start.y), null]]);
  const queue = [start];
  for (const pos of queue) {
    if (pos.x === target.x && pos.y === target.y) break;
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      if (!next || previous.has(key(nx, ny)) || next.blockEnter?.[OPPOSITE[dir]] || isTraversalObstacleBlocking(next)) continue;
      previous.set(key(nx, ny), pos);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!previous.has(key(target.x, target.y))) return [];
  const route = [];
  for (let pos = target; pos; pos = previous.get(key(pos.x, pos.y))) route.unshift(pos);
  return route;
}

function requiredFacilityKeys(grid) {
  const keys = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.type === "stairs-down" || (cell.event && cell.event !== "chest")) keys.push(key(x, y));
  }));
  return keys;
}

function isQuietCorridorCell(grid, x, y, start) {
  const cell = grid[y]?.[x];
  if (!cell || cell.type !== "empty" || cell.event || cell.trap || cell.obstacle || cell.lever || cell.hazard) return false;
  if (cell.blockEnter?.some(Boolean) || cell.secretDoor?.some(Boolean)) return false;
  if (Math.abs(x - start.x) + Math.abs(y - start.y) <= 2) return false;
  const dirs = openDirs(cell);
  if (dirs.length !== 2) return false;
  return dirs.every(dir => {
    const next = grid[y + DY[dir]]?.[x + DX[dir]];
    return next && !next.blockEnter?.[OPPOSITE[dir]] && !next.obstacle;
  });
}

function collectWalkableKeys(grid) {
  const keys = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (isPassage(cell)) keys.push(key(x, y));
  }));
  return keys;
}

function shuffled(values, rng) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function placeRubble(grid, context, rng) {
  const { start, stairs, criticalPathRange } = context;
  const walkable = collectWalkableKeys(grid);
  const baseDistances = distancesFrom(grid, start);
  const baseCritical = baseDistances.get(key(stairs.x, stairs.y));
  const candidates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!isQuietCorridorCell(grid, x, y, start)) return;
    const cellKey = key(x, y);
    const blocked = new Set([cellKey]);
    const revealed = distancesFrom(grid, start, { blocked, reveal: true });
    if (walkable.some(walkKey => walkKey !== cellKey && !revealed.has(walkKey))) return;
    const natural = distancesFrom(grid, start, { blocked });
    const critical = natural.get(key(stairs.x, stairs.y));
    if (!Number.isFinite(critical) || critical < criticalPathRange[0] || critical > criticalPathRange[1]) return;
    const [a, b] = openDirs(cell).map(dir => ({ x: x + DX[dir], y: y + DY[dir] }));
    const aToB = distancesFrom(grid, a, { blocked }).get(key(b.x, b.y));
    const bToA = distancesFrom(grid, b, { blocked }).get(key(a.x, a.y));
    if (!Number.isFinite(aToB) || !Number.isFinite(bToA)) return;
    const detour = Math.min(aToB, bToA);
    if (detour < RUBBLE_MIN_DETOUR) return;
    candidates.push({ x, y, onRoute: critical > baseCritical, detour });
  }));
  if (candidates.length === 0) return null;
  const onRoute = candidates.filter(candidate => candidate.onRoute);
  const pool = onRoute.length > 0 ? onRoute : candidates;
  const chosen = pool[Math.floor(rng() * pool.length)];
  grid[chosen.y][chosen.x].obstacle = {
    kind: TRAVERSAL_GIMMICKS.RUBBLE,
    state: "intact",
    progress: 0,
    discovered: false
  };
  return { kind: TRAVERSAL_GIMMICKS.RUBBLE, x: chosen.x, y: chosen.y, detour: chosen.detour, onRoute: chosen.onRoute };
}

function placeSeal(grid, context, rng) {
  const { start, stairs, floor } = context;
  const walkable = collectWalkableKeys(grid);
  const stairsKey = key(stairs.x, stairs.y);
  const baseCritical = distancesFrom(grid, start).get(stairsKey);
  const gates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!isQuietCorridorCell(grid, x, y, start)) return;
    const gateKey = key(x, y);
    const outside = distancesFrom(grid, start, { blocked: new Set([gateKey]), reveal: true });
    const region = walkable.filter(walkKey => walkKey !== gateKey && !outside.has(walkKey));
    if (region.length < SEAL_REGION_SIZE[0] || region.length > SEAL_REGION_SIZE[1]) return;
    const regionCells = region.map(regionKey => {
      const [rx, ry] = regionKey.split(",").map(Number);
      return grid[ry][rx];
    });
    if (regionCells.some(regionCell =>
      regionCell.type !== "empty" || (regionCell.event && regionCell.event !== "chest") ||
      regionCell.obstacle || regionCell.lever
    )) return;
    if (!regionCells.some(regionCell => regionCell.event === "chest")) return;
    if (region.includes(key(stairs.x, stairs.y))) return;
    gates.push({ x, y, outside });
  }));
  for (const gate of shuffled(gates, rng)) {
    const natural = distancesFrom(grid, start, { blocked: new Set([key(gate.x, gate.y)]) });
    // One-way passages can make a sealed branch part of the route out; the
    // seal must only close a side branch, never lengthen the way to the stairs.
    if (natural.get(stairsKey) !== baseCritical) continue;
    const levers = [];
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (!natural.has(key(x, y)) || natural.get(key(x, y)) < LEVER_MIN_DISTANCE) return;
      if (cell.type !== "empty" || cell.event || cell.trap || cell.obstacle || cell.lever) return;
      if (openDirs(cell).length !== 1) return;
      if (Math.abs(x - gate.x) + Math.abs(y - gate.y) < LEVER_MIN_GATE_SPACING) return;
      levers.push({ x, y });
    }));
    if (levers.length === 0) continue;
    const lever = levers[Math.floor(rng() * levers.length)];
    const id = `seal_B${floor}_${gate.x}_${gate.y}`;
    grid[gate.y][gate.x].obstacle = { kind: TRAVERSAL_GIMMICKS.SEAL, id, state: "sealed", discovered: false };
    grid[lever.y][lever.x].lever = { sealId: id, state: "up", discovered: false };
    return { kind: TRAVERSAL_GIMMICKS.SEAL, x: gate.x, y: gate.y, lever: { x: lever.x, y: lever.y } };
  }
  return null;
}

function placeCrumble(grid, context, rng) {
  const { start, stairs, criticalPathRange, fallen = new Set() } = context;
  const walkable = collectWalkableKeys(grid);
  const required = requiredFacilityKeys(grid);
  const baseCritical = distancesFrom(grid, start).get(key(stairs.x, stairs.y));
  const candidates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!isQuietCorridorCell(grid, x, y, start)) return;
    const cellKey = key(x, y);
    if (fallen.has(cellKey)) return;
    const blocked = new Set([...fallen, cellKey]);
    const revealed = distancesFrom(grid, start, { blocked, reveal: true });
    if (walkable.some(walkKey => !blocked.has(walkKey) && !revealed.has(walkKey))) return;
    const natural = distancesFrom(grid, start, { blocked });
    const critical = natural.get(key(stairs.x, stairs.y));
    if (!Number.isFinite(critical) || critical < criticalPathRange[0] || critical > criticalPathRange[1]) return;
    // Once fallen, the player may stand on either side: both must still reach
    // the stairs and every facility on foot.
    // The way back is walked too (#2062): either side must also reach both
    // stairs, through one-way passages, with every placed ledge down.
    const sides = openDirs(cell).map(dir => ({ x: x + DX[dir], y: y + DY[dir] }));
    const mustReach = [...required, key(start.x, start.y), key(stairs.x, stairs.y)];
    for (const side of sides) {
      const fromSide = distancesFrom(grid, side, { blocked });
      if (!mustReach.every(requiredKey => fromSide.has(requiredKey))) return;
    }
    const [a, b] = sides;
    const detour = distancesFrom(grid, a, { blocked }).get(key(b.x, b.y));
    if (!Number.isFinite(detour) || detour < RUBBLE_MIN_DETOUR) return;
    candidates.push({ x, y, onRoute: critical > baseCritical, detour });
  }));
  if (candidates.length === 0) return null;
  const onRoute = candidates.filter(candidate => candidate.onRoute);
  const pool = onRoute.length > 0 ? onRoute : candidates;
  const chosen = pool[Math.floor(rng() * pool.length)];
  grid[chosen.y][chosen.x].obstacle = { kind: TRAVERSAL_GIMMICKS.CRUMBLE, state: "intact", discovered: false };
  fallen.add(key(chosen.x, chosen.y));
  return { kind: TRAVERSAL_GIMMICKS.CRUMBLE, x: chosen.x, y: chosen.y, detour: chosen.detour, onRoute: chosen.onRoute };
}

/** Contiguous runs of quiet cells along the natural route. */
function routeRuns(grid, context, length) {
  const route = shortestRoute(grid, context.start, context.stairs);
  const runs = [];
  for (let index = 1; index + length < route.length; index++) {
    const run = route.slice(index, index + length);
    if (run.every(({ x, y }) => isQuietCell(grid, x, y, context.start))) runs.push({ index, cells: run });
  }
  return runs;
}

function placeFlood(grid, context, rng) {
  const { start, stairs } = context;
  const stairsKey = key(stairs.x, stairs.y);
  const baseCritical = distancesFrom(grid, start).get(stairsKey);
  for (const length of [4, 3, 2]) {
    const valid = routeRuns(grid, context, length).filter(({ cells }) => {
      // Water is walkable, so nothing is cut off; it only needs a dry way round.
      const blocked = new Set(cells.map(({ x, y }) => key(x, y)));
      const dry = distancesFrom(grid, start, { blocked }).get(stairsKey);
      // The dry way around must exist and cost something; wading stays the
      // natural route, so the detour may run long.
      return Number.isFinite(dry) && dry > baseCritical && dry <= baseCritical + FLOOD_MAX_DRY_DETOUR;
    });
    if (valid.length === 0) continue;
    const chosen = valid[Math.floor(rng() * valid.length)];
    chosen.cells.forEach(({ x, y }) => {
      grid[y][x].hazard = { kind: TRAVERSAL_GIMMICKS.FLOOD, discovered: false };
    });
    return { kind: TRAVERSAL_GIMMICKS.FLOOD, cells: chosen.cells, dryRoute: true };
  }
  // Without a dry way round the water still only costs turns, never access.
  const fallback = routeRuns(grid, context, 3);
  if (fallback.length === 0) return null;
  const chosen = fallback[Math.floor(rng() * fallback.length)];
  chosen.cells.forEach(({ x, y }) => {
    grid[y][x].hazard = { kind: TRAVERSAL_GIMMICKS.FLOOD, discovered: false };
  });
  return { kind: TRAVERSAL_GIMMICKS.FLOOD, cells: chosen.cells, dryRoute: false };
}

function placeHeat(grid, context, rng) {
  const runs = routeRuns(grid, context, 2);
  if (runs.length === 0) return null;
  const chosen = runs[Math.floor(rng() * runs.length)];
  const length = chosen.cells.length;
  const phase = Math.floor(rng() * HEAT_CYCLE_TURNS);
  chosen.cells.forEach(({ x, y }) => {
    grid[y][x].hazard = { kind: TRAVERSAL_GIMMICKS.HEAT, phase, hot: false, discovered: false };
  });
  return { kind: TRAVERSAL_GIMMICKS.HEAT, cells: chosen.cells, phase, length };
}

function placeSpinner(grid, context, rng) {
  const { start } = context;
  const routeKeys = new Set(shortestRoute(grid, context.start, context.stairs).map(({ x, y }) => key(x, y)));
  const reachable = distancesFrom(grid, start);
  const candidates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!isQuietCell(grid, x, y, start) || !reachable.has(key(x, y))) return;
    if (openDirs(cell).length < 3 || reachable.get(key(x, y)) < 4) return;
    const tooClose = grid.some((otherRow, oy) => otherRow.some((other, ox) =>
      other.hazard?.kind === TRAVERSAL_GIMMICKS.SPINNER && Math.abs(ox - x) + Math.abs(oy - y) < 6));
    if (!tooClose) candidates.push({ x, y, onRoute: routeKeys.has(key(x, y)) });
  }));
  if (candidates.length === 0) return null;
  const onRoute = candidates.filter(candidate => candidate.onRoute);
  const pool = onRoute.length > 0 ? onRoute : candidates;
  const chosen = pool[Math.floor(rng() * pool.length)];
  grid[chosen.y][chosen.x].hazard = { kind: TRAVERSAL_GIMMICKS.SPINNER, discovered: false };
  return { kind: TRAVERSAL_GIMMICKS.SPINNER, x: chosen.x, y: chosen.y, onRoute: chosen.onRoute };
}

const PLACERS = Object.freeze({
  [TRAVERSAL_GIMMICKS.RUBBLE]: placeRubble,
  [TRAVERSAL_GIMMICKS.CRUMBLE]: placeCrumble,
  [TRAVERSAL_GIMMICKS.FLOOD]: placeFlood,
  [TRAVERSAL_GIMMICKS.HEAT]: placeHeat,
  [TRAVERSAL_GIMMICKS.SPINNER]: placeSpinner
});

/**
 * Place the biome's traversal gimmick on a generated run floor. `floorInBiome`
 * is 0 on the biome's first floor; later floors may carry a second rubble.
 */
export function placeTraversalGimmicks(grid, { kind, floor, floorInBiome = 0, criticalPathRange, rng, count: countOverride = null }) {
  if (!kind) return [];
  const start = findCell(grid, cell => cell.type === "stairs-up");
  const stairs = findCell(grid, cell => cell.type === "stairs-down");
  if (!start || !stairs) return [];
  // `fallen` holds the ledges already placed: a later one is checked with
  // all of them down, so the floor stays finishable however many fall.
  const context = { start, stairs, floor, criticalPathRange: criticalPathRange || [0, Infinity], fallen: new Set() };
  const placed = [];
  if (PLACERS[kind]) {
    // The biome's first floor introduces one instance; later floors add another.
    const count = Number.isInteger(countOverride) && countOverride > 0 ? countOverride : floorInBiome >= 2 ? 2 : 1;
    for (let index = 0; index < count; index++) {
      const result = PLACERS[kind](grid, context, rng);
      if (result) placed.push(result);
    }
  } else if (kind === TRAVERSAL_GIMMICKS.SEAL) {
    const result = placeSeal(grid, context, rng);
    if (result) placed.push(result);
  }
  return placed;
}
