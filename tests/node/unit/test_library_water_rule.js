// The sunken library's rule (#2063): the water rises with the turns spent on
// a floor. It spreads from the flooded cells one ring at a time, never onto
// stairs, rooms, chests, or the guardian, and since water is walkable the way
// down and back always remain.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import {
  DEEP_WATER_DAMAGE_RATE, WATER_MAX_DEPTH, WATER_RISES_PER_DEPTH, getDeepWaterDamage, getDungeonWaterRule, getWaterDepth,
  getWaterStatus, isDeepWater, riseWater, spreadWaterOnce
} from "../../../src/systems/rising_water.js";

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
  // Stairs, events, and rooms stay dry; a chest the water reached sank.
  grid.flat().forEach(cell => {
    if (cell.hazard?.kind !== "flood") return;
    assert.equal(cell.type, "empty");
    assert.ok(!cell.event && !cell.specialRoom && !cell.obstacle);
  });
  assert.ok(grid.flat().some(cell => getWaterDepth(cell) === WATER_MAX_DEPTH), `seed ${seed}: full water has deep cells`);
}

// One ring reaches only open neighbours of the water; a closed chest it
// reaches sinks with what was in it (#2105).
{
  const cell = () => ({ type: "empty", walls: [false, false, false, false] });
  const grid = [[cell(), cell(), cell()], [cell(), cell(), cell()]];
  grid[0][0].hazard = { kind: "flood" };
  grid[0][0].walls[1] = true; // wall to the east
  grid[1][0].event = "chest";
  const sunk = [];
  assert.deepEqual(spreadWaterOnce(grid, sunk), []);
  assert.deepEqual(sunk, [{ x: 0, y: 1 }]);
  assert.equal(grid[1][0].event, null);
  assert.equal(grid[1][0].hazard.kind, "flood");
  grid[0][0].walls[1] = false;
  // The sunk chest's cell is water now and spreads on as well.
  assert.deepEqual(spreadWaterOnce(grid), [{ x: 1, y: 0 }, { x: 1, y: 1 }]);
}

// Water deepens as it stands: shallow, knee, deep, one step per
// WATER_RISES_PER_DEPTH rises. Deep water costs a share of max HP per step (#2105).
{
  const cell = () => ({ type: "empty", walls: [false, false, false, false] });
  const grid = [[cell(), cell(), cell(), cell(), cell(), cell(), cell(), cell(), cell(), cell()]];
  grid[0][0].hazard = { kind: "flood" };
  assert.equal(getWaterDepth(grid[0][0]), 1);
  for (let rise = 0; rise < WATER_RISES_PER_DEPTH; rise++) spreadWaterOnce(grid);
  assert.equal(getWaterDepth(grid[0][0]), 2);
  assert.equal(getWaterDepth(grid[0][WATER_RISES_PER_DEPTH]), 1);
  for (let rise = 0; rise < WATER_RISES_PER_DEPTH; rise++) spreadWaterOnce(grid);
  assert.equal(getWaterDepth(grid[0][0]), WATER_MAX_DEPTH);
  assert.equal(isDeepWater(grid[0][0]), true);
  assert.equal(isDeepWater(grid[0][1]), false);
  assert.equal(getDeepWaterDamage(100), Math.ceil(100 * DEEP_WATER_DAMAGE_RATE));
  assert.equal(getDeepWaterDamage(1), 1);
  // It never kills: a step stops at 1 HP.
  assert.equal(getDeepWaterDamage(100, 2), 1);
  assert.equal(getDeepWaterDamage(100, 1), 0);
}

// The HUD reads the level and the turns until the next rise.
{
  const floor = entry + 1;
  const state = { floor, currentRun: { floorSteps: { [floor]: rule.riseEvery * 3 + 5 }, waterLevels: { [floor]: 3 } } };
  assert.deepEqual(getWaterStatus(state), { level: 3, maxLevel: rule.maxRises, turnsToRise: rule.riseEvery - 5, full: false });
  state.currentRun.waterLevels[floor] = rule.maxRises;
  assert.equal(getWaterStatus(state).full, true);
  assert.equal(getWaterStatus({ floor: 1, currentRun: {} }), null);
}

console.log("[PASS] the library's water rises and deepens with the turns spent on a floor, sinks chests, and keeps every way open");
