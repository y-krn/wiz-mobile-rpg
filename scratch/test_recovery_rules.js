import assert from "node:assert/strict";
import {
  getStartingHealPotionCount,
  RECOVERY_BALANCE
} from "../src/rules/recovery_rules.js";

assert.equal(RECOVERY_BALANCE.startingHealPotions, 3);
assert.equal(getStartingHealPotionCount(), 3);

console.log("[PASS] recovery rules");
