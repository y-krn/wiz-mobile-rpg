// Placement of the biome special room on a finished run floor (#1965).
//
// One room per floor, on a quiet cell the player can walk to from the up
// stairs without resolving any gimmick, and off the natural route to the down
// stairs, so reaching it is always a detour. Dead ends are preferred because
// they read as rooms worth a look. Placement uses its own RNG stream and only
// marks an existing empty cell, so the floor layout and every earlier stage
// stay exactly as generated.

import { DX, DY } from "./constants/directions.js";
import { TRAVERSAL_GIMMICKS, isTraversalObstacleBlocking } from "./rules/traversal_gimmicks.js";
import { SPECIAL_ROOM_EVENT } from "./rules/special_rooms.js";

const OPPOSITE = [2, 3, 0, 1];
/** Steps the room must sit away from the natural route. */
export const SPECIAL_ROOM_MIN_DETOUR = 2;
/** Preferred upper bound on the detour, so the side trip fits mobile pacing. */
export const SPECIAL_ROOM_MAX_DETOUR = 10;
const MIN_START_DISTANCE = 4;

const key = (x, y) => `${x},${y}`;

function findCell(grid, type) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.type === type) return { x, y };
    }
  }
  return null;
}

function canStep(grid, from, dir) {
  const cell = grid[from.y]?.[from.x];
  if (!cell || cell.walls[dir]) return null;
  const nx = from.x + DX[dir];
  const ny = from.y + DY[dir];
  const next = grid[ny]?.[nx];
  if (!next || next.blockEnter?.[OPPOSITE[dir]] || isTraversalObstacleBlocking(next)) return null;
  // An intact crumbling ledge falls once crossed, so a room must not rely on it.
  if (next.obstacle?.kind === TRAVERSAL_GIMMICKS.CRUMBLE) return null;
  return { x: nx, y: ny };
}

/** Natural BFS from one or more sources; returns distances and parents. */
function naturalBfs(grid, sources) {
  const distances = new Map();
  const previous = new Map();
  const queue = [];
  sources.forEach(source => {
    distances.set(key(source.x, source.y), 0);
    previous.set(key(source.x, source.y), null);
    queue.push(source);
  });
  for (const pos of queue) {
    for (let dir = 0; dir < 4; dir++) {
      const next = canStep(grid, pos, dir);
      if (!next || distances.has(key(next.x, next.y))) continue;
      distances.set(key(next.x, next.y), distances.get(key(pos.x, pos.y)) + 1);
      previous.set(key(next.x, next.y), pos);
      queue.push(next);
    }
  }
  return { distances, previous };
}

function naturalRoute(grid, start, target) {
  const { previous } = naturalBfs(grid, [start]);
  if (!previous.has(key(target.x, target.y))) return [];
  const route = [];
  for (let pos = target; pos; pos = previous.get(key(pos.x, pos.y))) route.unshift(pos);
  return route;
}

function isQuietRoomCell(cell) {
  if (!cell || cell.type !== "empty" || cell.event || cell.trap) return false;
  if (cell.obstacle || cell.lever || cell.hazard) return false;
  if (cell.blockEnter?.some(Boolean) || cell.secretDoor?.some(Boolean)) return false;
  return cell.walls.some(wall => !wall);
}

/** Candidate cells with their detour from the natural route. */
export function collectSpecialRoomCandidates(grid) {
  const start = findCell(grid, "stairs-up");
  const goal = findCell(grid, "stairs-down");
  if (!start || !goal) return [];
  const fromStart = naturalBfs(grid, [start]).distances;
  const route = naturalRoute(grid, start, goal);
  if (route.length === 0) return [];
  const fromRoute = naturalBfs(grid, route).distances;
  const candidates = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    const cellKey = key(x, y);
    if (!isQuietRoomCell(cell) || !fromStart.has(cellKey)) return;
    if (fromStart.get(cellKey) < MIN_START_DISTANCE) return;
    const detour = fromRoute.get(cellKey) ?? 0;
    const deadEnd = cell.walls.filter(wall => !wall).length === 1;
    candidates.push({ x, y, detour, deadEnd });
  }));
  return candidates;
}

/**
 * Place the floor's special room. Returns the placed room's position and
 * detour, or null when no cell qualifies.
 */
export function placeSpecialRoom(grid, { kind, rng }) {
  if (!kind) return null;
  const candidates = collectSpecialRoomCandidates(grid)
    .filter(candidate => candidate.detour >= SPECIAL_ROOM_MIN_DETOUR);
  if (candidates.length === 0) return null;
  // Prefer a dead end within the pacing bound; widen only when none exists.
  const near = candidates.filter(candidate => candidate.detour <= SPECIAL_ROOM_MAX_DETOUR);
  const bounded = near.length > 0 ? near : candidates;
  const deadEnds = bounded.filter(candidate => candidate.deadEnd);
  const pool = deadEnds.length > 0 ? deadEnds : bounded;
  const chosen = pool[Math.floor(rng() * pool.length) % pool.length];
  const cell = grid[chosen.y][chosen.x];
  cell.event = SPECIAL_ROOM_EVENT;
  cell.specialRoom = { kind, used: false, discovered: false };
  return { kind, x: chosen.x, y: chosen.y, detour: chosen.detour };
}
