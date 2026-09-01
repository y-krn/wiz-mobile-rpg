import { getBiomeForFloor } from "../data/biomes.js";
import { findMapCellByType } from "../rules/map_queries.js";
import { createRng } from "../seed_rng.js";
import { ELITE_PERCEPTIONS } from "./elite_perception.js";
import { getBandTrialForFloor, getFloorRole } from "../rules/floor_trials.js";

// 徘徊エリートは深層でのみ現れる任意チャレンジ。避けるのが正解で、倒せば大きく跳ねる。
export const ELITE_MIN_FLOOR = 3;
export const ELITE_PATROL_RADIUS = 5;
export const ELITE_ENTRY_SPAWN_CHANCE = 0.30;
export const ELITE_PROLONGED_CHECK_SCORE = 12;
export const ELITE_PROLONGED_MAX_CHANCE = 0.30;
// 階段上の目の前に湧くと回避判断の猶予がない。気配ログの射程と同じ5マスを最低距離にする。
const ELITE_MIN_START_DISTANCE = 5;

const ELITE_GREED_ACTION_WEIGHTS = Object.freeze({
  new_room: 1,
  battle: 2,
  chest: 4,
  optional_area: 3,
  stairs_found: 2
});

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

const ELITE_TRAIT_THEME_WEIGHTS = Object.freeze({
  short_battle: Object.freeze({ berserk: 2.8, executioner: 2.5 }),
  many_battles: Object.freeze({ regenerator: 2.2, berserk: 1.25 }),
  endurance: Object.freeze({ armored: 2.6, regenerator: 2.5 }),
  opening: Object.freeze({ berserk: 2.5, executioner: 2.3 }),
  status: Object.freeze({ spell_eater: 1.6, executioner: 1.5, regenerator: 1.2 }),
  resource: Object.freeze({ spell_eater: 2.8, armored: 1.25 })
});

