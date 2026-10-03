// Biome traversal gimmicks (#1963).
//
// A traversal obstacle sits on one corridor cell and blocks entering it until
// it is resolved. A lever is a floor switch that opens the seal it names.
// The state lives on the generated grid, so it is saved with the floor and is
// shared by live exploration, map views, roaming monsters, and simulation.
//
//   cell.obstacle = { kind: "rubble", state: "intact" | "cleared", progress, discovered }
//   cell.obstacle = { kind: "seal", id, state: "sealed" | "open", discovered }
//   cell.lever    = { sealId, state: "up" | "pulled", discovered }

import { DX, DY } from "../constants/directions.js";

export const TRAVERSAL_GIMMICKS = Object.freeze({
  RUBBLE: "rubble",
  SEAL: "seal"
});

/** Exploration turns spent digging through one rubble cell. */
export const RUBBLE_CLEAR_TURNS = 3;

export function isTraversalObstacleBlocking(cell) {
  const obstacle = cell?.obstacle;
  if (!obstacle) return false;
  if (obstacle.kind === TRAVERSAL_GIMMICKS.RUBBLE) return obstacle.state !== "cleared";
  if (obstacle.kind === TRAVERSAL_GIMMICKS.SEAL) return obstacle.state !== "open";
  return false;
}

/** A discovered, still-active gimmick that the map views should mark. */
export function getTraversalMarkerKind(cell) {
  if (cell?.obstacle?.discovered && isTraversalObstacleBlocking(cell)) return cell.obstacle.kind;
  if (cell?.lever?.discovered) return cell.lever.state === "pulled" ? "lever-pulled" : "lever";
  return null;
}

/**
 * Mark gimmicks the player can see from (x, y): open-walled neighbors and the
 * cell itself. Returns the newly discovered cells.
 */
export function discoverAdjacentTraversalFeatures(grid, x, y) {
  const found = [];
  const reveal = (cell, cx, cy) => {
    for (const feature of [cell?.obstacle, cell?.lever]) {
      if (feature && !feature.discovered) {
        feature.discovered = true;
        found.push({ x: cx, y: cy, cell });
      }
    }
  };
  const here = grid?.[y]?.[x];
  if (!here) return found;
  reveal(here, x, y);
  for (let dir = 0; dir < 4; dir++) {
    if (here.walls?.[dir]) continue;
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    reveal(grid[ny]?.[nx], nx, ny);
  }
  return found;
}

/**
 * Spend one turn of digging on intact rubble. Returns whether this turn
 * cleared it.
 */
export function advanceRubbleClearing(cell) {
  const obstacle = cell?.obstacle;
  if (obstacle?.kind !== TRAVERSAL_GIMMICKS.RUBBLE || obstacle.state === "cleared") return false;
  obstacle.progress = Math.min(RUBBLE_CLEAR_TURNS, (Number(obstacle.progress) || 0) + 1);
  if (obstacle.progress < RUBBLE_CLEAR_TURNS) return false;
  obstacle.state = "cleared";
  return true;
}

/**
 * Pull the lever standing at (x, y). Returns the seal cells it opened, or
 * null when there is no unpulled lever there.
 */
export function pullLeverAt(grid, x, y) {
  const lever = grid?.[y]?.[x]?.lever;
  if (!lever || lever.state === "pulled") return null;
  lever.state = "pulled";
  lever.discovered = true;
  const opened = [];
  grid.forEach((row, sy) => row.forEach((cell, sx) => {
    const obstacle = cell?.obstacle;
    if (obstacle?.kind !== TRAVERSAL_GIMMICKS.SEAL || obstacle.id !== lever.sealId) return;
    if (obstacle.state !== "open") {
      obstacle.state = "open";
      opened.push({ x: sx, y: sy });
    }
  }));
  return opened;
}

/**
 * Cells the player can walk to from `start` right now: walls, one-way
 * passages, and unresolved obstacles block; undiscovered secret doors stay
 * shut. Used to keep landings and spawns out of sealed or dug-off pockets.
 */
export function collectNaturallyReachableKeys(grid, start) {
  const seen = new Set();
  if (!grid?.[start?.y]?.[start?.x]) return seen;
  seen.add(`${start.x},${start.y}`);
  const queue = [start];
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls?.[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      const nextKey = `${nx},${ny}`;
      if (!next || seen.has(nextKey)) continue;
      if (next.blockEnter?.[(dir + 2) % 4] || isTraversalObstacleBlocking(next)) continue;
      seen.add(nextKey);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}
