// Mock minimal environment for state and DOM
const makeDummyElement = () => ({
  style: {},
  appendChild: () => {},
  replaceChildren: () => {},
  addEventListener: () => {},
  innerHTML: "",
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  setAttribute: () => {},
  getAttribute: () => ""
});

global.document = {
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => makeDummyElement()
};
global.window = {};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

// Imports
const { state } = await import("../src/state.js");
const { generateRandomMap } = await import("../src/map_generator.js");
const {
  calculateSuccessRate,
  triggerTrap,
  triggerPitfall,
  getExpectedEffectText,
  getDepthCategory
} = await import("../src/systems/traps.js");

const { persistDungeonTraps } = await import("../src/result.js");
const { applyDungeonMemoryToMaps } = await import("../src/state.js");

console.log("=== DUNGEON TRAP SYSTEM VERIFICATION ===");

const depthCategoryCases = [
  [1, "shallow"],
  [2, "shallow"],
  [3, "middle"],
  [4, "middle"],
  [5, "deep"]
];
for (const [floor, expected] of depthCategoryCases) {
  if (getDepthCategory(floor) !== expected) {
    console.error(`FAIL: B${floor} depth category should be ${expected}.`);
    process.exit(1);
  }
}

// 1. Verify Trap Placement in Map Generation
console.log("\n[1] Verifying trap generation on passages:");
const mapB1 = generateRandomMap(1, null, "TEST_SEED");
let b1TrapCount = 0;
let validTraps = true;

for (let y = 0; y < mapB1.grid.length; y++) {
  for (let x = 0; x < mapB1.grid[y].length; x++) {
    const cell = mapB1.grid[y][x];
    if (cell.trap) {
      b1TrapCount++;
      const t = cell.trap;
      if (!t.id || !t.floorId || !t.type || !t.state || t.difficulty === undefined) {
        validTraps = false;
        console.error("Invalid trap structure:", t);
      }
    }
  }
}
console.log(`- Floor 1 generated ${b1TrapCount} traps (Expected: 7)`);
if (b1TrapCount !== 7 || !validTraps) {
  console.error("FAIL: Trap placement count or format mismatch.");
  process.exit(1);
} else {
  console.log("PASS: Map trap placement verified.");
}

// 2. Verify Success Rate Calculation
console.log("\n[2] Verifying trap disarm success rate calculation:");
const testTrap = {
  id: "trap_1_5_5",
  floorId: "B1",
  position: { x: 5, y: 5 },
  type: "damage",
  state: "hidden",
  difficulty: 30,
  weakenLevel: 0
};

state.floor = 1;
state.party = []; // Empty party

// Rate should use base 50 - difficulty (30) - floorPenalty (0) = 20%
let rate = calculateSuccessRate(testTrap);
console.log(`- Rate with empty party: ${rate}% (Expected: 20% or min-capped at 10%)`);
if (rate !== 20) {
  console.error("FAIL: Success rate calculation failed for empty party.");
  process.exit(1);
}

// Add a Thief to the party
state.party = [{
  name: "Robin",
  class: "Thief",
  level: 5,
  hp: 20,
  maxHp: 20,
  luk: 15,
  agi: 16,
  status: "ok"
}];
// Thief skill bonus = luk(15) + agi(16) + level*2(10) + 15 = 56
// Rate = 50 + 56 - 30 - 0 = 76%
rate = calculateSuccessRate(testTrap);
console.log(`- Rate with level 5 Thief: ${rate}% (Expected: 76%)`);
if (rate !== 76) {
  console.error("FAIL: Success rate calculation failed for Thief.");
  process.exit(1);
}

// Weakened trap bonus (+20% success rate)
testTrap.state = "weakened";
rate = calculateSuccessRate(testTrap);
console.log(`- Rate with weakened trap: ${rate}% (Expected: 95% because 76 + 20 = 96%, capped at 95%)`);
if (rate !== 95) {
  console.error("FAIL: Success rate calculation failed for weakened trap.");
  process.exit(1);
}
console.log("PASS: Success rate calculations verified.");

