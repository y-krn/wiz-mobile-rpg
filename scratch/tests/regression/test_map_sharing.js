import assert from "node:assert/strict";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const failures = [];

function findCells(grid, predicate) {
  const cells = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (predicate(cell)) cells.push({ x, y, cell });
  }));
  return cells;
}

function mapFingerprint(generated) {
  const grid = generated.grid.map(row => row.map(cell => ({
    type: cell.type,
    walls: [...cell.walls],
    blockEnter: cell.blockEnter ? [...cell.blockEnter] : null,
    secretDoor: cell.secretDoor ? [...cell.secretDoor] : null,
    event: cell.event || null,
    milestoneFloor: cell.milestoneFloor || null,
    trap: cell.trap
      ? {
          id: cell.trap.id,
          type: cell.trap.type,
          state: cell.trap.state,
          position: { ...cell.trap.position }
        }
      : null
  })));
  return {
    floorSeed: generated.floorSeed,
    generationSeed: generated.generationSeed,
    generationAttempt: generated.generationAttempt,
    stairsUp: findCells(generated.grid, cell => cell.type === "stairs-up")
      .map(({ x, y }) => ({ x, y })),
    stairsDown: findCells(generated.grid, cell => cell.type === "stairs-down")
      .map(({ x, y }) => ({ x, y })),
    events: findCells(generated.grid, cell => Boolean(cell.event))
      .map(({ x, y, cell }) => ({ x, y, event: cell.event, milestoneFloor: cell.milestoneFloor || null })),
    traps: findCells(generated.grid, cell => Boolean(cell.trap))
      .map(({ x, y, cell }) => ({ x, y, ...cell.trap })),
    grid
  };
}

for (const { runSeed, floor } of [
  { runSeed: "ISSUE-457-SAME-SEED", floor: 1 },
  { runSeed: "ISSUE-457-SAME-SEED", floor: 5 },
  { runSeed: "ISSUE-457-SAME-SEED", floor: 15 },
  { runSeed: "ISSUE-457-SAME-SEED", floor: 20 }
]) {
  try {
    const first = mapFingerprint(generateRunFloor({ runSeed, floor }));
    const second = mapFingerprint(generateRunFloor({ runSeed, floor }));
    assert.deepEqual(second, first, `${runSeed}/B${floor} map changed on regeneration`);
  } catch (error) {
    failures.push(`${runSeed}/B${floor}: ${error.message}`);
  }
}

try {
  assert.notDeepEqual(
    mapFingerprint(generateRunFloor({ runSeed: "ISSUE-457-A", floor: 15 })),
    mapFingerprint(generateRunFloor({ runSeed: "ISSUE-457-B", floor: 15 })),
    "different run seeds should not share a map"
  );
} catch (error) {
  failures.push(`seed separation: ${error.message}`);
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] #457 same-seed map fingerprint: grid, walls, events, stairs, and traps");
