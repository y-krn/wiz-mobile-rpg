import assert from "node:assert/strict";
import { ELITE_MIN_FLOOR, createFloorElite, getElitePerception } from "../src/systems/roaming_elites.js";
import { ELITE_PERCEPTIONS } from "../src/systems/elite_perception.js";
import { getBiomeForFloor } from "../src/data/biomes.js";
import { MONSTERS } from "../src/data/monsters.js";
import { ensureRunFloor, resetRunFloors } from "../src/state/run_floor_state.js";
import { getCampRestStatus, restAtCamp } from "../src/systems/camp_rest.js";
import { generateRunFloor } from "../src/run_map_generator.js";
import { scaleEnemyForDepth } from "../src/rules/depth_scaling.js";

const FAST = process.env.FAST === "1";
const SEED_COUNT = Number(process.env.ELITE_SEEDS) || (FAST ? 20 : 60);
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const OPPOSITE_DIR = [2, 3, 0, 1];

const failures = [];

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

// 封印門を撤去したので壁と一方通行だけが移動を制限する。隠し扉は未発見扱いで壁のまま。
function reachableKeys(grid, start) {
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

function findCell(grid, type) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.type === type) return { x, y };
    }
  }
  return null;
}

function createRunState(runSeed) {
  const stateLike = { currentRun: { runSeed }, roamingMonsters: [] };
  resetRunFloors(stateLike);
  return stateLike;
}

function elitesOnFloor(stateLike, floor) {
  return (stateLike.roamingMonsters || []).filter(rm => rm.kind === "elite" && rm.floor === floor);
}

check("shallow floors stay free of roaming elites", () => {
  const stateLike = createRunState("ELITE-SHALLOW");
  for (let floor = 1; floor < ELITE_MIN_FLOOR; floor++) {
    ensureRunFloor(stateLike, floor);
    assert.equal(elitesOnFloor(stateLike, floor).length, 0, `B${floor}F must not spawn an elite`);
  }
});

check("every floor at or below the elite depth spawns exactly one elite", () => {
  const stateLike = createRunState("ELITE-DEPTH");
  for (let floor = ELITE_MIN_FLOOR; floor <= ELITE_MIN_FLOOR + 5; floor++) {
    ensureRunFloor(stateLike, floor);
    assert.equal(elitesOnFloor(stateLike, floor).length, 1, `B${floor}F must spawn exactly one elite`);
  }
});

check("re-entering an already generated floor does not duplicate the elite", () => {
  const stateLike = createRunState("ELITE-REENTER");
  ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
  ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
  assert.equal(elitesOnFloor(stateLike, ELITE_MIN_FLOOR).length, 1);
});

check("a defeated elite does not respawn on the same run", () => {
  const stateLike = createRunState("ELITE-DEFEATED");
  ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
  const [elite] = elitesOnFloor(stateLike, ELITE_MIN_FLOOR);
  stateLike.roamingMonsters = stateLike.roamingMonsters.filter(rm => rm.id !== elite.id);
  ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
  assert.equal(elitesOnFloor(stateLike, ELITE_MIN_FLOOR).length, 0);
});

check("a new run brings the elite back", () => {
  const first = createRunState("ELITE-RUN-A");
  ensureRunFloor(first, ELITE_MIN_FLOOR);
  const second = createRunState("ELITE-RUN-B");
  ensureRunFloor(second, ELITE_MIN_FLOOR);
  assert.equal(elitesOnFloor(first, ELITE_MIN_FLOOR).length, 1);
  assert.equal(elitesOnFloor(second, ELITE_MIN_FLOOR).length, 1);
});

check("the same run seed places the elite deterministically", () => {
  const first = createRunState("ELITE-DETERMINISTIC");
  const second = createRunState("ELITE-DETERMINISTIC");
  ensureRunFloor(first, ELITE_MIN_FLOOR);
  ensureRunFloor(second, ELITE_MIN_FLOOR);
  const [a] = elitesOnFloor(first, ELITE_MIN_FLOOR);
  const [b] = elitesOnFloor(second, ELITE_MIN_FLOOR);
  assert.deepEqual({ x: a.x, y: a.y, name: a.name, perception: a.perception },
    { x: b.x, y: b.y, name: b.name, perception: b.perception });
});

