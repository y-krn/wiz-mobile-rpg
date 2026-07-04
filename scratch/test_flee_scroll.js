// Mock localStorage for Node.js test environment before imports
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { state } from "../src/state.js";
import { resolvePlayerItem } from "../src/combat_logic/item_resolution.js";
import { getItemUseStatus } from "../src/equip.js";

console.log("Starting Combat Escape Scroll (ESCAPE_SCROLL) Verification Tests...");

// 1. resolvePlayerItem Verification (Success / Failure / Agility Probability / Consumption)
const originalRandom = Math.random;

function testResolveEscapeScroll(agi, forceRandomValue) {
  const char = {
    name: "Speedy",
    class: "Fighter",
    agi: agi,
    status: "ok"
  };
  const testState = {
    party: [char],
    inventory: ["ESCAPE_SCROLL"]
  };
  const logQueue = [];

  Math.random = () => forceRandomValue;

  try {
    const res = resolvePlayerItem(char, { itemKey: "ESCAPE_SCROLL", targetIdx: 0 }, testState, logQueue);
    return { res, testState, logQueue };
  } finally {
    Math.random = originalRandom;
  }
}

// Case A: High Agility (agi: 99). Expected chance is capped at 95% (0.95)
// random < 0.95 -> Success
const successA = testResolveEscapeScroll(99, 0.94);
assert.strictEqual(successA.res.escaped, true, "Agi 99 with random 0.94 should escape successfully.");
assert.strictEqual(successA.testState.inventory.length, 0, "Escape scroll should be consumed on success.");
assert.ok(successA.logQueue.some(log => log.fleeCombat), "Successful escape should push fleeCombat: true to log.");

// random >= 0.95 -> Fail
const failA = testResolveEscapeScroll(99, 0.96);
assert.strictEqual(failA.res.escaped, false, "Agi 99 with random 0.96 should fail to escape.");
assert.strictEqual(failA.testState.inventory.length, 0, "Escape scroll should be consumed on failure.");
assert.ok(!failA.logQueue.some(log => log.fleeCombat), "Failed escape should not push fleeCombat: true.");

// Case B: Low Agility (agi: 1). Expected chance is 75% - 27% = 48% (0.48)
// random < 0.48 -> Success
const successB = testResolveEscapeScroll(1, 0.47);
assert.strictEqual(successB.res.escaped, true, "Agi 1 with random 0.47 should escape successfully.");

// random >= 0.48 -> Fail
const failB = testResolveEscapeScroll(1, 0.49);
assert.strictEqual(failB.res.escaped, false, "Agi 1 with random 0.49 should fail to escape.");

console.log("[PASS] ESCAPE_SCROLL resolution, agility-based rates, and consumption verified.");

// 2. getItemUseStatus Verification (Gating conditions)
const testChar = {
  name: "GatedChar",
  class: "Fighter",
  hp: 20,
  maxHp: 30,
  status: "ok"
};

// Case A: Out of combat (state.combatState = null)
state.combatState = null;
const statusOutOfCombat = getItemUseStatus(testChar, "ESCAPE_SCROLL");
assert.strictEqual(statusOutOfCombat.usable, false, "Should be unusable out of combat.");
assert.strictEqual(statusOutOfCombat.reason, "戦闘中のみ使用できます", "Incorrect reason for out-of-combat.");

// Case B: In normal combat
state.combatState = { isBoss: false, isMidboss: false };
const statusNormalCombat = getItemUseStatus(testChar, "ESCAPE_SCROLL");
assert.strictEqual(statusNormalCombat.usable, true, "Should be usable in normal combat.");

// Case C: In Boss combat
state.combatState = { isBoss: true, isMidboss: false };
const statusBossCombat = getItemUseStatus(testChar, "ESCAPE_SCROLL");
assert.strictEqual(statusBossCombat.usable, false, "Should be unusable in Boss combat.");
assert.strictEqual(statusBossCombat.reason, "ボス戦では使用できません", "Incorrect reason for boss combat.");

// Case D: In Midboss combat
state.combatState = { isBoss: false, isMidboss: true };
const statusMidbossCombat = getItemUseStatus(testChar, "ESCAPE_SCROLL");
assert.strictEqual(statusMidbossCombat.usable, false, "Should be unusable in Midboss combat.");
assert.strictEqual(statusMidbossCombat.reason, "ボス戦では使用できません", "Incorrect reason for midboss combat.");

console.log("[PASS] ESCAPE_SCROLL getItemUseStatus restrictions verified.");

console.log("All ESCAPE_SCROLL verification tests passed successfully!");
