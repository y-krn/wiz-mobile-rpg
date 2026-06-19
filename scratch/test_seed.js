// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import { createRng } from "../src/seed_rng.js";
import { generateRandomMap } from "../src/map_generator.js";
import { generateRandomEquipment } from "../src/data.js";
import { state, rebuildDungeonMaps, calculateSeedProperties } from "../src/state.js";
import assert from "assert";

console.log("Starting Seed Verification Tests...");

// Test 1: PRNG consistency
const rng1 = createRng("ABC123");
const rng2 = createRng("ABC123");
const rng3 = createRng("DEF456");

const r1_a = rng1();
const r1_b = rng1();
const r2_a = rng2();
const r2_b = rng2();
const r3_a = rng3();

assert.strictEqual(r1_a, r2_a, "RNG sequence should be identical for same seed");
assert.strictEqual(r1_b, r2_b, "RNG sequence second roll should be identical for same seed");
assert.notStrictEqual(r1_a, r3_a, "RNG sequence should differ for different seeds");
console.log("[PASS] Seed PRNG consistency verified.");

// Test 2: Map Generator consistency
const map1_a = generateRandomMap(1, null, "CASTLE-SEED1");
const map1_b = generateRandomMap(1, null, "CASTLE-SEED1");
const map2 = generateRandomMap(1, null, "CASTLE-SEED2");

// Check stairs-down coordinates match
assert.strictEqual(map1_a.stairsDownCoord.x, map1_b.stairsDownCoord.x, "Stairs down X should match for same seed");
assert.strictEqual(map1_a.stairsDownCoord.y, map1_b.stairsDownCoord.y, "Stairs down Y should match for same seed");
assert.notDeepStrictEqual(map1_a.stairsDownCoord, map2.stairsDownCoord, "Stairs down should differ for different seed");

// Check grid equality
for (let y = 0; y < map1_a.grid.length; y++) {
  for (let x = 0; x < map1_a.grid[y].length; x++) {
    const cellA = map1_a.grid[y][x];
    const cellB = map1_b.grid[y][x];
    assert.deepStrictEqual(cellA.walls, cellB.walls, `Walls at (${x},${y}) should match`);
    assert.strictEqual(cellA.type, cellB.type, `Type at (${x},${y}) should match`);
    assert.strictEqual(cellA.event, cellB.event, `Event at (${x},${y}) should match`);
  }
}
console.log("[PASS] Map generator consistency verified.");

// Test 3: Equipment generator consistency
const seedEq = "CASTLE-EQSEED";
const eq1 = generateRandomEquipment(3, null, createRng(seedEq));
const eq2 = generateRandomEquipment(3, null, createRng(seedEq));
const eq3 = generateRandomEquipment(3, null, createRng("CASTLE-DIFFSEED"));

assert.strictEqual(eq1.baseId, eq2.baseId, "Equipment base ID should match");
assert.strictEqual(eq1.rarity, eq2.rarity, "Equipment rarity should match");
assert.strictEqual(eq1.affixes.length, eq2.affixes.length, "Equipment affix count should match");
for (let i = 0; i < eq1.affixes.length; i++) {
  assert.strictEqual(eq1.affixes[i].type, eq2.affixes[i].type, "Equipment affix type should match");
  assert.strictEqual(eq1.affixes[i].value, eq2.affixes[i].value, "Equipment affix value should match");
}

assert.notDeepStrictEqual(eq1.affixes, eq3.affixes, "Equipment affixes should differ for different seed");
console.log("[PASS] Equipment generator consistency verified.");

// Test 4: calculateSeedProperties consistency
state.seed = "TESTSEED123";
rebuildDungeonMaps();
const props1_a = calculateSeedProperties();
const props1_b = calculateSeedProperties();

assert.strictEqual(props1_a.rank, props1_b.rank, "Seed properties rank should be identical for same seed");
assert.strictEqual(props1_a.score, props1_b.score, "Seed properties score should be identical for same seed");
assert.deepStrictEqual(props1_a.biases, props1_b.biases, "Seed properties biases should be identical for same seed");

state.seed = "DIFFSEED789";
rebuildDungeonMaps();
const props2 = calculateSeedProperties();

console.log(`TESTSEED123 danger: ${props1_a.rank} (${props1_a.score}) biases: ${props1_a.biases.join(",")}`);
console.log(`DIFFSEED789 danger: ${props2.rank} (${props2.score}) biases: ${props2.biases.join(",")}`);
console.log("[PASS] Seed properties evaluation consistency verified.");

console.log("All seed verification tests passed successfully!");