check("the elite always starts on a cell the player can walk to", () => {
  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const runSeed = `ELITE-REACH-${seed}`;
    for (const floor of [ELITE_MIN_FLOOR, ELITE_MIN_FLOOR + 1, ELITE_MIN_FLOOR + 2]) {
      const generated = generateRunFloor({ runSeed, floor });
      const elite = createFloorElite({ runSeed, floor, mapData: generated });
      assert.ok(elite, `${runSeed} B${floor}F must produce an elite`);
      const start = findCell(generated.grid, "stairs-up");
      const reachable = reachableKeys(generated.grid, start);
      assert.ok(reachable.has(`${elite.x},${elite.y}`),
        `${runSeed} B${floor}F elite at ${elite.x},${elite.y} is unreachable from stairs-up`);
      assert.ok(Math.abs(elite.x - start.x) + Math.abs(elite.y - start.y) >= 5,
        `${runSeed} B${floor}F elite spawned too close to the entrance`);
    }
  }
});

check("the elite matches the biome roster and exists in the monster table", () => {
  for (let floor = ELITE_MIN_FLOOR; floor <= 32; floor++) {
    const generated = generateRunFloor({ runSeed: "ELITE-BIOME", floor });
    const elite = createFloorElite({ runSeed: "ELITE-BIOME", floor, mapData: generated });
    const biome = getBiomeForFloor(floor);
    assert.equal(elite.name, biome.eliteName, `B${floor}F elite must come from its biome`);
    assert.ok(MONSTERS.some(monster => monster.name === elite.name),
      `${elite.name} must exist in MONSTERS`);
  }
});

check("roaming elite effective HP and ATK rise without biome-boundary spikes", () => {
  let previous = null;
  for (let floor = ELITE_MIN_FLOOR; floor <= 30; floor++) {
    const eliteName = getBiomeForFloor(floor).eliteName;
    const template = MONSTERS.find(monster => monster.name === eliteName);
    const scaled = scaleEnemyForDepth(template, floor);
    if (previous) {
      assert.ok(scaled.hp >= previous.hp,
        `B${floor}F ${eliteName} HP ${scaled.hp} must not fall below ${previous.hp}`);
      assert.ok(scaled.atk >= previous.atk,
        `B${floor}F ${eliteName} ATK ${scaled.atk} must not fall below ${previous.atk}`);
      assert.ok(scaled.hp / previous.hp <= 1.16,
        `B${floor}F ${eliteName} HP jumped from ${previous.hp} to ${scaled.hp}`);
      assert.ok(scaled.atk / previous.atk <= 1.16,
        `B${floor}F ${eliteName} ATK jumped from ${previous.atk} to ${scaled.atk}`);
    }
    previous = scaled;
  }
});

check("perception is drawn from the shared pool and varies across runs", () => {
  const drawn = new Set();
  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const perception = getElitePerception(`ELITE-PERCEPTION-${seed}`, ELITE_MIN_FLOOR);
    assert.ok(ELITE_PERCEPTIONS.includes(perception), `${perception} is not a known perception`);
    drawn.add(perception);
  }
  assert.ok(drawn.size > 1, "perception must not be fixed across runs");
});

check("camp rest no longer depends on defeating anything", () => {
  const stateLike = {
    floor: 2,
    currentRun: { campRested: {} },
    party: [{ name: "テスト", hp: 1, maxHp: 40, mp: 0, class: "FIGHTER", level: 1, status: "ok" }]
  };
  assert.equal(getCampRestStatus(stateLike).available, true, "camp must be usable without any kill");
  restAtCamp(stateLike);
  assert.equal(getCampRestStatus(stateLike).reason, "used", "camp must be single-use per run");
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] roaming elites: spawn depth, reachability (${SEED_COUNT} seeds), determinism, biome roster, stat curve, perception pool, camp rest.`);
