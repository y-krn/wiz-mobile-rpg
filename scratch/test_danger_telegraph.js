import { runCombatRoundCalculation } from "../src/combat_logic/round.js";
import { state } from "../src/state.js";

// Mock environment and state
state.party = [
  { name: "戦士", class: "Fighter", hp: 100, maxHp: 100, mp: 0, status: "ok" },
  { name: "僧侶", class: "Priest", hp: 80, maxHp: 80, mp: 10, status: "ok", spells: ["DIOS", "MONTINO"] },
  { name: "魔法使い", class: "Mage", hp: 50, maxHp: 50, mp: 15, status: "ok", spells: ["HALITO", "MADALTO"] }
];
state.combatState = {
  monsters: [
    { name: "破滅の導師", level: 5, hp: 120, maxHp: 120, traits: ["chargeAttack"], traitChance: 1.0 },
    { name: "デーモン", level: 5, hp: 100, maxHp: 100, spell: "MADALTO", spellChance: 1.0 }
  ],
  phase: "resolving",
  isBoss: false,
  isMidboss: false
};

const combatSelection = {
  actions: [
    { actorIdx: 0, type: "defend" }, // 戦士は防御
    { actorIdx: 1, type: "fight", targetIdx: 0 },
    { actorIdx: 2, type: "fight", targetIdx: 0 }
  ]
};

console.log("=== START TELEGRAPH VERIFICATION ===");

// 1. Check early warning triggers
const res1 = runCombatRoundCalculation(state, combatSelection);

console.log("Round 1 Warnings issued:");
res1.logQueue.forEach(l => console.log(`- ${l.msg}`));

const mon1 = res1.state.combatState.monsters[0];
const mon2 = res1.state.combatState.monsters[1];

console.log(`\nMonster 1 (chargeAttack) chargeQueued: ${mon1.chargeQueued} (Expected: true)`);
console.log(`Monster 2 (MADALTO) madaltoQueued: ${mon2.madaltoQueued} (Expected: true)`);

if (mon1.chargeQueued && mon2.madaltoQueued) {
  console.log("-> [PASS] Warning triggers successfully queued!");
} else {
  console.log("-> [FAIL] Warning triggers failed to queue.");
}

// 2. Resolve action on next round and verify damage reduction
console.log("\n--- Round 2: Resolving warning actions (Fighter defending, others not) ---");
// Fighter (0) defends, Priest (1) & Mage (2) fight
const combatSelection2 = {
  actions: [
    { actorIdx: 0, type: "defend" },
    { actorIdx: 1, type: "fight", targetIdx: 0 },
    { actorIdx: 2, type: "fight", targetIdx: 0 }
  ]
};

// Use the state resulting from Round 1
const res2 = runCombatRoundCalculation(res1.state, combatSelection2);
console.log("Round 2 Actions resolved:");
res2.logQueue.forEach(l => console.log(`- ${l.msg}`));

console.log(`\nFighter HP: ${res2.state.party[0].hp}/100 (defending)`);
console.log(`Priest HP: ${res2.state.party[1].hp}/80`);
console.log(`Mage HP: ${res2.state.party[2].hp}/50`);

// Check if Fighter took less damage due to defense
if (res2.state.party[0].hp > res2.state.party[1].hp) {
  console.log("-> [PASS] Defender successfully mitigated damage!");
} else {
  console.log("-> [FAIL] Defense mitigation failed.");
}

// 3. Test Silence (MONTINO) cancellation
console.log("\n--- Testing Silence (MONTINO) cancellation ---");
// Reset HP and flags on res1.state
res1.state.party.forEach(c => { c.hp = c.maxHp; c.status = "ok"; });
res1.state.combatState.monsters[1].madaltoQueued = true;
res1.state.combatState.monsters[1].silenceTurns = 2; // Simulated silence from MONTINO

const res3 = runCombatRoundCalculation(res1.state, combatSelection2);
console.log("Round with silenced monster:");
res3.logQueue.forEach(l => console.log(`- ${l.msg}`));

const silentMon2 = res3.state.combatState.monsters[1];
console.log(`Monster 2 madaltoQueued: ${silentMon2.madaltoQueued} (Expected: false after being silenced)`);
if (!silentMon2.madaltoQueued) {
  console.log("-> [PASS] Silence successfully cleared madaltoQueued flag!");
} else {
  console.log("-> [FAIL] Silence failed to clear queue.");
}

console.log("=== END TELEGRAPH VERIFICATION ===");
