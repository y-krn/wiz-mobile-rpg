import { runCombatRoundCalculation } from '/Users/ottan/.gemini/antigravity/scratch/wiz-mobile-rpg/src/combat_logic.js';
import { createDefaultRoster } from '/Users/ottan/.gemini/antigravity/scratch/wiz-mobile-rpg/src/state.js';
import assert from 'assert';

console.log("=== START ENEMY ROW SYSTEM VERIFICATION ===");

// 1. Create a party
const roster = createDefaultRoster();
const arthur = roster.find(c => c.name === "Arthur");
const robin = roster.find(c => c.name === "Robin");
const maria = roster.find(c => c.name === "Maria");
const ged = roster.find(c => c.name === "Ged");
const party = [arthur, robin, maria, ged];

// Base State setup
const createBaseState = (monsters) => ({
  party: JSON.parse(JSON.stringify(party)),
  floor: 1,
  inventory: [],
  codex: { monsters: {} },
  currentRun: { kills: 0, goldGained: 0, expGained: 0, equipmentFound: [] },
  roamingMonsters: [],
  combatState: {
    phase: "choose_actions",
    monsters: JSON.parse(JSON.stringify(monsters))
  }
});

// Scenario A: Melee attack on backrow while frontrow is alive
// Setup: 1 front monster (Biter), 1 back monster (Goblin Mage)
const monstersA = [
  { name: "かみつき蟲 A", level: 1, hp: 10, maxHp: 10, def: 0, status: "ok", row: "front" },
  { name: "ゴブリンの呪術師 A", level: 1, hp: 10, maxHp: 10, def: 0, status: "ok", row: "back" }
];

const stateA = createBaseState(monstersA);
// Arthur (idx: 0) attacks backrow monster (targetIdx: 1)
const selectionA = {
  actions: [
    { actorIdx: 0, type: "fight", targetIdx: 1 }
  ]
};

const resultA = runCombatRoundCalculation(stateA, selectionA);
const logsA = resultA.logQueue.map(l => l.msg);
console.log("- Scenario A Logs:", logsA);

// Verify that it was blocked and the "miss" log was produced
assert(logsA.some(msg => msg.includes("前列の敵に阻まれて") && msg.includes("ゴブリンの呪術師 Aには届かない")), 
       "Error: Arthur's physical attack should have been blocked by the front row.");
console.log("✔ Scenario A Passed: Melee attack to backrow was successfully blocked by frontrow.");


// Scenario B: Single target Spell (HALITO) targeting backrow while frontrow is alive
const stateB = createBaseState(monstersA);
// Maria (Priest) casts HALITO (single target damage) on backrow monster (targetIdx: 1)
// Give Maria enough MP
stateB.party[2].mp = 10;
const selectionB = {
  actions: [
    { actorIdx: 2, type: "spell", spellName: "HALITO", targetIdx: 1 }
  ]
};

const resultB = runCombatRoundCalculation(stateB, selectionB);
const logsB = resultB.logQueue.map(l => l.msg);
console.log("- Scenario B Logs:", logsB);

// Verify that HALITO landed on the backrow
assert(logsB.some(msg => msg.includes("ハリト") && msg.includes("ゴブリンの呪術師 A")),
       "Error: HALITO should target and hit the backrow monster.");
assert(resultB.state.combatState.monsters[1].hp < 10, "Error: Backrow monster HP should have decreased.");
console.log("✔ Scenario B Passed: Single target spell successfully targeted backrow.");


// Scenario C: All enemies target spell (LAHALITO) hitting both rows
const stateC = createBaseState(monstersA);
stateC.party[3].mp = 10; // Ged
const selectionC = {
  actions: [
    { actorIdx: 3, type: "spell", spellName: "LAHALITO", targetIdx: -1 }
  ]
};

const resultC = runCombatRoundCalculation(stateC, selectionC);
const logsC = resultC.logQueue.map(l => l.msg);
console.log("- Scenario C Logs:", logsC);

// Verify both monsters took damage
assert(resultC.state.combatState.monsters[0].hp < 10, "Error: Frontrow monster should have taken LAHALITO damage.");
assert(resultC.state.combatState.monsters[1].hp < 10, "Error: Backrow monster should have taken LAHALITO damage.");
console.log("✔ Scenario C Passed: Area spell successfully hit both front and back rows.");


// Scenario D: Frontrow is defeated, backrow becomes targetable by melee, and collapse log triggers
const stateD = createBaseState(monstersA);
// Arthur (idx: 0) goes first (high agi), Robin (idx: 1) goes second (low agi)
stateD.party[0].agi = 99;
stateD.party[1].agi = 1;
// Set frontrow HP to 1 so Arthur can kill it, then Robin attacks backrow
stateD.combatState.monsters[0].hp = 1;
const selectionD = {
  actions: [
    { actorIdx: 0, type: "fight", targetIdx: 0 }, // Arthur kills Biter
    { actorIdx: 1, type: "fight", targetIdx: 1 }  // Robin attacks Goblin Mage
  ]
};

const resultD = runCombatRoundCalculation(stateD, selectionD);
const logsD = resultD.logQueue.map(l => l.msg);
console.log("- Scenario D Logs:", logsD);

// After the frontrow dies this round, the backrow becomes targetable by melee.
assert(resultD.state.combatState.monsters[1].hp < 10, "Error: Robin should have hit backrow monster after frontrow collapsed.");
console.log("✔ Scenario D Passed: Front row collapse makes backrow targetable by melee.");


// Scenario E: Row default fallback check
const monstersE = [
  { name: "かみつき蟲 A", level: 1, hp: 10, maxHp: 10, status: "ok" } // No row specified
];
const stateE = createBaseState(monstersE);
const selectionE = {
  actions: [
    { actorIdx: 0, type: "fight", targetIdx: 0 }
  ]
};
const resultE = runCombatRoundCalculation(stateE, selectionE);
assert(resultE.state.combatState.monsters[0].row === undefined || resultE.state.combatState.monsters[0].row === "front",
       "Error: Row fallback should treat undefined as frontrow.");
console.log("✔ Scenario E Passed: Undefined row successfully defaults to front.");

console.log("=== ALL ENEMY ROW SYSTEM TESTS PASSED SUCCESSFULLY! ===");
