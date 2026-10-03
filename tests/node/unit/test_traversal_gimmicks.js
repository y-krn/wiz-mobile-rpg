import assert from "node:assert/strict";
import { getBiomeForFloor } from "../../../src/data/biomes.js";
import { getFloorTemplate } from "../../../src/data/floor_templates.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import {
  RUBBLE_CLEAR_TURNS,
  advanceRubbleClearing,
  collectNaturallyReachableKeys,
  discoverAdjacentTraversalFeatures,
  getTraversalMarkerKind,
  isTraversalObstacleBlocking,
  pullLeverAt
} from "../../../src/rules/traversal_gimmicks.js";
import { SAVE_VERSION, migrateSavePayload } from "../../../src/state/save_migrations.js";
import { FULL_MAP_LEGEND, getFullMapModel } from "../../../src/ui/full_map.js";

// #1963: biome traversal gimmicks are deterministic, never gate the floor
// exit, survive a save round trip, and are visible to the map views.
const SEEDS = 24;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function findCells(grid, predicate) {
  const cells = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (predicate(cell)) cells.push({ x, y, cell });
  }));
  return cells;
}

function naturalDistance(grid, from, to) {
  const distances = new Map([[`${from.x},${from.y}`, 0]]);
  const queue = [from];
  for (const pos of queue) {
    const cell = grid[pos.y][pos.x];
    for (let dir = 0; dir < 4; dir++) {
      if (cell.walls[dir]) continue;
      const nx = pos.x + DX[dir];
      const ny = pos.y + DY[dir];
      const next = grid[ny]?.[nx];
      const key = `${nx},${ny}`;
      if (!next || distances.has(key) || next.blockEnter[(dir + 2) % 4] || isTraversalObstacleBlocking(next)) continue;
      distances.set(key, distances.get(`${pos.x},${pos.y}`) + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return distances.get(`${to.x},${to.y}`);
}

function stairsOf(grid) {
  return {
    start: findCells(grid, cell => cell.type === "stairs-up")[0],
    stairs: findCells(grid, cell => cell.type === "stairs-down")[0]
  };
}

for (const floor of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31, 36]) {
  const kind = getBiomeForFloor(floor).gimmicks.traversal;
  const template = getFloorTemplate(floor);
  const floorInBiome = (floor - 1) % 5;
  for (let seedIndex = 0; seedIndex < SEEDS; seedIndex++) {
    const runSeed = `ISSUE-1963-${seedIndex}`;
    const label = `B${floor} ${runSeed}`;
    const generated = generateRunFloor({ runSeed, floor });
    const repeated = generateRunFloor({ runSeed, floor });
    assert.deepEqual(generated.grid, repeated.grid, `${label} is not deterministic`);
    assert.equal(generated.generationAttempt, 0, `${label} needed a retry`);
    const { grid } = generated;
    const { start, stairs } = stairsOf(grid);
    const obstacles = findCells(grid, cell => cell.obstacle);
    const levers = findCells(grid, cell => cell.lever);

    // The exit stays inside the critical-path envelope with every obstacle intact.
    const critical = naturalDistance(grid, start, stairs);
    assert.ok(critical >= template.criticalPathRange[0] && critical <= template.criticalPathRange[1],
      `${label} critical path ${critical}`);
    const reachable = collectNaturallyReachableKeys(grid, start);
    findCells(grid, cell => ["boss", "merchant", "portal", "camp", "spring"].includes(cell.event))
      .forEach(({ x, y }) => assert.ok(reachable.has(`${x},${y}`), `${label} facility ${x},${y} is gated`));

    if (kind === "rubble") {
      assert.equal(obstacles.length, floorInBiome >= 2 ? 2 : 1, `${label} rubble count`);
      assert.equal(levers.length, 0);
      for (const { x, y, cell } of obstacles) {
        assert.equal(cell.obstacle.kind, "rubble");
        assert.equal(cell.obstacle.state, "intact");
        assert.ok(!cell.event && !cell.trap && cell.type === "empty", `${label} rubble on content`);
        const open = cell.walls.map((wall, dir) => (wall ? -1 : dir)).filter(dir => dir !== -1);
        assert.equal(open.length, 2, `${label} rubble is not a corridor cell`);
        // Both sides stay connected without digging.
        const [a, b] = open.map(dir => ({ x: x + DX[dir], y: y + DY[dir] }));
        assert.ok(reachable.has(`${a.x},${a.y}`) && reachable.has(`${b.x},${b.y}`), `${label} rubble cuts the floor`);
      }
    } else if (kind === "seal") {
      assert.equal(obstacles.length, 1, `${label} seal count`);
      assert.equal(levers.length, 1, `${label} lever count`);
      const gate = obstacles[0];
      const lever = levers[0];
      assert.equal(gate.cell.obstacle.kind, "seal");
      assert.equal(lever.cell.lever.sealId, gate.cell.obstacle.id);
      assert.ok(reachable.has(`${lever.x},${lever.y}`), `${label} lever is behind the seal`);
      // The seal closes a branch with treasure that opens once the lever is pulled.
      const before = new Set(reachable);
      const copy = structuredClone(grid);
      assert.deepEqual(pullLeverAt(copy, lever.x, lever.y), [{ x: gate.x, y: gate.y }]);
      const after = collectNaturallyReachableKeys(copy, start);
      const opened = [...after].filter(key => !before.has(key));
      assert.ok(opened.length >= 2, `${label} seal opened nothing`);
      assert.ok(opened.some(key => {
        const [ox, oy] = key.split(",").map(Number);
        return copy[oy][ox].event === "chest";
      }), `${label} sealed branch has no chest`);
      assert.equal(naturalDistance(copy, start, stairs), critical, `${label} seal lengthened the route`);
    } else {
      assert.equal(obstacles.length + levers.length, 0, `${label} has unexpected gimmicks`);
    }
  }
}

// Biomes without a traversal gimmick yet stay untouched.
for (const floor of [11, 16, 21, 26]) {
  const generated = generateRunFloor({ runSeed: "ISSUE-1963-OTHER", floor });
  assert.equal(findCells(generated.grid, cell => cell.obstacle || cell.lever).length, 0, `B${floor} gimmick leak`);
}

// Rules: digging takes RUBBLE_CLEAR_TURNS turns; discovery and markers.
{
  const rubble = { obstacle: { kind: "rubble", state: "intact", progress: 0, discovered: false } };
  assert.equal(isTraversalObstacleBlocking(rubble), true);
  assert.equal(getTraversalMarkerKind(rubble), null, "undiscovered rubble stays off the map");
  for (let turn = 1; turn < RUBBLE_CLEAR_TURNS; turn++) assert.equal(advanceRubbleClearing(rubble), false);
  assert.equal(advanceRubbleClearing(rubble), true);
  assert.equal(isTraversalObstacleBlocking(rubble), false);
  assert.equal(advanceRubbleClearing(rubble), false, "cleared rubble needs no more digging");

  const walls = open => [0, 1, 2, 3].map(dir => !open.includes(dir));
  const grid = [[
    { walls: walls([1]), blockEnter: [false, false, false, false] },
    { walls: walls([1, 3]), blockEnter: [false, false, false, false], obstacle: { kind: "seal", id: "s", state: "sealed", discovered: false } },
    { walls: walls([3]), blockEnter: [false, false, false, false], lever: { sealId: "s", state: "up", discovered: false } }
  ]];
  assert.equal(discoverAdjacentTraversalFeatures(grid, 0, 0).length, 1);
  assert.equal(getTraversalMarkerKind(grid[0][1]), "seal");
  assert.equal(getTraversalMarkerKind(grid[0][2]), null, "a lever behind the seal is not seen");
  assert.deepEqual(pullLeverAt(grid, 2, 0), [{ x: 1, y: 0 }]);
  assert.equal(pullLeverAt(grid, 2, 0), null, "a pulled lever does nothing");
  assert.equal(getTraversalMarkerKind(grid[0][1]), null, "an open seal leaves the map");
  assert.equal(getTraversalMarkerKind(grid[0][2]), "lever-pulled");
}

// Save round trip keeps gimmick state.
{
  const generated = generateRunFloor({ runSeed: "ISSUE-1963-SAVE", floor: 6 });
  const lever = findCells(generated.grid, cell => cell.lever)[0];
  pullLeverAt(generated.grid, lever.x, lever.y);
  const restored = migrateSavePayload(JSON.parse(JSON.stringify({ version: SAVE_VERSION, floor: 1, currentRun: { runSeed: "ISSUE-1963-SAVE" }, maps: [generated.grid] })));
  const gate = findCells(restored.maps[0], cell => cell.obstacle)[0];
  assert.equal(gate.cell.obstacle.state, "open");
  assert.equal(restored.maps[0][lever.y][lever.x].lever.state, "pulled");
}

// The full map marks discovered gimmicks and their legend rows.
{
  const cell = obstacle => ({ walls: [true, false, true, false], blockEnter: [false, false, false, false], type: "empty", ...obstacle });
  const map = [[
    cell({}),
    cell({ obstacle: { kind: "rubble", state: "intact", progress: 0, discovered: true } }),
    cell({ obstacle: { kind: "seal", id: "s", state: "sealed", discovered: false } }),
    cell({ lever: { sealId: "s", state: "up", discovered: true } })
  ]];
  const model = getFullMapModel({
    kind: "renderer-input",
    view: { hasMap: true },
    sceneVisibility: {},
    floor: 1,
    x: 0,
    y: 0,
    dir: 1,
    map,
    visitedMap: [[true, false, false, false]],
    mapFragments: [],
    lightTurns: 0,
    lightPower: null,
    roamingMonsters: [],
    hasArcaneSense: false
  });
  const kinds = model.markers.map(marker => `${marker.kind}@${marker.x}`);
  assert.ok(kinds.includes("rubble@1"), "discovered rubble is marked");
  assert.ok(kinds.includes("lever@3"), "a discovered lever is marked");
  assert.ok(!kinds.some(kind => kind.startsWith("seal")), "an undiscovered seal stays hidden");
  const legend = new Set(FULL_MAP_LEGEND.map(({ kind }) => kind));
  ["rubble", "seal", "lever", "lever-pulled"].forEach(kind => assert.ok(legend.has(kind), `${kind} legend`));
}

console.log("[PASS] Issue #1963 traversal gimmicks are deterministic, keep the exit reachable, and persist.");
