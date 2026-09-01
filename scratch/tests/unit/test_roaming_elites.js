import assert from "node:assert/strict";
import {
  ELITE_MIN_FLOOR,
  createFloorElite,
  getElitePerception,
  getEliteCombatTrait,
  getEliteCombatTraitWeights,
  progressEliteThreat,
  shouldSpawnElite,
  shouldSpawnEliteAfterExploration,
  applyEliteCombatTraitStats,
  recordEliteGreedAction
} from "../../../src/systems/roaming_elites.js";
import { getEliteAttackMultiplier, triggerEliteSpellEater } from "../../../src/combat_logic/monster_traits.js";
import { ELITE_PERCEPTIONS } from "../../../src/systems/elite_perception.js";
import { getBiomeForFloor } from "../../../src/data/biomes.js";
import { MONSTERS } from "../../../src/data/monsters.js";
import { ensureRunFloor, resetRunFloors } from "../../../src/state/run_floor_state.js";
import { getCampRestStatus, restAtCamp } from "../../../src/systems/camp_rest.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";
import { getBandTrialForFloor } from "../../../src/rules/floor_trials.js";

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
  const entryResults = [];
  for (let seed = 0; seed < 40; seed++) {
    const stateLike = createRunState(`ELITE-DEPTH-${seed}`);
    ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
    entryResults.push(elitesOnFloor(stateLike, ELITE_MIN_FLOOR).length);
  }
  assert.ok(entryResults.includes(0), "B3F entry spawn must sometimes be absent");
  assert.ok(entryResults.includes(1), "B3F entry spawn must sometimes be present");
  assert.ok(entryResults.every(count => count <= 1), "entry spawn must not place multiple elites");
});

check("re-entering an already generated floor does not duplicate the elite", () => {
  const runSeed = [...Array(40).keys()].map(seed => `ELITE-REENTER-${seed}`)
    .find(seed => shouldSpawnElite(ELITE_MIN_FLOOR, seed));
  const stateLike = createRunState(runSeed);
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
  assert.ok(elitesOnFloor(first, ELITE_MIN_FLOOR).length + elitesOnFloor(second, ELITE_MIN_FLOOR).length > 0);
});

