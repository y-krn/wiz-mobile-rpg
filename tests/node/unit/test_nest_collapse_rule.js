// The rift nest's rule (#2063): many crumbling ledges, each falls once
// crossed. However many have fallen, the way down and the way back still
// exist: from the up stairs to the down stairs and the guardian, and back.
import { strict as assert } from "node:assert";
import { DUNGEONS } from "../../../src/data/dungeons.js";
import { getDungeonEntryFloor, getDungeonRule } from "../../../src/rules/dungeons.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import { collapseCrumbleAt, isTraversalObstacleBlocking } from "../../../src/rules/traversal_gimmicks.js";
import { DX, DY } from "../../../src/constants/directions.js";

const nest = DUNGEONS.find(dungeon => dungeon.id === "rift_nest");
const entry = getDungeonEntryFloor(nest.index);
assert.equal(nest.built, true, "the nest is open to be earned");
assert.equal(getDungeonRule(entry)?.id, "collapse");
assert.match(getDungeonRule(entry).line, /^崩落：/);

const OPPOSITE = [2, 3, 0, 1];
function reachable(grid, from) {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir] && !cell.secretDoor?.[dir]) continue;
      const x = pos.x + DX[dir];
      const y = pos.y + DY[dir];
      const next = grid[y]?.[x];
      if (!next || seen.has(`${x},${y}`) || next.blockEnter?.[OPPOSITE[dir]] || isTraversalObstacleBlocking(next)) continue;
      seen.add(`${x},${y}`);
      queue.push({ x, y });
    }
  }
  return seen;
}
const find = (grid, predicate) => {
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) if (predicate(grid[y][x])) return { x, y };
  return null;
};

let ledges = 0;
for (let floorInDungeon = 1; floorInDungeon <= 5; floorInDungeon++) {
  for (const seed of ["A", "B", "C", "D"]) {
    const floor = entry + floorInDungeon - 1;
    const { grid } = generateRunFloor({ runSeed: `NEST-${seed}`, floor });
    const placed = [];
    grid.forEach((row, y) => row.forEach((cell, x) => { if (cell.obstacle?.kind === "crumble") placed.push({ x, y }); }));
    ledges += placed.length;
    // Every ledge falls.
    placed.forEach(({ x, y }) => assert.equal(collapseCrumbleAt(grid, x, y), true));
    const up = find(grid, cell => cell.type === "stairs-up");
    const goal = find(grid, cell => cell.event === "boss") || find(grid, cell => cell.type === "stairs-down");
    assert.ok(up && goal, `floor ${floorInDungeon}: stairs found`);
    // The way down and the way back still exist with every ledge down.
    assert.ok(reachable(grid, up).has(`${goal.x},${goal.y}`), `floor ${floorInDungeon} seed ${seed}: the way down survives`);
    assert.ok(reachable(grid, goal).has(`${up.x},${up.y}`), `floor ${floorInDungeon} seed ${seed}: the way back survives`);
  }
}
// The rule makes ledges common: more than the one or two other biomes would get.
assert.ok(ledges / 20 >= 2.5, `ledges per floor ${ledges / 20}`);

console.log("[PASS] the nest's ledges are many, and the way down and back survive every fall");
