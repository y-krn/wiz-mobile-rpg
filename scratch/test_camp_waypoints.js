import assert from "node:assert/strict";
import { generateRandomMap } from "../src/map_generator.js";
import { EVENT_TYPES } from "../src/data.js";
import { createDefaultCurrentRun } from "../src/state.js";
import { getWardenGateId } from "../src/state/warden_gates.js";
import { getCampRestStatus, restAtCamp } from "../src/systems/camp_rest.js";

function findCamp(grid) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].event === EVENT_TYPES.CAMP) return { x, y, cell: grid[y][x] };
    }
  }
  return null;
}

let parent = null;
for (let floor = 1; floor <= 5; floor++) {
  const map = generateRandomMap(floor, parent, "CAMP-WAYPOINTS");
  const camp = findCamp(map.grid);
  assert.equal(Boolean(camp), floor === 2 || floor === 4, `B${floor} camp placement`);
  if (camp) {
    assert.equal(camp.cell.trap, undefined, `B${floor} camp excludes traps`);
    assert.equal(camp.cell.type, "empty", `B${floor} camp uses passage cell`);
  }
  parent = map.stairsDownCoord;
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
  floor: 2,
  party: [fighter, dead],
  openedGates: [],
  currentRun: createDefaultCurrentRun()
};

assert.equal(getCampRestStatus(state).reason, "locked", "closed gate blocks camp rest");
assert.equal(restAtCamp(state).available, false, "closed camp cannot mutate party");
state.openedGates.push(getWardenGateId(2));
const result = restAtCamp(state);
assert.equal(result.available, true, "opened gate enables camp rest");
assert.equal(fighter.hp, 56, "rest heals 40% of missing max HP including equipment bonus");
assert.equal(fighter.mp, 13, "rest heals 40% of missing MP");
assert.equal(dead.hp, 0, "rest does not revive dead members");
assert.equal(state.currentRun.campRested[2], true, "rest records floor usage");
assert.equal(restAtCamp(state).reason, "used", "second rest in same run is rejected");

state.currentRun = createDefaultCurrentRun();
assert.equal(getCampRestStatus(state).available, true, "new run restores camp use");

console.log("[PASS] camp waypoints");
