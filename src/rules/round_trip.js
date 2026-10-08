// balance-impact: combat, maps — every run is a round trip (#2066, #2062).
//
// A dungeon is five floors, there is no Portal at the bottom, and the way
// home is back up the stairs the run came down. Once the run turns back (or
// takes the treasure) the dungeon wakes and a hunter follows from below.
/** Player actions between arriving on a floor and the hunter stepping out of the stairs. */
export const HUNTER_ENTRY_DELAY = 6;
/**
 * Cells the hunter covers per player action (a turn in place is an action
 * too). Just under one: a straight walk keeps most of its lead, and every
 * turn, search and detour gives ground (#2069).
 */
export const HUNTER_SPEED = 0.9;
/** Cells the hunter gains for every round the run spends fighting something else. */
export const HUNTER_COMBAT_SPEED = 0.75;
/** Most movement the hunter can save up while the run is held in a fight. */
export const HUNTER_MAX_CARRY = 12;
/** Cells the hunter falls back toward the stairs it came from when the run flees it. */
export const HUNTER_FALL_BACK = 6;
/** Distances (in steps along open corridors) at which the hunter is announced. */
export const HUNTER_ALERT_DISTANCES = Object.freeze([8, 3]);

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/**
 * Every run that starts on a dungeon's first floor is a round trip (#2062).
 * A run saved before then, which has no round-trip state, keeps the old rule.
 */
export function isRoundTripRun(run) {
  return Boolean(run?.roundTrip);
}

/**
 * Where the hunter can walk. It follows open corridors only: no walls (so a
 * secret door the run found is the run's own way out), no one-way step taken
 * backwards, no standing rubble, seals or other blocking obstacles, and never
 * onto stairs or a guardian's cell.
 */
function hunterNeighbors(grid, x, y, isBlockingObstacle) {
  const cell = grid[y]?.[x];
  if (!cell) return [];
  const neighbors = [];
  for (let dir = 0; dir < 4; dir++) {
    if (cell.walls?.[dir]) continue;
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    const next = grid[ny]?.[nx];
    if (!next) continue;
    if (next.type === "stairs-up" || next.type === "stairs-down") continue;
    if (next.event === "boss" || next.event === "midboss") continue;
    if (next.blockEnter?.[(dir + 2) % 4]) continue;
    if (isBlockingObstacle(next)) continue;
    neighbors.push({ x: nx, y: ny });
  }
  return neighbors;
}

/**
 * Distance from `from` to every cell the hunter can reach, breadth first.
 * Returns a Map keyed "x,y" -> { distance, previous }.
 */
export function mapHunterReach(grid, from, isBlockingObstacle = () => false) {
  const reach = new Map([[`${from.x},${from.y}`, { distance: 0, previous: null }]]);
  const queue = [{ x: from.x, y: from.y }];
  while (queue.length > 0) {
    const current = queue.shift();
    const { distance } = reach.get(`${current.x},${current.y}`);
    for (const next of hunterNeighbors(grid, current.x, current.y, isBlockingObstacle)) {
      const key = `${next.x},${next.y}`;
      if (reach.has(key)) continue;
      reach.set(key, { distance: distance + 1, previous: current });
      queue.push(next);
    }
  }
  return reach;
}

/**
 * The hunter's next cell toward the player, and how far it still is.
 * When the player stands somewhere the hunter cannot walk to (on stairs,
 * behind a secret door) it closes in on the nearest cell it can reach.
 * Returns { step: {x, y} | null, distance } with distance Infinity when the
 * player is out of reach.
 */
export function findHunterStep(grid, hunter, player, isBlockingObstacle = () => false) {
  const reach = mapHunterReach(grid, hunter, isBlockingObstacle);
  const playerKey = `${player.x},${player.y}`;
  let goalKey = reach.has(playerKey) ? playerKey : null;
  const distance = goalKey ? reach.get(goalKey).distance : Infinity;
  if (!goalKey) {
    let best = Infinity;
    for (const [key, entry] of reach) {
      const [x, y] = key.split(",").map(Number);
      const gap = Math.abs(x - player.x) + Math.abs(y - player.y);
      // Nearest to the player first; among equals the one the hunter reaches soonest.
      if (gap < best || (gap === best && entry.distance < reach.get(goalKey).distance)) {
        best = gap;
        goalKey = key;
      }
    }
  }
  let cursor = goalKey;
  let step = null;
  while (cursor) {
    const entry = reach.get(cursor);
    if (!entry.previous) break;
    const [x, y] = cursor.split(",").map(Number);
    step = { x, y };
    cursor = `${entry.previous.x},${entry.previous.y}`;
  }
  return { step, distance };
}

/**
 * The hunter's next cell away from the way out: the neighbour that lies
 * farthest from `exit` along the corridors it can walk, if any lies farther
 * than where it stands. Returns { x, y } or null.
 */
export function findHunterStepAway(grid, hunter, exit, isBlockingObstacle = () => false) {
  const field = mapHunterReach(grid, exit, isBlockingObstacle);
  const depth = cell => field.get(`${cell.x},${cell.y}`)?.distance ?? -1;
  let best = null;
  let bestDepth = depth(hunter);
  for (const next of hunterNeighbors(grid, hunter.x, hunter.y, isBlockingObstacle)) {
    if (depth(next) > bestDepth) {
      best = next;
      bestDepth = depth(next);
    }
  }
  return best;
}

/** How many alert distances `distance` has crossed (0 = far away). */
export function getHunterAlertLevel(distance) {
  return HUNTER_ALERT_DISTANCES.filter(limit => distance <= limit).length;
}