// 3. Verify Trap Triggers and Damage/Effect Reduction
console.log("\n[3] Verifying trap effects and damage scaling:");
state.party = [
  { name: "Arthur", class: "Fighter", level: 1, hp: 20, maxHp: 20, status: "ok" },
  { name: "Maria", class: "Priest", level: 1, hp: 12, maxHp: 12, status: "ok", maxMp: 5, mp: 5 }
];
state.floor = 1;

// Test Damage trap without Thief (no scout damage reduction)
const dmgTrap = { type: "damage", state: "discovered" };
triggerTrap(dmgTrap, false, false);
let arthurDmg = 20 - state.party[0].hp;
console.log(`- Fighter HP after trap: ${state.party[0].hp}/20 (Took ${arthurDmg} damage)`);
if (arthurDmg <= 0) {
  console.error("FAIL: Fighter took no damage.");
  process.exit(1);
}

// Restore party health and status before testing MP Drain
state.party.forEach(c => {
  c.hp = c.maxHp;
  c.status = "ok";
});

// Test MP Drain trap
const mpTrap = { type: "mpDrain", state: "discovered" };
triggerTrap(mpTrap, false, false);
console.log(`- Priest MP after drain: ${state.party[1].mp}/5`);
if (state.party[1].mp >= 5) {
  console.error("FAIL: Priest MP was not drained.");
  process.exit(1);
}

// Test Alarm trap
state.alarmActive = false;
const alarmTrap = { type: "alarm", state: "discovered" };
triggerTrap(alarmTrap, false, false);
console.log(`- state.alarmActive: ${state.alarmActive} (Expected: true)`);
if (!state.alarmActive) {
  console.error("FAIL: Alarm trap did not activate alarm state.");
  process.exit(1);
}
console.log("PASS: Trap trigger effects verified.");

// 4. Verify Dungeon Traps Memory Persistence
console.log("\n[4] Verifying state memory persistence and synchronization:");
state.maps = [mapB1.grid, null, null, null, null];
state.dungeonMemory = { traps: {} };

// Set one trap as disabled
const targetCell = mapB1.grid[5][5];
targetCell.trap = {
  id: "trap_1_5_5",
  floorId: "B1",
  type: "damage",
  state: "disabled",
  difficulty: 30,
  weakenLevel: 0
};

// Force persistDungeonTraps
// F1 keepWeakenedRate is 0.85. We mock Math.random temporarily to guarantee true.
const originalRandom = Math.random;
Math.random = () => 0.1; // Force success

persistDungeonTraps();
console.log("- Dungeon memory after persistence:", state.dungeonMemory.traps["trap_1_5_5"]);
if (!state.dungeonMemory.traps["trap_1_5_5"] || state.dungeonMemory.traps["trap_1_5_5"].state !== "weakened") {
  console.error("FAIL: Below-threshold trap did not preserve current weakened behavior.");
  process.exit(1);
}

// Check applyDungeonMemoryToMaps
targetCell.trap.state = "hidden";
applyDungeonMemoryToMaps();
console.log("- Map trap state after synchronization:", targetCell.trap.state);
if (targetCell.trap.state !== "weakened" || targetCell.trap.weakenLevel !== 1) {
  console.error("FAIL: Synchronization to map failed.");
  process.exit(1);
}

// Threshold reached on B1: the second disarm becomes permanent.
targetCell.trap.state = "disabled";
targetCell.trap.weakenLevel = 1;
state.dungeonMemory.traps = {};
persistDungeonTraps();
const permanentTrap = state.dungeonMemory.traps["trap_1_5_5"];
if (permanentTrap?.state !== "disabled" || permanentTrap.weakenLevel !== 2) {
  console.error("FAIL: Threshold disarm was not saved as permanently disabled.");
  process.exit(1);
}

// B5 never becomes permanent, regardless of weaken level.
targetCell.trap.state = "disabled";
targetCell.trap.weakenLevel = 99;
state.maps = [null, null, null, null, mapB1.grid];
state.dungeonMemory.traps = {};
persistDungeonTraps();
const deepTrap = state.dungeonMemory.traps["trap_1_5_5"];
if (deepTrap?.state !== "weakened" || deepTrap.weakenLevel !== 100) {
  console.error("FAIL: Deep trap was incorrectly made permanent.");
  process.exit(1);
}

