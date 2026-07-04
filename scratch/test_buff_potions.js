// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { state } from "../src/state.js";
import { getItemUseStatus } from "../src/equip.js";
import { ITEM_EFFECTS } from "../src/systems/item_effects.js";
import { addCharBuff, tickCharBuffs, getBuffTotal } from "../src/combat_logic/status_effects.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

console.log("=== Buff Potions System Tests ===");

// 1. Setup Party and initial state
state.party = [
  {
    name: "Fighter",
    class: "Fighter",
    level: 5,
    hp: 55, maxHp: 55,
    status: "ok",
    str: 15, agi: 12, vit: 14,
    equipment: { weapon: "LONG_SWORD", shield: "SMALL_SHIELD", armor: "LEATHER_ARMOR" },
    buffs: []
  }
];
const fighter = state.party[0];

// 2. Test non-combat usage restriction
console.log("1. Testing non-combat item usage restrictions...");
state.combatState = null;
const statusNonCombat = getItemUseStatus(fighter, "STR_POTION");
assert.strictEqual(statusNonCombat.usable, false);
assert.strictEqual(statusNonCombat.reason, "戦闘中のみ使用できます");
console.log("-> [PASS] Potion is restricted in non-combat state");

// 3. Test combat usage restriction
console.log("2. Testing combat item usage authorization...");
state.combatState = {
  monsters: [{ id: "m_0", name: "Skel", hp: 20, maxHp: 20, atk: 5 }],
  phase: "choose_actions"
};
const statusCombat = getItemUseStatus(fighter, "STR_POTION");
assert.strictEqual(statusCombat.usable, true);
console.log("-> [PASS] Potion is usable in combat state");

// 4. Test buff potion application
console.log("3. Testing potion effects...");
ITEM_EFFECTS.STR_POTION({ char: fighter });
ITEM_EFFECTS.GUARD_POTION({ char: fighter });
ITEM_EFFECTS.HASTE_POTION({ char: fighter });

assert.strictEqual(getBuffTotal(fighter, "atk"), 10);
assert.strictEqual(getBuffTotal(fighter, "def"), 10);
assert.strictEqual(getBuffTotal(fighter, "agi"), 5);
console.log("-> [PASS] Buff values applied correctly");

// 5. Test combat round calculation & formula integration
console.log("4. Testing combat round integration (Attack/Defense/Speed modifications)...");
const combatSelection = {
  actions: [
    { type: "fight", actorIdx: 0, targetIdx: 0 }
  ]
};
const testState = {
  party: JSON.parse(JSON.stringify(state.party)),
  combatState: {
    monsters: [{ id: "m_0", name: "Skel", hp: 20, maxHp: 20, atk: 5, status: "ok" }],
    phase: "choose_actions"
  },
  inventory: []
};
// Force high values to verify they decrease
testState.party[0].buffs = [
  { type: "atk", value: 10, turns: 2 },
  { type: "def", value: 10, turns: 1 }
];

const result = runCombatRoundCalculation(testState, combatSelection);
const finalFighter = result.state.party[0];

// After 1 round, def buff (1 turn) should expire, atk buff (2 turns) should be 1 turn.
const finalDefBuff = getBuffTotal(finalFighter, "def");
const finalAtkBuff = getBuffTotal(finalFighter, "atk");

assert.strictEqual(finalDefBuff, 0);
assert.strictEqual(finalAtkBuff, 10);
assert.strictEqual(finalFighter.buffs.find(b => b.type === "atk").turns, 1);
console.log("-> [PASS] Round tick and buff decay verified");

// 6. Test manual ticks
console.log("5. Testing manual buff ticks...");
const dummyChar = { buffs: [{ type: "agi", value: 5, turns: 1 }] };
tickCharBuffs([dummyChar]);
assert.strictEqual(getBuffTotal(dummyChar, "agi"), 0);
assert.strictEqual(dummyChar.buffs.length, 0);
console.log("-> [PASS] tickCharBuffs works correctly");

console.log("=== ALL BUFF POTIONS TESTS PASSED ===");
