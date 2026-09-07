import assert from "node:assert/strict";
import { BIOMES, getBiomeForFloor, getBiomeTerrainForFloor, getDepthCorruption } from "../../../src/data/biomes.js";
import { FLOOR_TEMPLATES, getFloorTemplate } from "../../../src/data/floor_templates.js";
import { getFloorTheme } from "../../../src/data/floor_themes.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const failures = [];
const check = (label, fn) => {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};

check("every biome has a distinct canonical visual signature", () => {
  const signatures = BIOMES.map(biome => biome.visualSignature);
  assert.equal(new Set(signatures.map(signature => signature.wallColor)).size, BIOMES.length);
  assert.equal(new Set(signatures.map(signature => signature.gridColor)).size, BIOMES.length);
  signatures.forEach(signature => {
    assert.match(signature.wallColor, /^#[0-9a-f]{6}$/i);
    assert.match(signature.gridColor, /^rgba\(/);
    assert.ok(signature.environment.overlay);
  });
});

check("depth corruption is monotonic and uses the cycle boundary", () => {
  const depths = Array.from({ length: 61 }, (_, index) => getDepthCorruption(index + 1));
  for (let index = 1; index < depths.length; index++) {
    assert.ok(depths[index] > depths[index - 1], `B${index} to B${index + 1} is not monotonic`);
  }
  assert.equal(getBiomeForFloor(1).id, getBiomeForFloor(31).id);
  assert.ok(getDepthCorruption(31) > getDepthCorruption(30));
});

check("every biome boundary changes the consumed terrain profile", () => {
  const boundaryFloors = [1, 6, 11, 16, 21, 26];
  const profiles = boundaryFloors.map(floor => getBiomeTerrainForFloor(floor));
  for (let index = 1; index < profiles.length; index++) {
    assert.notDeepEqual(profiles[index], profiles[index - 1]);
  }
});

check("all representative and boundary floors validate without fallback", () => {
  const floors = [3, 5, 6, 8, 10, 11, 13, 16, 18, 21, 23, 26, 28, 30, 31];
  floors.forEach(floor => {
    const first = generateRunFloor({ runSeed: "ISSUE-705-DETERMINISTIC", floor });
    const second = generateRunFloor({ runSeed: "ISSUE-705-DETERMINISTIC", floor });
    assert.equal(first.validation.valid, true, `B${floor} validation failed`);
    assert.equal(first.generationAttempt, 0, `B${floor} needed a generation retry`);
    assert.deepEqual(first.grid, second.grid, `B${floor} is not deterministic`);
    assert.equal(first.biomeId, getBiomeForFloor(floor).id);
    assert.equal(first.biomeCycle, Math.floor((floor - 1) / 30));
    assert.equal(getFloorTheme(floor).visualSignature.wallColor, getBiomeForFloor(floor).visualSignature.wallColor);
  });
});

check("one-way placement preserves the critical-path envelope without retrying", () => {
  const retryRegressionCases = [
    { floor: 4, runSeed: "run-floor-template-4-8", expectedOneWays: 1 },
    { floor: 6, runSeed: "run-floor-template-6-1", expectedOneWays: 1 },
    { floor: 23, runSeed: "run-floor-template-23-6", expectedOneWays: 5 },
    { floor: 27, runSeed: "run-floor-template-27-0", expectedOneWays: 5 },
    { floor: 30, runSeed: "run-floor-template-30-9", expectedOneWays: 5 }
  ];
  retryRegressionCases.forEach(({ floor, runSeed, expectedOneWays }) => {
    const generated = generateRunFloor({ runSeed, floor });
    const oneWays = generated.grid.flat().reduce(
      (total, cell) => total + cell.blockEnter.filter(Boolean).length,
      0
    );
    assert.equal(generated.generationAttempt, 0, `B${floor} retried generation`);
    assert.equal(oneWays, expectedOneWays, `B${floor} one-way count changed`);
    assert.ok(generated.validation.criticalPath >= 20 && generated.validation.criticalPath <= 30);
  });
});

check("balance quantities stay on the floor templates", () => {
  FLOOR_TEMPLATES.forEach(template => {
    assert.deepEqual(template.criticalPathRange, [20, 30]);
    assert.ok(template.size.width === template.size.height);
  });
  for (let floor = 1; floor <= 31; floor++) {
    const template = getFloorTemplate(floor);
    const generated = generateRunFloor({ runSeed: "ISSUE-705-QUANTITIES", floor });
    assert.equal(generated.grid.length, template.size.height);
    assert.equal(generated.grid[0].length, template.size.width);
    assert.equal(generated.validation.criticalPath >= 20, true);
    assert.equal(generated.validation.criticalPath <= 30, true);
  }
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] Issue #705 biome signatures, monotonic depth, terrain boundaries, validation, determinism, and fixed quantities verified.");