// A permanently disabled memory entry must never be rerolled or degraded.
targetCell.trap.state = "disabled";
targetCell.trap.weakenLevel = 0;
state.maps = [mapB1.grid, null, null, null, null];
state.dungeonMemory.traps = {
  "trap_1_5_5": { state: "disabled", weakenLevel: 2, lastUpdatedAt: 123 }
};
Math.random = () => 0.99;
persistDungeonTraps();
const preservedTrap = state.dungeonMemory.traps["trap_1_5_5"];
if (preservedTrap.state !== "disabled" || preservedTrap.weakenLevel !== 2 || preservedTrap.lastUpdatedAt !== 123) {
  console.error("FAIL: Permanently disabled trap was degraded by persistence.");
  process.exit(1);
}

// Restore Math.random
Math.random = originalRandom;
console.log("PASS: Persistence and synchronization verified.");

// 5. Verify Pitfall Trap Behavior
console.log("\n[5] Verifying pitfall trap specific behavior:");

const pitfallTrap = {
  id: "trap_1_6_6",
  floorId: "B1",
  position: { x: 6, y: 6 },
  type: "pitfall",
  state: "hidden",
  difficulty: 30,
  weakenLevel: 0
};

// Success rate of pitfall should have +20% bonus
state.floor = 1;
state.party = [{
  name: "Robin",
  class: "Thief",
  level: 5,
  hp: 20,
  maxHp: 20,
  luk: 15,
  agi: 16,
  status: "ok"
}];
const pfRate = calculateSuccessRate(pitfallTrap);
console.log(`- Pitfall success rate with Thief: ${pfRate}% (Expected: 95% because 76 + 20 = 96% capped at 95%)`);
if (pfRate !== 95) {
  console.error("FAIL: Pitfall success rate bonus not applied.");
  process.exit(1);
}

// Expected effect text should specify floor dropping
const pfEffect = getExpectedEffectText(pitfallTrap);
console.log(`- Expected effect text: "${pfEffect}" (Expected to include "地下2階へ落下")`);
if (!pfEffect.includes("地下2階へ落下")) {
  console.error("FAIL: Pitfall expected effect text mismatch.");
  process.exit(1);
}

// Mock maps for floor transition validation
const mapB2 = generateRandomMap(2, null, "TEST_SEED");
state.maps = [mapB1.grid, mapB2.grid, null, null, null];
state.visitedMaps = [
  Array(mapB1.grid.length).fill().map(() => Array(mapB1.grid[0].length).fill(false)),
  Array(mapB2.grid.length).fill().map(() => Array(mapB2.grid[0].length).fill(false)),
  null, null, null
];
state.currentRun = { steps: 0, pitfallsFallen: 0, trapsTriggered: 0, floorsVisited: [1], deepestFloor: 1 };
state.transitioning = false;

// Trigger pitfall (forces transition to B2)
console.log("- Triggering pitfall...");
triggerPitfall(pitfallTrap, false, false);

if (!state.transitioning) {
  console.error("FAIL: state.transitioning should be true immediately after triggering pitfall.");
  process.exit(1);
}

// Wait for transition timer (1200ms)
await new Promise(resolve => setTimeout(resolve, 1300));

console.log(`- State floor after fall: ${state.floor} (Expected: 2)`);
if (state.floor !== 2) {
  console.error("FAIL: Party did not drop to floor 2.");
  process.exit(1);
}

console.log(`- Fighter HP after fall damage: ${state.party[0].hp}/20`);
if (state.party[0].hp >= 20) {
  console.error("FAIL: No fall damage applied.");
  process.exit(1);
}

console.log(`- pitfallsFallen count: ${state.currentRun.pitfallsFallen} (Expected: 1)`);
if (state.currentRun.pitfallsFallen !== 1) {
  console.error("FAIL: pitfallsFallen count not incremented.");
  process.exit(1);
}

console.log("PASS: Pitfall trap behavior verified.");

console.log("\n=== ALL DUNGEON TRAP TESTS PASSED SUCCESSFULLY! ===");
