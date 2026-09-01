import { getBiomeForFloor } from "../data/biomes.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { createRng } from "../seed_rng.js";
import { ELITE_PERCEPTIONS } from "./elite_perception.js";

// 徘徊エリートは深層でのみ現れる任意チャレンジ。避けるのが正解で、倒せば大きく跳ねる。
export const ELITE_MIN_FLOOR = 3;
export const ELITE_PATROL_RADIUS = 5;
export const ELITE_ENTRY_SPAWN_CHANCE = 0.30;
export const ELITE_PROLONGED_START_STEPS = 40;
export const ELITE_PROLONGED_CHECK_INTERVAL = 10;
export const ELITE_PROLONGED_MAX_CHANCE = 0.40;
// 階段上の目の前に湧くと回避判断の猶予がない。気配ログの射程と同じ5マスを最低距離にする。
const ELITE_MIN_START_DISTANCE = 5;

export const ELITE_COMBAT_TRAITS = Object.freeze([
  "berserk",
  "armored",
  "spell_eater",
  "regenerator",
  "executioner"
]);

export const ELITE_COMBAT_TRAIT_LABELS = Object.freeze({
  berserk: "狂暴：HP半分以下で攻撃が強化される",
  armored: "重装：物理に強く、呪文に弱い",
  spell_eater: "魔喰い：呪文を受けると一時的に強化される",
  regenerator: "再生：毎ターンHPが回復する",
  executioner: "処刑者：瀕死の冒険者を狙う"
});

const ELITE_OMENS = Object.freeze([
  { step: 30, text: "この階に長く留まりすぎた気がする……" },
  { step: 50, text: "遠くで何かが目覚めた……" },
  { step: 70, text: "重い足音が、先ほどより近い……" }
]);

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [2, 3, 0, 1];

export function shouldSpawnElite(floor, runSeed) {
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || typeof runSeed !== "string" || !runSeed) {
    return false;
  }
  return createRng(`${runSeed}:elite-entry:B${floor}`)() < ELITE_ENTRY_SPAWN_CHANCE;
}

export function getEliteId(floor) {
  return `RUN_ELITE_B${floor}`;
}

export function getElitePerception(runSeed, floor) {
  const rng = createRng(`${runSeed}:elite-perception:B${floor}`);
  return ELITE_PERCEPTIONS[Math.floor(rng() * ELITE_PERCEPTIONS.length)];
}

export function getEliteCombatTrait(runSeed, floor) {
  const rng = createRng(`${runSeed}:elite-combat-trait:B${floor}`);
  return ELITE_COMBAT_TRAITS[Math.floor(rng() * ELITE_COMBAT_TRAITS.length)];
}

export function applyEliteCombatTraitStats(monster, combatTrait) {
  if (!monster || combatTrait !== "armored") return monster;
  return {
    ...monster,
    physResist: Math.max(monster.physResist ?? 0, 0.45),
    magicResist: Math.min(monster.magicResist ?? 0, -0.35)
  };
}

export function getEliteProlongedCheckChance(checkStep) {
  const checksAfterStart = Math.max(0, Math.floor((checkStep - ELITE_PROLONGED_START_STEPS) / ELITE_PROLONGED_CHECK_INTERVAL));
  return Math.min(ELITE_PROLONGED_MAX_CHANCE, 0.08 + checksAfterStart * 0.04);
}

export function shouldSpawnEliteAfterExploration({ floor, runSeed, steps }) {
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || typeof runSeed !== "string" || !runSeed) return false;
  const currentSteps = Math.max(0, Math.floor(Number(steps) || 0));
  for (let checkStep = ELITE_PROLONGED_START_STEPS; checkStep <= currentSteps; checkStep += ELITE_PROLONGED_CHECK_INTERVAL) {
    const rng = createRng(`${runSeed}:elite-prolonged:B${floor}:S${checkStep}`);
    if (rng() < getEliteProlongedCheckChance(checkStep)) return true;
  }
  return false;
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

export function createFloorElite({ runSeed, floor, mapData, spawnReason = "entry" }) {
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || !runSeed || !mapData?.grid) return null;
  if (spawnReason === "entry" && !shouldSpawnElite(floor, runSeed)) return null;
  if (spawnReason !== "entry" && spawnReason !== "prolonged") return null;
  const grid = mapData.grid;
  const start = findMapCellByType(grid, "stairs-up");
  if (!start) return null;
  const spot = findEliteStart(grid, start, createRng(`${runSeed}:elite-spawn:B${floor}`));
  if (!spot) return null;
  const combatTrait = getEliteCombatTrait(runSeed, floor);

  return {
    id: getEliteId(floor),
    floor,
    x: spot.x,
    y: spot.y,
    name: getBiomeForFloor(floor).eliteName,
    kind: "elite",
    perception: getElitePerception(runSeed, floor),
    combatTrait,
    combatTraitLabel: ELITE_COMBAT_TRAIT_LABELS[combatTrait],
    spawnReason,
    homeX: spot.x,
    homeY: spot.y
  };
}

function getFloorElite(stateLike, floor) {
  return (stateLike.roamingMonsters || []).find(monster => monster.kind === "elite" && monster.floor === floor);
}

export function progressEliteThreat(stateLike) {
  const floor = stateLike?.floor;
  const currentRun = stateLike?.currentRun;
  const runSeed = currentRun?.runSeed;
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || !runSeed) return { omens: [], spawned: null };
  if (getFloorElite(stateLike, floor) || currentRun.eliteDefeatedFloors?.includes(floor)) {
    return { omens: [], spawned: null };
  }

  const steps = currentRun.floorSteps?.[String(floor)] || 0;
  currentRun.eliteOmenSteps ||= {};
  const shown = new Set(Array.isArray(currentRun.eliteOmenSteps[String(floor)])
    ? currentRun.eliteOmenSteps[String(floor)] : []);
  const omens = ELITE_OMENS
    .filter(omen => steps >= omen.step && !shown.has(omen.step))
    .map(omen => {
      shown.add(omen.step);
      return omen.text;
    });
  currentRun.eliteOmenSteps[String(floor)] = [...shown].sort((a, b) => a - b);

  if (!shouldSpawnEliteAfterExploration({ floor, runSeed, steps })) {
    return { omens, spawned: null };
  }
  const grid = stateLike.map || stateLike.maps?.[floor - 1];
  const spawned = createFloorElite({ runSeed, floor, mapData: { grid }, spawnReason: "prolonged" });
  if (!spawned) return { omens, spawned: null };
  stateLike.roamingMonsters ||= [];
  stateLike.roamingMonsters.push(spawned);
  return { omens, spawned };
}
