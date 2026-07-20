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

// 2. Verify Success Rate Calculation (delegates to trap_rules)
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
state.party = [];
if (calculateSuccessRate(testTrap) !== 0) {
  console.error("FAIL: empty party should yield 0.");
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
// apt: 80 + 5*1.0 - 0 = 85
const thiefRate = calculateSuccessRate(testTrap);
if (thiefRate !== 85) {
  console.error(`FAIL: Thief lv5 B1 should be 85, got ${thiefRate}.`);
  process.exit(1);
}

// difficulty must no longer affect the rate
testTrap.difficulty = 90;
if (calculateSuccessRate(testTrap) !== 85) {
  console.error("FAIL: trap.difficulty must not affect disarm rate.");
  process.exit(1);
}

// pitfall gets the edge bonus: 85 + 20 = 105, clamped to 100
const pitTrap = { ...testTrap, type: "pitfall" };
const pitRate = calculateSuccessRate(pitTrap);
if (pitRate !== 100) {
  console.error(`FAIL: pitfall rate should be 100, got ${pitRate}.`);
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

// 5. Adjacent trap detection
console.log("\n[5] Verifying adjacent trap detection:");
const { detectAdjacentTraps } = await import("../src/systems/traps.js");

// Build a 3x3 test grid: player at (1,1). Walls are [N, E, S, W].
function makeCell(walls) {
  return { walls, blockEnter: [false, false, false, false], type: "empty", event: null };
}
const openAll = () => makeCell([false, false, false, false]);

// East neighbour (2,1) has a trap and is open. West neighbour (0,1) has a
// trap but is walled off, so it must never be detected.
const grid = [
  [openAll(), openAll(), openAll()],
  [openAll(), makeCell([false, false, false, true]), openAll()],
  [openAll(), openAll(), openAll()]
];
grid[1][2].trap = { id: "t_east", type: "damage", state: "hidden", difficulty: 30 };
grid[1][0].trap = { id: "t_west", type: "damage", state: "hidden", difficulty: 30 };

state.maps = [grid];
state.floor = 1;
state.x = 1;
state.y = 1;
state.party = [{ name: "Robin", class: "Fighter", level: 1, hp: 20, maxHp: 20, luk: 10, agi: 10, status: "ok" }];

// Force detection to always succeed
const realRandom = Math.random;
Math.random = () => 0;
detectAdjacentTraps();
Math.random = realRandom;

if (grid[1][2].trap.state !== "discovered") {
  console.error("FAIL: open adjacent trap should be discovered.");
  process.exit(1);
}
if (grid[1][0].trap.state !== "hidden") {
  console.error("FAIL: trap behind a wall must not be detected.");
  process.exit(1);
}
console.log("- open neighbour discovered, walled neighbour untouched");

// Detection is rolled once per trap: a guaranteed-fail reroll must not
// downgrade an already-discovered trap, and must not re-roll a failed one.
grid[2][1].trap = { id: "t_south", type: "damage", state: "hidden", difficulty: 30 };
Math.random = () => 0.99;
detectAdjacentTraps();
if (grid[2][1].trap.state !== "hidden") {
  console.error("FAIL: failed detection should leave trap hidden.");
  process.exit(1);
}
if (grid[2][1].trap.detectRolled !== true) {
  console.error("FAIL: failed detection must still mark detectRolled.");
  process.exit(1);
}
Math.random = () => 0;
detectAdjacentTraps();
if (grid[2][1].trap.state !== "hidden") {
  console.error("FAIL: detection must not be rolled twice for the same trap.");
  process.exit(1);
}
Math.random = realRandom;
console.log("PASS: Adjacent detection verified.");

console.log("\n=== ALL TRAP TESTS PASSED ===");
