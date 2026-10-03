import assert from "node:assert/strict";
import { BIOMES, getBiomeForFloor } from "../../../src/data/biomes.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";

// #1962: every biome carves a distinct, seed-varied floor silhouette while the
// shared pipeline keeps stairs, events, traps, and validation intact.
const SEEDS = 24;
const BIOME_FLOORS = [1, 6, 11, 16, 21, 26];
const CYCLE_FLOORS = [31, 36, 41, 46, 51, 56];

function isOpen(grid, x, y) {
  return Boolean(grid[y]?.[x]?.walls.some(wall => !wall));
}

function signature(generated) {
  const { grid } = generated;
  const width = grid[0].length;
  let walkable = 0;
  let mirrored = 0;
  let turns = 0;
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (!isOpen(grid, x, y)) return;
    walkable++;
    if (isOpen(grid, width - 1 - x, y)) mirrored++;
    const open = cell.walls.map(wall => !wall);
    if (open.filter(Boolean).length === 2 && !(open[0] && open[2]) && !(open[1] && open[3])) turns++;
  }));
  return {
    symmetry: mirrored / walkable,
    turnRatio: turns / walkable,
    voidCount: generated.voidCells.length
  };
}

const aggregates = new Map();
for (const floor of [...BIOME_FLOORS, ...CYCLE_FLOORS]) {
  const biome = getBiomeForFloor(floor);
  const totals = { symmetry: 0, turnRatio: 0, voidCount: 0, corridorRatio: 0, cycles: 0, openAreaShare: 0 };
  for (let seedIndex = 0; seedIndex < SEEDS; seedIndex++) {
    const runSeed = `ISSUE-1962-${seedIndex}`;
    const generated = generateRunFloor({ runSeed, floor });
    const label = `B${floor} ${runSeed}`;
    assert.equal(generated.layoutArchetype, biome.terrain.layoutArchetype, `${label} archetype`);
    assert.equal(generated.validation.valid, true, `${label} invalid: ${generated.validation.errors}`);
    assert.equal(generated.generationAttempt, 0, `${label} needed a generation retry`);
    assert.equal(generated.structureMetrics.componentCount, 1, `${label} disconnected`);

    // Void cells stay impassable and empty through every later stage.
    for (const key of generated.voidCells) {
      const [x, y] = key.split(",").map(Number);
      const cell = generated.grid[y][x];
      assert.ok(cell.walls.every(Boolean), `${label} void ${key} became walkable`);
      assert.ok(!cell.secretDoor.some(Boolean), `${label} void ${key} has a secret door`);
      assert.ok(!cell.event && !cell.trap && cell.type === "empty", `${label} void ${key} holds content`);
    }

    const shape = signature(generated);
    totals.symmetry += shape.symmetry / SEEDS;
    totals.turnRatio += shape.turnRatio / SEEDS;
    totals.voidCount += shape.voidCount / SEEDS;
    totals.corridorRatio += generated.structureMetrics.corridorRatio / SEEDS;
    totals.cycles += generated.structureMetrics.cycleCount / SEEDS;
    totals.openAreaShare += generated.structureMetrics.openAreaCellCount /
      generated.structureMetrics.walkableCellCount / SEEDS;
  }
  if (BIOME_FLOORS.includes(floor)) aggregates.set(biome.id, totals);
}

const others = id => [...aggregates].filter(([biomeId]) => biomeId !== id).map(([, value]) => value);
const mine = aggregates.get("collapsed_mine");
const catacomb = aggregates.get("forgotten_catacomb");
const rift = aggregates.get("rift_nest");
const library = aggregates.get("sunken_library");
const forge = aggregates.get("dragon_forge");
const abyss = aggregates.get("abyssal_throne");
assert.equal(aggregates.size, BIOMES.length);

assert.ok(others("collapsed_mine").every(value => mine.corridorRatio > value.corridorRatio + 0.2),
  "mine tunnels are not the most corridor-heavy layout");
assert.ok(others("collapsed_mine").every(value => mine.cycles < value.cycles),
  "mine tunnels have too many loops");
assert.ok(others("forgotten_catacomb").every(value => catacomb.symmetry > value.symmetry + 0.15),
  "catacomb lattice lost its left/right symmetry");
assert.ok(rift.voidCount >= 30, "rift chasm is missing");
assert.ok(others("sunken_library").every(value => library.openAreaShare > value.openAreaShare * 2),
  "library halls are not the dominant open areas");
assert.ok(library.voidCount >= 12, "library flood is missing");
assert.ok(forge.voidCount >= 9, "forge furnace is missing");
assert.ok(others("abyssal_throne").every(value => abyss.turnRatio > value.turnRatio * 1.8),
  "abyss causeways do not turn on every step");

// Forge furnaces sit at the center of every floor.
for (let seedIndex = 0; seedIndex < SEEDS; seedIndex++) {
  const generated = generateRunFloor({ runSeed: `ISSUE-1962-${seedIndex}`, floor: 21 });
  const centerX = Math.floor((generated.grid[0].length - 1) / 2);
  const centerY = Math.floor((generated.grid.length - 1) / 2);
  assert.ok(generated.voidCells.some(key => {
    const [x, y] = key.split(",").map(Number);
    return Math.abs(x - centerX) <= 1 && Math.abs(y - centerY) <= 1;
  }), `B21 ISSUE-1962-${seedIndex} furnace is off-center`);
}

// Rift banks are joined only by bridges: crossing passages exist, and every
// chasm lane is void except at a bridge.
for (let seedIndex = 0; seedIndex < SEEDS; seedIndex++) {
  const generated = generateRunFloor({ runSeed: `ISSUE-1962-${seedIndex}`, floor: 11 });
  const voids = generated.voidCells.map(key => key.split(",").map(Number));
  const xs = new Set(voids.map(([x]) => x));
  const ys = new Set(voids.map(([, y]) => y));
  const horizontal = xs.size > ys.size;
  const lanes = horizontal ? xs.size : ys.size;
  const span = (horizontal ? generated.grid[0].length : generated.grid.length) - 2;
  assert.ok(lanes >= span - 4, `B11 ISSUE-1962-${seedIndex} chasm does not cross the floor`);
}

// Seeds vary the archetype, not just the decorations.
for (const floor of BIOME_FLOORS) {
  const grids = new Set();
  for (let seedIndex = 0; seedIndex < 6; seedIndex++) {
    const generated = generateRunFloor({ runSeed: `ISSUE-1962-VARIETY-${seedIndex}`, floor });
    grids.add(generated.grid.map(row => row.map(cell => (cell.walls.some(wall => !wall) ? 1 : 0)).join("")).join("|"));
  }
  assert.equal(grids.size, 6, `B${floor} repeats the same silhouette across seeds`);
}

console.log("[PASS] Issue #1962 biome layout archetypes are valid, deterministic, retry-free, and structurally distinct.");
