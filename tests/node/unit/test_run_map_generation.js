import assert from "node:assert/strict";
import { FLOOR_TEMPLATES, getFloorTemplate } from "../../../src/data/floor_templates.js";
import { generateRunFloor, validateGeneratedFloor } from "../../../src/run_map_generator.js";
import { deriveFloorAttemptSeed, deriveFloorSeed } from "../../../src/seed_rng.js";

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
    grid[target.y][target.x].secretDoor[dir] = false;
  });
}

check("three depth templates are declared", () => {
  assert.equal(FLOOR_TEMPLATES.length, 3);
  assert.equal(getFloorTemplate(1).id, "shallow");
  // The template is the dungeon's (#2064): every dungeon opened so far is as
  // big as the first; the throne still names the deep template.
  assert.equal(getFloorTemplate(11).id, "shallow");
  assert.equal(getFloorTemplate(16).id, "shallow");
  assert.equal(getFloorTemplate(21).id, "shallow");
  assert.equal(getFloorTemplate(26).id, "deep");
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

// Each template a dungeon uses (#2064); one no dungeon names is not built.
const usedTemplates = FLOOR_TEMPLATES.filter(template =>
  Array.from({ length: 30 }, (_, index) => index + 1).some(depth => getFloorTemplate(depth).id === template.id));
for (const template of usedTemplates) {
  check(`${template.id} floor is reproducible and valid`, () => {
    // The first floor whose dungeon uses this template (#2064).
    const floor = Array.from({ length: 30 }, (_, index) => index + 1).find(depth => getFloorTemplate(depth).id === template.id);
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
      // The second floor of a dungeon: its entry is the stairs from above.
      // A dungeon's first floor chooses its own entrance (#2060).
      floor: 12,
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
