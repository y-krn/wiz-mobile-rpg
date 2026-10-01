import assert from "node:assert/strict";

import {
  calculateChestDisarmChance
} from "../../../src/rules/trap_rules.js";
import {
  applyTrapGuardToEffect,
  resolveChestTrapEffect,
  resolveFloorTrapEffect
} from "../../../src/rules/trap_effect_rules.js";

const failures = [];

function check(label, callback) {
  try {
    callback();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`[FAIL] ${label}: ${error.message}`);
  }
}

check("blind halves each class chest disarm chance", () => {
  ["Fighter", "Thief", "Mage", "Ranger"].forEach(className => {
    assert.equal(calculateChestDisarmChance({ className, blind: false }), 0.25);
    assert.equal(calculateChestDisarmChance({ className, blind: true }), 0.125);
  });
});

check("trapGuard is wired through flash effect without changing blind", () => {
  const character = { status: "ok", hp: 100, maxHp: 100 };
  const effect = resolveChestTrapEffect({
    trap: "flash bomb",
    character,
    rng: () => 0.1
  });
  const guarded = applyTrapGuardToEffect(effect, { trapGuard: 40 });

  assert.equal(effect.blinded, true);
  assert.equal(guarded.blinded, effect.blinded);
  assert.equal(guarded.damage, 0);
});

check("current floor traps have no blind effect", () => {
  const effect = resolveFloorTrapEffect({
    trap: { type: "damage" },
    floor: 3,
    character: { status: "ok", hp: 100, maxHp: 100 },
    rng: () => 0.1
  });
  assert.equal("blinded" in effect, false);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} Issue #512 check(s) failed.`);
  process.exit(1);
}

console.log("[PASS] Issue #512 blind-loop mechanism checks");
