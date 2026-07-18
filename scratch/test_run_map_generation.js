import assert from "node:assert/strict";
import "./sim_run_floor_templates.js";
import { FLOOR_TEMPLATES, getFloorTemplate } from "../src/data/floor_templates.js";
import { generateRunFloor, validateGeneratedFloor } from "../src/run_map_generator.js";
import { deriveFloorAttemptSeed, deriveFloorSeed } from "../src/seed_rng.js";

const failures = [];

function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function isolateCell(grid, target) {
  const directions = [
    { dx: 0, dy: -1, opposite: 2 },
    { dx: 1, dy: 0, opposite: 3 },
    { dx: 0, dy: 1, opposite: 0 },
    { dx: -1, dy: 0, opposite: 1 }
  ];
  directions.forEach(({ dx, dy, opposite }, dir) => {
    grid[target.y][target.x].walls[dir] = true;
    const neighbor = grid[target.y + dy][target.x + dx];
    neighbor.walls[opposite] = true;
    neighbor.secretDoor[opposite] = false;
    neighbor.sealedGate[opposite] = null;
    grid[target.y][target.x].secretDoor[dir] = false;
    grid[target.y][target.x].sealedGate[dir] = null;
  });
}

check("three depth templates are declared", () => {
  assert.equal(FLOOR_TEMPLATES.length, 3);
  assert.equal(getFloorTemplate(1).id, "shallow");
  assert.equal(getFloorTemplate(11).id, "middle");
  assert.equal(getFloorTemplate(21).id, "deep");
  assert.notDeepEqual(FLOOR_TEMPLATES[0].roomCountRange, FLOOR_TEMPLATES[2].roomCountRange);
  assert.notDeepEqual(FLOOR_TEMPLATES[0].gimmickDensity, FLOOR_TEMPLATES[2].gimmickDensity);
});

check("floor and attempt child seeds are deterministic", () => {
  const first = deriveFloorSeed("RUN-148", 7);
  assert.equal(first, deriveFloorSeed("RUN-148", 7));
  assert.notEqual(first, deriveFloorSeed("RUN-148", 8));
  assert.notEqual(first, deriveFloorSeed("RUN-149", 7));
  assert.notEqual(deriveFloorAttemptSeed(first, 0), deriveFloorAttemptSeed(first, 1));
});

for (const template of FLOOR_TEMPLATES) {
  check(`${template.id} floor is reproducible and valid`, () => {
    const floor = template.minDepth;
    const first = generateRunFloor({ runSeed: "RUN-REPRODUCTION", floor });
    const resumed = generateRunFloor({ runSeed: "RUN-REPRODUCTION", floor });
    assert.deepEqual(first.grid, resumed.grid);
    assert.equal(first.floorSeed, resumed.floorSeed);
    assert.equal(first.generationAttempt, resumed.generationAttempt);
    assert.equal(first.templateId, template.id);
    assert.equal(first.grid.length, template.size.height);
    assert.ok(first.grid.every(row => row.length === template.size.width));
    assert.ok(first.rooms.length >= template.roomCountRange[0]);
    assert.ok(first.rooms.length <= template.roomCountRange[1]);
    assert.equal(first.validation.walkableCells, first.validation.reachableCells);
    assert.ok(first.validation.criticalPath >= template.criticalPathRange[0]);
    assert.ok(first.validation.criticalPath <= template.criticalPathRange[1]);
  });
}

check("different runs reseed the same floor", () => {
  const first = generateRunFloor({ runSeed: "RUN-A", floor: 11 });
  const second = generateRunFloor({ runSeed: "RUN-B", floor: 11 });
  assert.notEqual(first.floorSeed, second.floorSeed);
  assert.notDeepEqual(first.grid, second.grid);
});

check("unreachable walkable cells are rejected", () => {
  const generated = generateRunFloor({ runSeed: "RUN-CORRUPT", floor: 1 });
  const corrupted = clone(generated);
  isolateCell(corrupted.grid, corrupted.stairsDownCoord);
  const validation = validateGeneratedFloor(corrupted, getFloorTemplate(1));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.includes("unreachable")));
});

check("generation retries have a hard upper bound", () => {
  assert.throws(
    () => generateRunFloor({
      runSeed: "RUN-BOUNDED",
      floor: 11,
      parentStairsCoord: { x: -1, y: -1 },
      maxAttempts: 2
    }),
    /generation failed after 2 attempts/
  );
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${FLOOR_TEMPLATES.length} templates: reseed, resume, reachability, and retry bounds verified.`);
