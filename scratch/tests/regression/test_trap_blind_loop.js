import assert from "node:assert/strict";

import {
  CHEST_DISARM_BASE_CHANCE_BY_CLASS,
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
  Object.entries(CHEST_DISARM_BASE_CHANCE_BY_CLASS).forEach(([className, chance]) => {
    assert.equal(
      calculateChestDisarmChance({ className, blind: false }),
      chance
    );
    assert.equal(
      calculateChestDisarmChance({ className, blind: true }),
      chance / 2
    );
  });
});

check("trapGuard is wired through flash effect without changing blind", () => {
  const party = [{ status: "ok", hp: 100, maxHp: 100 }];
  const effect = resolveChestTrapEffect({
    trap: "flash bomb",
    party,
    rng: () => 0.1
  });
  const guarded = applyTrapGuardToEffect(effect, {
    trapGuardByParty: [40],
    targetIndex: 0
  });

  assert.equal(effect.partyBlind[0], true);
  assert.deepEqual(guarded.partyBlind, effect.partyBlind);
  assert.equal(guarded.targetDamage, 0);
  assert.deepEqual(guarded.partyDamage, [0]);
});

check("current floor traps have no blind effect", () => {
  const effect = resolveFloorTrapEffect({
    trap: { type: "damage" },
    floor: 3,
    party: [{ status: "ok", hp: 100, maxHp: 100 }],
    rng: () => 0.1
  });
  assert.equal("partyBlind" in effect, false);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} Issue #512 check(s) failed.`);
  process.exit(1);
}

console.log("[PASS] Issue #512 blind-loop mechanism checks");
