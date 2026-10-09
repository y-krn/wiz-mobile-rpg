// The sunken library's rule (#2063): the longer the run stays on a floor, the
// more of it lies under water. Flooded cells already slow a step by a turn
// (#1963); here the water spreads one ring from every flooded cell each time
// the floor's turn count passes another `riseEvery`, up to `maxRises`. Water
// is walkable, so it never cuts a way off; stairs, rooms, chests, and the
// guardian stay dry. The floor keeps its water for the way back, and the turns
// spent on it then count on.
import { DX, DY } from "../constants/directions.js";
import { getDungeonRule } from "../rules/dungeons.js";
import { TRAVERSAL_GIMMICKS } from "../rules/traversal_gimmicks.js";

const OPPOSITE = [2, 3, 0, 1];

export function getDungeonWaterRule(floor) {
  if (!Number.isInteger(floor) || floor < 1) return null;
  const rule = getDungeonRule(floor);
  return rule?.id === "water" ? rule : null;
}

function canFlood(cell) {
  return Boolean(cell) && cell.type === "empty" && !cell.event && !cell.trap && !cell.obstacle &&
    !cell.hazard && !cell.lever && !cell.specialRoom && !cell.message;
}

/** Spread the water one ring. Returns the newly flooded cells. */
export function spreadWaterOnce(grid) {
  if (!Array.isArray(grid)) return [];
  const flooded = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell?.hazard?.kind === TRAVERSAL_GIMMICKS.FLOOD) flooded.push({ x, y });
  }));
  const added = [];
  const seen = new Set();
  for (const { x, y } of flooded) {
    const cell = grid[y][x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls?.[dir]) continue;
      const nx = x + DX[dir];
      const ny = y + DY[dir];
      const next = grid[ny]?.[nx];
      if (!canFlood(next) || next.blockEnter?.[OPPOSITE[dir]] || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      added.push({ x: nx, y: ny });
    }
  }
  added.forEach(({ x, y }) => { grid[y][x].hazard = { kind: TRAVERSAL_GIMMICKS.FLOOD, discovered: false, risen: true }; });
  return added;
}

/**
 * Raise the water on `floor` to the level its turn count has reached. Returns
 * how many times it rose now (0 when nothing changed or the floor has no rule).
 */
export function riseWater(stateLike, grid = stateLike?.map, floor = stateLike?.floor) {
  const rule = getDungeonWaterRule(floor);
  const run = stateLike?.currentRun;
  if (!rule || !run || !Array.isArray(grid)) return 0;
  const steps = run.floorSteps?.[String(floor)] || 0;
  const target = Math.min(rule.maxRises, Math.floor(steps / rule.riseEvery));
  run.waterLevels ||= {};
  const current = run.waterLevels[String(floor)] || 0;
  let rose = 0;
  for (let level = current; level < target; level++) {
    spreadWaterOnce(grid);
    rose++;
  }
  if (rose > 0) run.waterLevels[String(floor)] = target;
  return rose;
}
