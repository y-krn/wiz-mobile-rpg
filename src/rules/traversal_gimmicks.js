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
//   cell.obstacle = { kind: "crumble", state: "intact" | "collapsed", discovered }
//   cell.hazard   = { kind: "flood" | "heat" | "spinner", phase?, hot?, discovered }
//
// Obstacles block entering; hazards are walkable and act when stepped on.

import { DX, DY } from "../constants/directions.js";

export const TRAVERSAL_GIMMICKS = Object.freeze({
  RUBBLE: "rubble",
  SEAL: "seal",
  CRUMBLE: "crumble",
  FLOOD: "flood",
  HEAT: "heat",
  SPINNER: "spinner"
});

/** Heat vents are hot for HEAT_ACTIVE_TURNS of every HEAT_CYCLE_TURNS turns. */
export const HEAT_CYCLE_TURNS = 4;
export const HEAT_ACTIVE_TURNS = 2;
/** Share of max HP a hot vent burns. */
export const HEAT_DAMAGE_RATE = 0.12;

/** Exploration turns spent digging through one rubble cell. */
export const RUBBLE_CLEAR_TURNS = 3;

export function isTraversalObstacleBlocking(cell) {
  const obstacle = cell?.obstacle;
  if (!obstacle) return false;
  if (obstacle.kind === TRAVERSAL_GIMMICKS.RUBBLE) return obstacle.state !== "cleared";
  if (obstacle.kind === TRAVERSAL_GIMMICKS.SEAL) return obstacle.state !== "open";
  if (obstacle.kind === TRAVERSAL_GIMMICKS.CRUMBLE) return obstacle.state === "collapsed";
  return false;
}

export function isHeatActive(hazard, turn) {
  if (hazard?.kind !== TRAVERSAL_GIMMICKS.HEAT) return false;
  const cycle = ((Math.floor(Number(turn) || 0) + (Number(hazard.phase) || 0)) % HEAT_CYCLE_TURNS + HEAT_CYCLE_TURNS) % HEAT_CYCLE_TURNS;
  return cycle < HEAT_ACTIVE_TURNS;
}

export function getHeatDamage(maxHp) {
  return Math.max(1, Math.ceil((Number(maxHp) || 1) * HEAT_DAMAGE_RATE));
}

/** Refresh the `hot` flag on heat vents for the map views. Returns whether any changed. */
export function refreshHeatHazards(grid, turn) {
  let changed = false;
  grid?.forEach(row => row?.forEach(cell => {
    const hazard = cell?.hazard;
    if (hazard?.kind !== TRAVERSAL_GIMMICKS.HEAT) return;
    const hot = isHeatActive(hazard, turn);
    if (hazard.hot !== hot) {
      hazard.hot = hot;
      changed = true;
    }
  }));
  return changed;
}

/** Facing after a spinner: always different from `dir`, deterministic per cell and turn. */
export function getSpinnerFacing(x, y, turn, dir) {
  const offset = 1 + ((x * 7 + y * 13 + Math.floor(Number(turn) || 0)) % 3);
  return (dir + offset) % 4;
}

/** Collapse an intact crumbling ledge at (x, y). Returns whether it fell. */
export function collapseCrumbleAt(grid, x, y) {
  const obstacle = grid?.[y]?.[x]?.obstacle;
  if (obstacle?.kind !== TRAVERSAL_GIMMICKS.CRUMBLE || obstacle.state !== "intact") return false;
  obstacle.state = "collapsed";
  obstacle.discovered = true;
  return true;
}

/** A discovered, still-active gimmick that the map views should mark. */
export function getTraversalMarkerKind(cell) {
  const obstacle = cell?.obstacle;
  if (obstacle?.discovered && obstacle.kind === TRAVERSAL_GIMMICKS.CRUMBLE) {
    return obstacle.state === "collapsed" ? "crumble-collapsed" : "crumble";
  }
  if (obstacle?.discovered && isTraversalObstacleBlocking(cell)) return obstacle.kind;
  if (cell?.lever?.discovered) return cell.lever.state === "pulled" ? "lever-pulled" : "lever";
  if (cell?.hazard?.discovered) return cell.hazard.kind;
  return null;
}

/**
 * Mark gimmicks the player can see from (x, y): open-walled neighbors and the
 * cell itself. Returns the newly discovered cells.
 */
export function discoverAdjacentTraversalFeatures(grid, x, y) {
  const found = [];
  const reveal = (cell, cx, cy, standing = false) => {
    // Spinners cannot be seen; the player learns them by stepping on one.
    const hazard = cell?.hazard?.kind === TRAVERSAL_GIMMICKS.SPINNER && !standing ? null : cell?.hazard;
    for (const feature of [cell?.obstacle, cell?.lever, hazard]) {
      if (feature && !feature.discovered) {
        feature.discovered = true;
        found.push({ x: cx, y: cy, cell });
      }
    }
  };
  const here = grid?.[y]?.[x];
  if (!here) return found;
  reveal(here, x, y, true);
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
