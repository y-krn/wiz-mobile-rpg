import assert from "node:assert/strict";
import { generateRunFloor } from "../src/run_map_generator.js";
import { EVENT_TYPES } from "../src/data.js";
import { getBiomeForFloor } from "../src/data/biomes.js";
import { createDefaultCurrentRun } from "../src/state.js";
import { getCampRestStatus, restAtCamp } from "../src/systems/camp_rest.js";

const FAST = process.env.FAST === "1";
const SEED_COUNT = FAST ? 10 : 30;

function findCamp(grid) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].event === EVENT_TYPES.CAMP) return { x, y, cell: grid[y][x] };
    }
  }
  return null;
}

// 野営はバイオームに野営地の設定がある階だけに現れる。封印門とは無関係。
for (let seedIndex = 0; seedIndex < SEED_COUNT; seedIndex++) {
  const runSeed = `CAMP-WAYPOINTS-${seedIndex}`;
  let parent = null;
  for (let floor = 1; floor <= 12; floor++) {
    const map = generateRunFloor({ runSeed, floor, parentStairsCoord: parent });
    const camp = findCamp(map.grid);
    const expectsCamp = Boolean(getBiomeForFloor(floor).theme.eventSkins.camp);
    assert.equal(Boolean(camp), expectsCamp, `${runSeed} B${floor} camp placement`);
    if (camp) {
      assert.equal(camp.cell.trap, undefined, `${runSeed} B${floor} camp excludes traps`);
      assert.equal(camp.cell.type, "empty", `${runSeed} B${floor} camp uses passage cell`);
    }
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
