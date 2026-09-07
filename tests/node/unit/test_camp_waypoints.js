import assert from "node:assert/strict";
import { generateRunFloor, isMilestoneFloor } from "../../../src/run_map_generator.js";
import { EVENT_TYPES } from "../../../src/data.js";
import { createDefaultCurrentRun } from "../../../src/state.js";
import { getCampRestStatus, restAtCamp } from "../../../src/systems/camp_rest.js";

const FAST = process.env.FAST === "1";
const SEED_COUNT = FAST ? 10 : 30;

// 野営はマップセルではなく、守護者撃破後の階への進入イベントになった。
for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex++) {
  const runSeed = `CAMP-WAYPOINTS-${seedIndex}`;
  let parent = null;
  for (let floor = 1; floor <= 12; floor++) {
    const map = generateRunFloor({ runSeed, floor, parentStairsCoord: parent });
    const campCells = map.grid.flat().filter(cell => cell.event === EVENT_TYPES.CAMP);
    assert.equal(campCells.length, 0, `${runSeed} B${floor} has no camp cells`);
    assert.equal(isMilestoneFloor(floor - 1), floor > 1 && (floor - 1) % 5 === 0);
    parent = map.stairsDownCoord;
  }
}

const fighter = {
  status: "ok",
  hp: 20,
  maxHp: 100,
  mp: 5,
  maxMp: 25,
  equipment: { weapon: null, shield: null, armor: null, accessory: "AMULET_HP" }
};
const dead = { status: "dead", hp: 0, maxHp: 50, mp: 0, maxMp: 10, equipment: {} };
const state = {
  floor: 6,
  party: [fighter, dead],
  currentRun: createDefaultCurrentRun()
};

assert.equal(getCampRestStatus(state).available, true, "camp rest needs no prior kill");
const result = restAtCamp(state);
assert.equal(result.available, true, "camp rest resolves");
assert.equal(fighter.hp, 56, "rest heals 40% of missing max HP including equipment bonus");
assert.equal(fighter.mp, 13, "rest heals 40% of missing MP");
assert.equal(dead.hp, 0, "rest does not restore a defeated character");
assert.equal(state.currentRun.campRested[6], true, "rest records floor usage");
assert.equal(restAtCamp(state).reason, "used", "second rest in same run is rejected");

state.currentRun = createDefaultCurrentRun();
assert.equal(getCampRestStatus(state).available, true, "new run restores camp use");

const noRun = { floor: 6, party: [fighter], currentRun: null };
assert.equal(getCampRestStatus(noRun).reason, "no_run", "camp rest requires an active run");

console.log("[PASS] camp waypoints");
