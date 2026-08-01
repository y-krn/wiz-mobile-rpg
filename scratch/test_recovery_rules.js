import assert from "node:assert/strict";
import {
  getStartingHealPotionCount,
  RECOVERY_BALANCE
} from "../src/rules/recovery_rules.js";

assert.equal(RECOVERY_BALANCE.startingHealPotions, 4);
assert.equal(getStartingHealPotionCount(), 4);

console.log("[PASS] recovery rules");
