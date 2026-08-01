import { getBiomeForFloor } from "../data/biomes.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { createRng } from "../seed_rng.js";
import { ELITE_PERCEPTIONS } from "./elite_perception.js";

// 徘徊エリートは深層でのみ現れる任意チャレンジ。避けるのが正解で、倒せば大きく跳ねる。
export const ELITE_MIN_FLOOR = 3;
export const ELITE_PATROL_RADIUS = 5;
// 階段上の目の前に湧くと回避判断の猶予がない。気配ログの射程と同じ5マスを最低距離にする。
const ELITE_MIN_START_DISTANCE = 5;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [2, 3, 0, 1];

export function shouldSpawnElite(floor) {
  return Number.isInteger(floor) && floor >= ELITE_MIN_FLOOR;
}

export function getEliteId(floor) {
  return `RUN_ELITE_B${floor}`;
}

export function getElitePerception(runSeed, floor) {
  const rng = createRng(`${runSeed}:elite-perception:B${floor}`);
  return ELITE_PERCEPTIONS[Math.floor(rng() * ELITE_PERCEPTIONS.length)];
}

// 一方通行を踏まえた「プレイヤーが実際に歩ける」セル集合。隠し扉は未発見のまま壁として扱う。
function collectReachableKeys(grid, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  for (const pos of queue) {
    const cell = grid[pos.y]?.[pos.x];
    if (!cell) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      if (!next || next.blockEnter?.[OPPOSITE_DIR[dir]]) continue;
      const key = `${nx},${ny}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

export function findEliteStart(grid, start, rng = Math.random) {
  if (!grid || !start) return null;
  const reachable = collectReachableKeys(grid, start);
  const candidates = [];
  const fallbacks = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (!reachable.has(`${x},${y}`)) continue;
      if (cell.type !== "empty" || cell.event || cell.trap) continue;
      fallbacks.push({ x, y });
      if (Math.abs(x - start.x) + Math.abs(y - start.y) >= ELITE_MIN_START_DISTANCE) {
        candidates.push({ x, y });
      }
    }
  }
  const pool = candidates.length > 0 ? candidates : fallbacks;
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

export function createFloorElite({ runSeed, floor, mapData }) {
  if (!shouldSpawnElite(floor) || !runSeed || !mapData?.grid) return null;
  const grid = mapData.grid;
  const start = findMapCellByType(grid, "stairs-up");
  if (!start) return null;
  const spot = findEliteStart(grid, start, createRng(`${runSeed}:elite-spawn:B${floor}`));
  if (!spot) return null;

  return {
    id: getEliteId(floor),
    floor,
    x: spot.x,
    y: spot.y,
    name: getBiomeForFloor(floor).eliteName,
    kind: "elite",
    perception: getElitePerception(runSeed, floor),
    homeX: spot.x,
    homeY: spot.y
  };
}
