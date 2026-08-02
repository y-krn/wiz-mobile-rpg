import {
  calculateChestDisarmChance,
  calculateFloorTrapSuccessRate,
  resolveTrapAction
} from "../src/rules/trap_rules.js";
import {
  calculateFloorTrapExpectedDamage,
  resolveChestTrapEffect,
  resolveFloorTrapEffect
} from "../src/rules/trap_effect_rules.js";

const failures = [];

function check(label, actual, expected) {
  if (Object.is(actual, expected)) return;
  failures.push(`${label}: expected ${expected}, got ${actual}`);
}

const soloFighter = {
  class: "Fighter",
  hp: 20,
  maxMp: 0,
  status: "ok"
};
const soloThief = {
  class: "Thief",
  hp: 20,
  maxMp: 0,
  status: "ok"
};

check(
  "chest Thief base chance",
  calculateChestDisarmChance({ className: "Thief" }),
  0.85
);
check(
  "chest non-apt blind chance",
  calculateChestDisarmChance({ className: "Fighter", blind: true }),
  0.125
);
check(
  "floor Thief B1 rate",
  calculateFloorTrapSuccessRate({
    trap: { type: "damage" },
    className: "Thief",
    level: 1,
    floor: 1
  }),
  81
);

const poison = resolveChestTrapEffect({
  trap: "poison needle",
  party: [soloFighter],
  targetIndex: 0,
  rng: () => 0.99
});
check("full poison needle damage", poison.targetDamage, 12);
check("full poison needle poison roll", poison.targetPoisonTriggered, true);

const weakenedGas = resolveChestTrapEffect({
  trap: "gas bomb",
  weakened: true,
  party: [soloFighter],
  rng: () => 0.99
});
check("weakened gas damage", weakenedGas.partyDamage[0], 6);

const fighterDamage = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 1,
  party: [soloFighter],
  rng: () => 0
});
check("floor damage without scout", fighterDamage.partyDamage[0], 8);

const thiefDamage = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 1,
  party: [soloThief],
  rng: () => 0
});
check("floor damage with scout mitigation", thiefDamage.partyDamage[0], 5);
const expectedFighterDamage = calculateFloorTrapExpectedDamage({
  trap: { type: "damage" },
  floor: 1,
  party: [soloFighter]
})[0];
const expectedThiefDamage = calculateFloorTrapExpectedDamage({
  trap: { type: "damage" },
  floor: 1,
  party: [soloThief]
})[0];
check("expected damage follows full effect", expectedFighterDamage, 12);
check(
  "expected damage follows scout mitigation",
  expectedThiefDamage,
  8
);

check(
  "force action is partial",
  resolveTrapAction({
    action: "force",
    trap: { type: "damage" },
    successRate: 80
  }).partialSuccess,
  true
);
check(
  "disarm success action",
  resolveTrapAction({
    action: "disarm",
    trap: { type: "damage" },
    successRate: 50,
    rng: () => 0
  }).outcome,
  "disarmed"
);
check(
  "disarm partial action",
  resolveTrapAction({
    action: "disarm",
    trap: { type: "damage" },
    successRate: 40,
    rng: () => 0.54
  }).partialSuccess,
  true
);
check(
  "pitfall has no partial disarm band",
  resolveTrapAction({
    action: "disarm",
    trap: { type: "pitfall" },
    successRate: 40,
    rng: () => 0.54
  }).partialSuccess,
  false
);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${12} shared trap rule assertions`);