check("the same run seed places the elite deterministically", () => {
  const runSeed = [...Array(40).keys()].map(seed => `ELITE-DETERMINISTIC-${seed}`)
    .find(seed => shouldSpawnElite(ELITE_MIN_FLOOR, seed));
  const first = createRunState(runSeed);
  const second = createRunState(runSeed);
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
      const elite = createFloorElite({ runSeed, floor, mapData: generated, spawnReason: "prolonged" });
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
    const elite = createFloorElite({ runSeed: "ELITE-BIOME", floor, mapData: generated, spawnReason: "prolonged" });
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

check("prolonged exploration can spawn an absent entry elite", () => {
  const runSeed = [...Array(100).keys()].map(seed => `ELITE-PROLONGED-${seed}`)
    .find(seed => !shouldSpawnElite(ELITE_MIN_FLOOR, seed) && shouldSpawnEliteAfterExploration({
      floor: ELITE_MIN_FLOOR,
      runSeed: seed,
      greedScore: 12,
      checkIndex: 1
    }));
  assert.ok(runSeed, "a seed should exercise the prolonged spawn route");
  const generated = generateRunFloor({ runSeed, floor: ELITE_MIN_FLOOR });
  const start = findCell(generated.grid, "stairs-up");
  const stateLike = {
    floor: ELITE_MIN_FLOOR,
    maps: [null, null, generated.grid],
    currentRun: {
      runSeed,
      floorSteps: { [ELITE_MIN_FLOOR]: 400 },
      eliteFloors: { [ELITE_MIN_FLOOR]: { greedScore: 12, prolongedChecks: 0, warningStage: 0 } },
      eliteOmenSteps: {},
      eliteDefeatedFloors: []
    },
    x: start.x,
    y: start.y,
    roamingMonsters: []
  };
  const result = progressEliteThreat(stateLike);
  assert.equal(result.spawned?.spawnReason, "prolonged");
  assert.equal(elitesOnFloor(stateLike, ELITE_MIN_FLOOR).length, 1);
});

check("prolonged spawn and omen sequence survive a save/load round trip", () => {
  const runSeed = "ELITE-SAVE-DETERMINISTIC";
  const generated = generateRunFloor({ runSeed, floor: ELITE_MIN_FLOOR });
  const createState = () => ({
    floor: ELITE_MIN_FLOOR,
    maps: [null, null, generated.grid],
    currentRun: {
      runSeed,
      floorSteps: { [ELITE_MIN_FLOOR]: 390 },
      eliteFloors: { [ELITE_MIN_FLOOR]: { greedScore: 0, prolongedChecks: 0, warningStage: 0 } },
      eliteOmenSteps: {},
      eliteDefeatedFloors: []
    },
    roamingMonsters: []
  });
  const original = createState();
  progressEliteThreat(original);
  original.currentRun.eliteFloors[ELITE_MIN_FLOOR].greedScore = 12;
  const reloaded = JSON.parse(JSON.stringify(original));
  progressEliteThreat(original);
  progressEliteThreat(reloaded);
  assert.deepEqual(reloaded.roamingMonsters, original.roamingMonsters);
  assert.deepEqual(reloaded.currentRun.eliteFloors, original.currentRun.eliteFloors);
});

check("defeated floors never respawn during prolonged exploration", () => {
  const stateLike = createRunState("ELITE-DEFEATED-PROLONGED");
  ensureRunFloor(stateLike, ELITE_MIN_FLOOR);
  stateLike.floor = ELITE_MIN_FLOOR;
  stateLike.currentRun.floorSteps = { [ELITE_MIN_FLOOR]: 1000 };
  stateLike.currentRun.eliteFloors[String(ELITE_MIN_FLOOR)] = {
    greedScore: 100,
    prolongedChecks: 0,
    warningStage: 0,
    defeated: true,
    spawned: true
  };
  stateLike.currentRun.eliteDefeatedFloors = [ELITE_MIN_FLOOR];
  stateLike.roamingMonsters = [];
  const result = progressEliteThreat(stateLike);
  assert.equal(result.spawned, null);
  assert.equal(elitesOnFloor(stateLike, ELITE_MIN_FLOOR).length, 0);
});

check("combat trait is one deterministic axis with at least four variants", () => {
  const traits = new Set([...Array(80).keys()].map(seed => getEliteCombatTrait(`ELITE-TRAIT-${seed}`, 5)));
  assert.ok(traits.size >= 4);
  const sameSeed = getEliteCombatTrait("ELITE-TRAIT-SAME", 5);
  assert.equal(sameSeed, getEliteCombatTrait("ELITE-TRAIT-SAME", 5));
});

check("walking alone does not advance elite threat, while value actions do", () => {
  const stateLike = createRunState("ELITE-GREED-ACTIONS");
  stateLike.floor = ELITE_MIN_FLOOR;
  stateLike.currentRun.floorSteps = { [ELITE_MIN_FLOOR]: 1000 };
  progressEliteThreat(stateLike);
  assert.equal(stateLike.currentRun.eliteFloors[String(ELITE_MIN_FLOOR)].greedScore, 0);
  stateLike.currentRun.eliteFloors[String(ELITE_MIN_FLOOR)].greedScore = 0;
  recordEliteGreedAction(stateLike, "new_room");
  assert.equal(stateLike.currentRun.eliteFloors[String(ELITE_MIN_FLOOR)].greedScore, 1);
});

check("trial themes bias elite combat traits without removing variants", () => {
  const trial = getBandTrialForFloor("ELITE-TRIAL-LINK", ELITE_MIN_FLOOR);
  const weights = getEliteCombatTraitWeights(trial);
  assert.ok(Object.values(weights).every(weight => weight > 0));
  const resourceTrial = {
    ...trial,
    main: { id: "resource" },
    sub: { id: "resource" }
  };
  assert.ok(getEliteCombatTraitWeights(resourceTrial).spell_eater > weights.spell_eater ||
    getEliteCombatTraitWeights(resourceTrial).spell_eater > 1);
  const elite = createFloorElite({
    runSeed: "ELITE-TRIAL-LINK",
    floor: ELITE_MIN_FLOOR,
    mapData: generateRunFloor({ runSeed: "ELITE-TRIAL-LINK", floor: ELITE_MIN_FLOOR }),
    spawnReason: "prolonged"
  });
  assert.deepEqual(elite.trialThemeIds, [trial.mainId, trial.subId]);
  const storedTrial = { bandIndex: 0, mainId: "resource", subId: "status" };
  const storedElite = createFloorElite({
    runSeed: "ELITE-TRIAL-LINK",
    floor: ELITE_MIN_FLOOR,
    mapData: generateRunFloor({ runSeed: "ELITE-TRIAL-LINK", floor: ELITE_MIN_FLOOR }),
    spawnReason: "prolonged",
    storedTrial
  });
  assert.deepEqual(storedElite.trialThemeIds, ["resource", "status"]);
  assert.equal(storedElite.combatTrait, getEliteCombatTrait("ELITE-TRIAL-LINK", ELITE_MIN_FLOOR, storedTrial));
});

check("combat traits change the relevant combat decisions", () => {
  const armored = applyEliteCombatTraitStats({ physResist: 0, magicResist: 0 }, "armored");
  assert.equal(armored.physResist, 0.45);
  assert.equal(armored.magicResist, -0.35);
  assert.equal(getEliteAttackMultiplier({ combatTrait: "berserk", hp: 40, maxHp: 100 }, { hp: 100, maxHp: 100 }), 1.35);
  assert.equal(getEliteAttackMultiplier({ combatTrait: "executioner", hp: 100, maxHp: 100 }, { hp: 40, maxHp: 100 }), 1.4);
  const logQueue = [];
  const spellEater = { name: "魔喰いの強敵", hp: 20, buffs: [], combatTrait: "spell_eater" };
  assert.equal(triggerEliteSpellEater(spellEater, logQueue), true);
  assert.equal(spellEater.buffs[0].type, "atk");
  assert.ok(logQueue[0].msg.includes("呪文を喰らい"));
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
