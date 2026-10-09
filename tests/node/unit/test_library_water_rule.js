// The sunken library's rule (#2063): the water rises with the turns spent on
// a floor. It spreads from the flooded cells one ring at a time, never onto
// stairs, rooms, chests, or the guardian, and since water is walkable the way
// down and back always remain.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { getDungeonWaterRule, riseWater, spreadWaterOnce } from "../../../src/systems/rising_water.js";

const library = DUNGEONS.find(dungeon => dungeon.id === "sunken_library");
const entry = getDungeonEntryFloor(library.index);
const rule = getDungeonWaterRule(entry);
assert.equal(library.built, true);
assert.equal(getDungeonRule(entry)?.id, "water");
assert.match(getDungeonRule(entry).line, /^水位：/);
assert.equal(getDungeonWaterRule(1), null, "the mine's floors never flood by turns");

const countFlood = grid => grid.flat().filter(cell => cell.hazard?.kind === "flood").length;

for (const seed of ["A", "B", "C"]) {
  const floor = entry + 1;
  const { grid } = generateRunFloor({ runSeed: `LIB-${seed}`, floor });
  const start = countFlood(grid);
  assert.ok(start > 0, `seed ${seed}: the floor starts with some water`);
  const state = { floor, map: grid, currentRun: { floorSteps: { [floor]: 0 } } };

  // Nothing rises before the first threshold.
  state.currentRun.floorSteps[floor] = rule.riseEvery - 1;
  assert.equal(riseWater(state), 0);
  // Each threshold passed raises it once, and only once.
  state.currentRun.floorSteps[floor] = rule.riseEvery * 2;
  assert.equal(riseWater(state), 2);
  assert.equal(riseWater(state), 0);
  assert.equal(state.currentRun.waterLevels[floor], 2);
  const afterTwo = countFlood(grid);
  assert.ok(afterTwo > start, `seed ${seed}: the water spread (${start} -> ${afterTwo})`);
  // It stops at the rule's ceiling.
  state.currentRun.floorSteps[floor] = rule.riseEvery * (rule.maxRises + 5);
  assert.equal(riseWater(state), rule.maxRises - 2);
  // Stairs, events, and rooms stay dry.
  grid.flat().forEach(cell => {
    if (cell.hazard?.kind !== "flood") return;
    assert.equal(cell.type, "empty");
    assert.ok(!cell.event && !cell.specialRoom && !cell.obstacle);
  });
}

// One ring reaches only open neighbours of the water.
{
  const cell = () => ({ type: "empty", walls: [false, false, false, false] });
  const grid = [[cell(), cell(), cell()], [cell(), cell(), cell()]];
  grid[0][0].hazard = { kind: "flood" };
  grid[0][0].walls[1] = true; // wall to the east
  grid[1][0].event = "chest";
  assert.deepEqual(spreadWaterOnce(grid), []);
  grid[0][0].walls[1] = false;
  assert.deepEqual(spreadWaterOnce(grid), [{ x: 1, y: 0 }]);
}

console.log("[PASS] the library's water rises with the turns spent on a floor and keeps every way open");
