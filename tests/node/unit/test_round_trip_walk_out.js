// The formal round trip (#2062): a keeper is rescued only by walking out, the
// Wing leaves the treasure and the keeper, a death says how far the way out
// was, and a roaming elite's patrol stays off the only way to the guardian
// (#2056).
import { strict as assert } from "node:assert";
import { addRunToFeatCounters } from "../../../src/systems/feats.js";
import { createDefaultFeatsState } from "../../../src/state/feats_state.js";
import { createRunRoundTrip } from "../../../src/state/run_round_trip.js";
import { buildDeathNearMiss } from "../../../src/rules/near_miss.js";
import { ELITE_PATROL_RADIUS, findEliteStart, findOnlyWayCells } from "../../../src/systems/roaming_elites.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { createRng } from "../../../src/seed_rng.js";
import { settleDungeonClears } from "../../../src/systems/dungeon_progress.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

const counters = () => createDefaultFeatsState().counters;
const runWith = (returnReason, roundTrip = createRunRoundTrip()) => ({
  companions: ["foreman"],
  roundTrip,
  returnReason,
  defeatedMilestones: [5]
});

check("a keeper is rescued only by walking out; the Wing leaves them waiting", () => {
  assert.equal(addRunToFeatCounters(counters(), runWith("surface"), "retreat").foremanRescued, 1);
  assert.equal(addRunToFeatCounters(counters(), runWith("escape_scroll"), "retreat").foremanRescued, 0);
  assert.equal(addRunToFeatCounters(counters(), runWith("gameover"), "death").foremanRescued, 0);
  // A run saved before #2062 (no round trip) keeps the old rule.
  assert.equal(addRunToFeatCounters(counters(), runWith("milestone_portal", null), "retreat").foremanRescued, 1);
});

check("only walking out with the treasure clears a dungeon", () => {
  const carried = { ...createRunRoundTrip(), treasure: true };
  const walked = { unlockedMilestones: [] };
  settleDungeonClears(walked, runWith("surface", carried));
  assert.deepEqual(walked.unlockedMilestones, [5]);
  // The result screen drops the treasure of any other safe return first.
  const winged = { unlockedMilestones: [] };
  settleDungeonClears(winged, runWith("escape_scroll", { ...carried, treasure: false }));
  assert.deepEqual(winged.unlockedMilestones, []);
});

check("a death on the way back says how far the surface was; on the way down, the guardian", () => {
  const awake = { ...createRunRoundTrip(), awake: true };
  assert.deepEqual(buildDeathNearMiss({ floor: 3, deepestFloor: 5, roundTrip: awake }).portal, { kind: "surface", floor: 3, gap: 3 });
  assert.deepEqual(buildDeathNearMiss({ floor: 8, deepestFloor: 8, roundTrip: createRunRoundTrip() }).portal, { kind: "guardian", floor: 10, gap: 2 });
  // A run saved before #2062 still speaks of the Portal.
  assert.equal(buildDeathNearMiss({ floor: 3, deepestFloor: 3 }).portal.kind, "ahead");
});

function patrolTouches(grid, spot, onlyWay) {
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const seen = new Set([`${spot.x},${spot.y}`]);
  const queue = [spot];
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const next = { x: pos.x + DX[dir], y: pos.y + DY[dir] };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !grid[next.y]?.[next.x]) continue;
      if (Math.abs(next.x - spot.x) + Math.abs(next.y - spot.y) > ELITE_PATROL_RADIUS) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return [...seen].some(key => onlyWay.has(key));
}

check("a roaming elite's patrol stays off the only way to the guardian and the down stairs (#2056)", () => {
  let touched = 0;
  let floors = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const runSeed = `PT-${seed}:run:1700000000000`;
    let parent = null;
    for (let floor = 1; floor <= 5; floor += 1) {
      const { grid, stairsDownCoord } = generateRunFloor({ runSeed, floor, parentStairsCoord: parent });
      parent = stairsDownCoord || null;
      if (floor < 3) continue;
      const start = (() => {
        for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) if (grid[y][x].type === "stairs-up") return { x, y };
        return null;
      })();
      const onlyWay = findOnlyWayCells(grid);
      assert.ok(onlyWay.size > 0, `${runSeed} B${floor}: the stairs approach is always an only way`);
      const spot = findEliteStart(grid, start, createRng(`${runSeed}:elite-spawn:B${floor}`));
      assert.ok(spot, `${runSeed} B${floor}: an elite can still be placed`);
      floors += 1;
      if (patrolTouches(grid, spot, onlyWay)) touched += 1;
    }
  }
  assert.equal(touched, 0, `${touched} of ${floors} floors put an elite's patrol on the only way`);
});

check("the reported floor of #2056 (PT-30, B5) keeps its elite off the corridor to the guardian", () => {
  const runSeed = "PT-30:run:1700000000000";
  let parent = null;
  let grid = null;
  for (let floor = 1; floor <= 5; floor += 1) {
    const generated = generateRunFloor({ runSeed, floor, parentStairsCoord: parent });
    parent = generated.stairsDownCoord || null;
    grid = generated.grid;
  }
  const onlyWay = findOnlyWayCells(grid);
  const start = { x: -1, y: -1 };
  grid.forEach((row, y) => row.forEach((cell, x) => { if (cell.type === "stairs-up") Object.assign(start, { x, y }); }));
  const spot = findEliteStart(grid, start, createRng(`${runSeed}:elite-spawn:B5`));
  assert.equal(patrolTouches(grid, spot, onlyWay), false);
});

if (failures > 0) {
  console.error(`${failures} round-trip (#2062) check(s) failed`);
  process.exit(1);
}
console.log("round-trip (#2062) checks passed");