const ELITE_OMENS = Object.freeze([
  { score: 8, text: "この階に長く留まりすぎた気がする……" },
  { score: 16, text: "遠くで何かが目覚めた……" },
  { score: 24, text: "重い足音が、先ほどより近い……" }
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

export function getEliteCombatTraitWeights(trial, role = null) {
  const weights = Object.fromEntries(ELITE_COMBAT_TRAITS.map(trait => [trait, 1]));
  if (!trial) return weights;
  const floorRole = role || getFloorRole(trial.bandIndex * 5 + 1);
  for (const [theme, roleWeight] of [
    [trial.main, floorRole.mainWeight],
    [trial.sub, floorRole.subWeight]
  ]) {
    const traitWeights = ELITE_TRAIT_THEME_WEIGHTS[theme.id] || {};
    for (const [trait, affinityWeight] of Object.entries(traitWeights)) {
      weights[trait] *= 1 + (affinityWeight - 1) * roleWeight;
    }
  }
  return weights;
}

export function getEliteCombatTrait(runSeed, floor) {
  const rng = createRng(`${runSeed}:elite-combat-trait:B${floor}`);
  const trial = getBandTrialForFloor(runSeed, floor);
  const weights = getEliteCombatTraitWeights(trial, getFloorRole(floor));
  const total = ELITE_COMBAT_TRAITS.reduce((sum, trait) => sum + weights[trait], 0);
  let threshold = rng() * total;
  for (const trait of ELITE_COMBAT_TRAITS) {
    threshold -= weights[trait];
    if (threshold < 0) return trait;
  }
  return ELITE_COMBAT_TRAITS.at(-1);
}

export function applyEliteCombatTraitStats(monster, combatTrait) {
  if (!monster || combatTrait !== "armored") return monster;
  return {
    ...monster,
    physResist: Math.max(monster.physResist ?? 0, 0.45),
    magicResist: Math.min(monster.magicResist ?? 0, -0.35)
  };
}

export function getEliteProlongedCheckChance(checkIndex) {
  const index = Math.max(1, Math.floor(Number(checkIndex) || 1));
  return Math.min(ELITE_PROLONGED_MAX_CHANCE, 0.10 + (index - 1) * 0.05);
}

export function shouldSpawnEliteAfterExploration({ floor, runSeed, greedScore, checkIndex }) {
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || typeof runSeed !== "string" || !runSeed) return false;
  const score = Math.max(0, Math.floor(Number(greedScore) || 0));
  const index = Math.max(1, Math.floor(Number(checkIndex) || 1));
  if (score < index * ELITE_PROLONGED_CHECK_SCORE) return false;
  const rng = createRng(`${runSeed}:elite-prolonged:B${floor}:C${index}`);
  return rng() < getEliteProlongedCheckChance(index);
}

function getEliteFloorState(currentRun, floor) {
  currentRun.eliteFloors ||= {};
  const key = String(floor);
  currentRun.eliteFloors[key] = {
    entryRollResolved: false,
    spawned: false,
    defeated: false,
    warningStage: 0,
    prolongedChecks: 0,
    greedScore: 0,
    stairsFound: false,
    actionKeys: [],
    ...(currentRun.eliteFloors[key] || {})
  };
  if (!Array.isArray(currentRun.eliteFloors[key].actionKeys)) currentRun.eliteFloors[key].actionKeys = [];
  return currentRun.eliteFloors[key];
}

export function markEliteEntryRollResolved(stateLike, floor) {
  const floorState = getEliteFloorState(stateLike.currentRun, floor);
  floorState.entryRollResolved = true;
  const existing = getFloorElite(stateLike, floor);
  if (existing) floorState.spawned = true;
  if (stateLike.currentRun.eliteDefeatedFloors?.includes(floor)) floorState.defeated = true;
  return floorState;
}

export function recordEliteGreedAction(stateLike, action, amount = 1, actionKey = null) {
  const floor = stateLike?.floor;
  const currentRun = stateLike?.currentRun;
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || !currentRun) return false;
  const weight = ELITE_GREED_ACTION_WEIGHTS[action];
  if (!weight) return false;
  const floorState = getEliteFloorState(currentRun, floor);
  if (actionKey && floorState.actionKeys.includes(actionKey)) return false;
  if (actionKey) floorState.actionKeys.push(actionKey);
  const multiplier = action === "new_room" && floorState.stairsFound ? 2 : 1;
  floorState.greedScore += Math.max(0, Number(amount) || 0) * weight * multiplier;
  if (action === "stairs_found") floorState.stairsFound = true;
  return true;
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
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      const cell = grid[y][x];
      if (!reachable.has(`${x},${y}`)) continue;
      if (cell.type !== "empty" || cell.event || cell.trap) continue;
      if (Math.abs(x - start.x) + Math.abs(y - start.y) >= ELITE_MIN_START_DISTANCE) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

export function createFloorElite({ runSeed, floor, mapData, spawnReason = "entry", spawnOrigin = null }) {
  if (!Number.isInteger(floor) || floor < ELITE_MIN_FLOOR || !runSeed || !mapData?.grid) return null;
  if (spawnReason === "entry" && !shouldSpawnElite(floor, runSeed)) return null;
  if (spawnReason !== "entry" && spawnReason !== "prolonged") return null;
  const grid = mapData.grid;
  const start = findMapCellByType(grid, "stairs-up");
  if (!start) return null;
  const origin = spawnOrigin || start;
  const spot = findEliteStart(grid, origin, createRng(`${runSeed}:elite-spawn:B${floor}`));
  if (!spot) return null;
  const combatTrait = getEliteCombatTrait(runSeed, floor);
  const trial = getBandTrialForFloor(runSeed, floor);

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
    trialThemeIds: [trial.mainId, trial.subId],
    trialRole: getFloorRole(floor).id,
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
  const floorState = getEliteFloorState(currentRun, floor);
  if (getFloorElite(stateLike, floor) || floorState.spawned || floorState.defeated || currentRun.eliteDefeatedFloors?.includes(floor)) {
    return { omens: [], spawned: null };
  }

  const score = floorState.greedScore;
  const omens = ELITE_OMENS
    .filter((omen, index) => score >= omen.score && floorState.warningStage < index + 1)
    .map(omen => {
      floorState.warningStage = Math.max(floorState.warningStage, ELITE_OMENS.indexOf(omen) + 1);
      return omen.text;
    });

  const checksDue = Math.floor(score / ELITE_PROLONGED_CHECK_SCORE);
  while (floorState.prolongedChecks < checksDue) {
    const checkIndex = floorState.prolongedChecks + 1;
    floorState.prolongedChecks = checkIndex;
    if (!shouldSpawnEliteAfterExploration({ floor, runSeed, greedScore: score, checkIndex })) continue;
    const grid = stateLike.map || stateLike.maps?.[floor - 1];
    const spawned = createFloorElite({
      runSeed,
      floor,
      mapData: { grid },
      spawnReason: "prolonged",
      spawnOrigin: Number.isInteger(stateLike.x) && Number.isInteger(stateLike.y)
        ? { x: stateLike.x, y: stateLike.y }
        : null
    });
    if (!spawned) continue;
    floorState.spawned = true;
    stateLike.roamingMonsters ||= [];
    stateLike.roamingMonsters.push(spawned);
    return { omens, spawned };
  }
  return { omens, spawned: null };
}
