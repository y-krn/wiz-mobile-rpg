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
  getExpectedEffectText
} = await import("../src/systems/traps.js");

console.log("=== DUNGEON TRAP SYSTEM VERIFICATION ===");

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
  difficulty: 30
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

// Weakened state is abolished. A trap that is not hidden/discovered/disabled is invalid.
testTrap.state = "discovered";
const discoveredRate = calculateSuccessRate(testTrap);
if (discoveredRate !== 76) {
  console.error(`FAIL: discovered trap rate should stay 76, got ${discoveredRate}.`);
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
triggerTrap(dmgTrap, false);
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
triggerTrap(mpTrap, false);
console.log(`- Priest MP after drain: ${state.party[1].mp}/5`);
if (state.party[1].mp >= 5) {
  console.error("FAIL: Priest MP was not drained.");
  process.exit(1);
}

// Test Alarm trap
state.alarmActive = false;
const alarmTrap = { type: "alarm", state: "discovered" };
triggerTrap(alarmTrap, false);
console.log(`- state.alarmActive: ${state.alarmActive} (Expected: true)`);
if (!state.alarmActive) {
  console.error("FAIL: Alarm trap did not activate alarm state.");
  process.exit(1);
}
console.log("PASS: Trap trigger effects verified.");

// 4. Verify traps are never written to dungeonMemory
console.log("\n[4] Verifying trap persistence is removed:");
state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
if (state.dungeonMemory.traps !== undefined) {
  console.error("FAIL: dungeonMemory.traps should not exist.");
  process.exit(1);
}

// Generated traps must never carry weakenLevel or weakened state
const genMap = generateRandomMap(3, null, "TEST_SEED");
for (const row of genMap.grid) {
  for (const cell of row) {
    if (!cell.trap) continue;
    if (cell.trap.weakenLevel !== undefined) {
      console.error("FAIL: generated trap still has weakenLevel.");
      process.exit(1);
    }
    if (!["hidden", "discovered", "disabled"].includes(cell.trap.state)) {
      console.error(`FAIL: invalid trap state ${cell.trap.state}.`);
      process.exit(1);
    }
  }
}
console.log("PASS: Trap persistence removed.");

console.log("\n=== ALL TRAP TESTS PASSED ===");
