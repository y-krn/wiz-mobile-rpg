import assert from "node:assert/strict";
import { BIOMES, getBiomeForFloor, getBiomeTerrainForFloor } from "../../../src/data/biomes.js";
import {
  TERRAIN_STRUCTURE_TYPES,
  generateRandomMap,
  getMapStructureMetrics
} from "../../../src/map_generator.js";
import { generateRunFloor } from "../../../src/run_map_generator.js";

const floors = [1, 6, 11, 16, 21, 26];

for (const biome of BIOMES) {
  const profile = biome.terrain.structureProfile;
  assert.deepEqual(Object.keys(profile).sort(), [...TERRAIN_STRUCTURE_TYPES].sort(), biome.id);
  assert.ok(Math.abs(Object.values(profile).reduce((sum, value) => sum + value, 0) - 1) < 1e-9, biome.id);
  assert.ok(Object.values(profile).every(value => value > 0), biome.id);
}

const observedTypes = new Set();
const aggregate = new Map();
for (const floor of floors) {
  const biome = getBiomeForFloor(floor);
  const profile = getBiomeTerrainForFloor(floor);
  assert.deepEqual(profile.structureProfile, biome.terrain.structureProfile);

  const totals = { cycles: 0, alternativePathRate: 0, openAreaCells: 0, corridorRatio: 0 };
  for (let seedIndex = 0; seedIndex < 24; seedIndex++) {
    const generated = generateRunFloor({ runSeed: `ISSUE-934-${seedIndex}`, floor });
    const repeated = generateRunFloor({ runSeed: `ISSUE-934-${seedIndex}`, floor });
    assert.deepEqual(generated.structureMetrics, repeated.structureMetrics, `B${floor} metrics not deterministic`);
    assert.deepEqual(generated.structureProfile, profile.structureProfile, `B${floor} profile not consumed`);
    assert.equal(generated.validation.valid, true, `B${floor} validation failed`);
    assert.equal(generated.structureMetrics.componentCount, 1, `B${floor} disconnected structure`);
    assert.ok(generated.structureMetrics.cycleCount >= 0, `B${floor} invalid cycle count`);
    assert.ok(generated.structureMetrics.alternativePathRate >= 0 && generated.structureMetrics.alternativePathRate <= 1);
    assert.ok(generated.structureMetrics.openAreaCount >= 1, `B${floor} has no open area`);
    assert.ok(generated.structureMetrics.junctionCount >= 1, `B${floor} has no hub`);
    observedTypes.add(generated.structureType);
    totals.cycles += generated.structureMetrics.cycleCount;
    totals.alternativePathRate += generated.structureMetrics.alternativePathRate;
    totals.openAreaCells += generated.structureMetrics.openAreaCellCount;
    totals.corridorRatio += generated.structureMetrics.corridorRatio;
  }
  aggregate.set(biome.id, Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 24])));
}

assert.equal(observedTypes.size, TERRAIN_STRUCTURE_TYPES.length, "all structure primitives were not selected");
assert.notDeepEqual(aggregate.get("forgotten_catacomb"), aggregate.get("sunken_library"),
  "distinct biome profiles produced identical structure aggregates");
assert.notDeepEqual(aggregate.get("rift_nest"), aggregate.get("dragon_forge"),
  "loop/open-area biome profiles produced identical structure aggregates");

const direct = generateRandomMap(1, null, "ISSUE-934-DIRECT", {
  structureProfile: { corridor: 0, loop: 0, hub: 1, openArea: 0 }
});
assert.equal(direct.structureType, "hub");
assert.deepEqual(direct.structureMetrics, getMapStructureMetrics(direct.grid, direct.rooms));

console.log("[PASS] Issue #934 structure profiles select all primitives, expose graph metrics, preserve deterministic floors, and keep Biome aggregates distinct.");
