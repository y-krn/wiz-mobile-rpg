// The sunken library's rule (#2063): the longer the run stays on a floor, the
// more of it lies under water. Flooded cells already slow a step by a turn
// (#1963); here the water spreads one ring from every flooded cell each time
// the floor's turn count passes another `riseEvery`, up to `maxRises`. Water
// is walkable, so it never cuts a way off; stairs, rooms, and the guardian
// stay dry. The floor keeps its water for the way back, and the turns spent on
// it then count on.
//
// Since #2105 the water also deepens: water that has stood through
// `WATER_RISES_PER_DEPTH` rises gets one step deeper (shallow, knee, deep),
// and a step in deep water costs a share of max HP. A closed chest the water reaches sinks, and what was in it
// is lost.
import { DX, DY } from "../constants/directions.js";
import { getDungeonRule } from "../rules/dungeons.js";
import { TRAVERSAL_GIMMICKS } from "../rules/traversal_gimmicks.js";

const OPPOSITE = [2, 3, 0, 1];

export const WATER_MAX_DEPTH = 3;
export const WATER_DEPTH_LABELS = Object.freeze(["", "浅い", "膝まで", "深い"]);
export const DEEP_WATER_DAMAGE_RATE = 0.015;
// Rises a cell must stand under water before it deepens one step.
export const WATER_RISES_PER_DEPTH = 5;

export function getWaterDepth(cell) {
  if (cell?.hazard?.kind !== TRAVERSAL_GIMMICKS.FLOOD) return 0;
  const age = Math.max(0, Number(cell.hazard.age) || 0);
  return Math.min(WATER_MAX_DEPTH, 1 + Math.floor(age / WATER_RISES_PER_DEPTH));
}

export function isDeepWater(cell) {
  return getWaterDepth(cell) >= WATER_MAX_DEPTH;
}

/**
 * HP a step in deep water takes. It half-drowns but never kills: it stops at
 * 1 HP, so the cost is a weakened way on, not a death on the stairs' doorstep.
 */
export function getDeepWaterDamage(maxHp, hp = Infinity) {
  const damage = Math.max(1, Math.ceil((Number(maxHp) || 1) * DEEP_WATER_DAMAGE_RATE));
  return Math.max(0, Math.min(damage, (Number(hp) || 0) - 1));
}

export function getDungeonWaterRule(floor) {
  if (!Number.isInteger(floor) || floor < 1) return null;
  const rule = getDungeonRule(floor);
  return rule?.id === "water" ? rule : null;
}

function canFlood(cell) {
  return Boolean(cell) && cell.type === "empty" && !cell.event && !cell.trap && !cell.obstacle &&
    !cell.hazard && !cell.lever && !cell.specialRoom && !cell.message;
}

/**
 * Spread the water one ring and deepen what was already under it. Returns the
 * newly flooded cells; `sunk` collects the closed chests the water reached.
 */
export function spreadWaterOnce(grid, sunk = []) {
  if (!Array.isArray(grid)) return [];
  const flooded = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell?.hazard?.kind === TRAVERSAL_GIMMICKS.FLOOD) flooded.push({ x, y });
  }));
  const added = [];
  const seen = new Set();
  const sinkChest = (next, nx, ny) => {
    // A closed chest the water reaches sinks with what was in it.
    next.event = null;
    next.hazard = { kind: TRAVERSAL_GIMMICKS.FLOOD, discovered: false, risen: true, age: 0, sunkChest: true };
    sunk.push({ x: nx, y: ny });
  };
  for (const { x, y } of flooded) {
    const cell = grid[y][x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls?.[dir]) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      const next = grid[ny]?.[nx];
      if (!next || next.blockEnter?.[OPPOSITE[dir]] || seen.has(`${nx},${ny}`)) continue;
      if (next.event === "chest" && next.type === "empty" && !next.hazard) {
        seen.add(`${nx},${ny}`);
        sinkChest(next, nx, ny);
        continue;
      }
      if (!canFlood(next)) continue;
      seen.add(`${nx},${ny}`);
      added.push({ x: nx, y: ny });
    }
  }
  flooded.forEach(({ x, y }) => {
    const hazard = grid[y][x].hazard;
    hazard.age = (Number(hazard.age) || 0) + 1;
  });
  added.forEach(({ x, y }) => { grid[y][x].hazard = { kind: TRAVERSAL_GIMMICKS.FLOOD, discovered: false, risen: true, age: 0 }; });
  return added;
}

/**
 * Raise the water on `floor` to the level its turn count has reached. Returns
 * how many times it rose now (0 when nothing changed or the floor has no rule).
 * `sunk` collects the chests the water swallowed on the way.
 */
export function riseWater(stateLike, grid = stateLike?.map, floor = stateLike?.floor, sunk = []) {
  const rule = getDungeonWaterRule(floor);
  const run = stateLike?.currentRun;
  if (!rule || !run || !Array.isArray(grid)) return 0;
  const steps = run.floorSteps?.[String(floor)] || 0;
  const target = Math.min(rule.maxRises, Math.floor(steps / rule.riseEvery));
  run.waterLevels ||= {};
  const current = run.waterLevels[String(floor)] || 0;
  let rose = 0;
  for (let level = current; level < target; level++) {
    spreadWaterOnce(grid, sunk);
    rose++;
  }
  if (rose > 0) run.waterLevels[String(floor)] = target;
  return rose;
}

/** The water's level on the current floor for the HUD, or null off the library. */
export function getWaterStatus(stateLike) {
  const rule = getDungeonWaterRule(stateLike?.floor);
  const run = stateLike?.currentRun;
  if (!rule || !run) return null;
  const key = String(stateLike.floor);
  const level = run.waterLevels?.[key] || 0;
  const steps = run.floorSteps?.[key] || 0;
  const full = level >= rule.maxRises;
  return {
    level,
    maxLevel: rule.maxRises,
    turnsToRise: full ? null : rule.riseEvery - (steps % rule.riseEvery),
    full
  };
}
