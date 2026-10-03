import assert from "node:assert/strict";
import { getBiomeForFloor } from "../../../src/data/biomes.js";
import { getFloorTemplate } from "../../../src/data/floor_templates.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";
import {
  HEAT_ACTIVE_TURNS,
  HEAT_CYCLE_TURNS,
  RUBBLE_CLEAR_TURNS,
  collapseCrumbleAt,
  getHeatDamage,
  getSpinnerFacing,
  isHeatActive,
  refreshHeatHazards,
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

for (const floor of [1, 3, 6, 8, 11, 13, 16, 18, 21, 23, 26, 28, 31, 36, 41, 46, 51, 56]) {
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
    const hazards = findCells(grid, cell => cell.hazard);
    const expectedCount = floorInBiome >= 2 ? 2 : 1;

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
    } else if (kind === "crumble") {
      assert.equal(obstacles.length, expectedCount, `${label} ledge count`);
      assert.equal(hazards.length + levers.length, 0);
      for (const { x, y, cell } of obstacles) {
        assert.equal(cell.obstacle.kind, "crumble");
        assert.equal(cell.obstacle.state, "intact", "an intact ledge is walkable");
        assert.equal(isTraversalObstacleBlocking(cell), false);
        // Once fallen, both sides still reach the stairs and every facility.
        const copy = structuredClone(grid);
        assert.equal(collapseCrumbleAt(copy, x, y), true);
        const required = findCells(copy, other => other.type === "stairs-down" ||
          (other.event && other.event !== "chest"));
        cell.walls.forEach((wall, dir) => {
          if (wall) return;
          const side = { x: x + DX[dir], y: y + DY[dir] };
          const fromSide = collectNaturallyReachableKeys(copy, side);
          required.forEach(target => assert.ok(fromSide.has(`${target.x},${target.y}`),
            `${label} fallen ledge strands ${target.x},${target.y}`));
        });
      }
    } else if (kind === "flood" || kind === "heat" || kind === "spinner") {
      assert.equal(obstacles.length + levers.length, 0);
      assert.equal(generated.traversalGimmicks.length, expectedCount, `${label} ${kind} count`);
      assert.ok(hazards.every(({ cell }) => cell.hazard.kind === kind && !cell.hazard.discovered));
      assert.ok(hazards.every(({ cell }) => cell.type === "empty" && !cell.event && !cell.trap), `${label} hazard on content`);
      if (kind === "flood") {
        assert.ok(hazards.length >= 2 * expectedCount && hazards.length <= 4 * expectedCount, `${label} flood size`);
      } else if (kind === "heat") {
        assert.equal(hazards.length, 2 * expectedCount, `${label} heat size`);
        assert.ok(hazards.every(({ cell }) => cell.hazard.phase >= 0 && cell.hazard.phase < HEAT_CYCLE_TURNS));
      } else {
        assert.equal(hazards.length, expectedCount);
        assert.ok(hazards.every(({ cell }) => cell.walls.filter(wall => !wall).length >= 3), `${label} spinner off a junction`);
      }
    } else {
      assert.fail(`${label} biome has no traversal gimmick`);
    }
  }
}

// Heat vents follow a visible cycle; spinners always turn; ledges fall once.
{
  const vent = { kind: "heat", phase: 1 };
  const pattern = Array.from({ length: HEAT_CYCLE_TURNS * 2 }, (_, turn) => isHeatActive(vent, turn));
  assert.equal(pattern.filter(Boolean).length, HEAT_ACTIVE_TURNS * 2);
  assert.deepEqual(pattern.slice(0, HEAT_CYCLE_TURNS), pattern.slice(HEAT_CYCLE_TURNS), "heat repeats every cycle");
  assert.equal(getHeatDamage(45), Math.ceil(45 * 0.12));
  const grid = [[{ hazard: { kind: "heat", phase: 0, hot: false } }]];
  assert.equal(refreshHeatHazards(grid, 0), true);
  assert.equal(grid[0][0].hazard.hot, true);
  assert.equal(refreshHeatHazards(grid, 1), false, "unchanged heat reports no change");
  for (let dir = 0; dir < 4; dir++) {
    for (let turn = 0; turn < 6; turn++) assert.notEqual(getSpinnerFacing(3, 5, turn, dir), dir);
  }
  const ledge = [[{ obstacle: { kind: "crumble", state: "intact", discovered: false } }]];
  assert.equal(collapseCrumbleAt(ledge, 0, 0), true);
  assert.equal(isTraversalObstacleBlocking(ledge[0][0]), true);
  assert.equal(collapseCrumbleAt(ledge, 0, 0), false);
  assert.equal(getTraversalMarkerKind(ledge[0][0]), "crumble-collapsed");
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
  ["rubble", "seal", "lever", "lever-pulled", "crumble", "crumble-collapsed", "flood", "heat", "spinner"]
    .forEach(kind => assert.ok(legend.has(kind), `${kind} legend`));
}

console.log("[PASS] Issue #1963 traversal gimmicks are deterministic, keep the exit reachable, and persist.");
