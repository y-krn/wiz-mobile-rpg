import {
  calculateChestDisarmChance,
  calculateFloorTrapSuccessRate,
  resolveTrapAction
} from "../../../src/rules/trap_rules.js";
import {
  applyTrapGuardToEffect,
  B5_FLAME_TRAP_DAMAGE_PROFILE,
  calculateChestTrapExpectedRisk,
  calculateFloorTrapExpectedDamage,
  resolveChestTrapEffect,
  resolveFloorTrapEffect
} from "../../../src/rules/trap_effect_rules.js";

const failures = [];

function check(label, actual, expected) {
  if (Object.is(actual, expected)) return;
  failures.push(`${label}: expected ${expected}, got ${actual}`);
}

const soloFighter = {
  hp: 20,
  maxMp: 0,
  status: "ok"
};
const soloThief = {
  hp: 20,
  maxMp: 0,
  status: "ok"
};

check(
  "chest chance is universal",
  calculateChestDisarmChance({}),
  0.25
);
check(
  "chest blind chance",
  calculateChestDisarmChance({ blind: true }),
  0.125
);
check(
  "floor rate ignores class and level",
  calculateFloorTrapSuccessRate({
    trap: { type: "damage" },
    level: 1,
    floor: 1
  }),
  85
);

const poison = resolveChestTrapEffect({
  trap: "poison needle",
  character: soloFighter,
  rng: () => 0.99
});
check("full poison needle damage", poison.damage, 12);
check("full poison needle poison roll", poison.poisonTriggered, true);

const fullGas = resolveChestTrapEffect({
  trap: "gas bomb",
  character: soloFighter,
  rng: () => 0.99
});
check("full gas max damage", fullGas.damage, 12);
check(
  "chest traps ignore a legacy weakened input",
  resolveChestTrapEffect({ trap: "gas bomb", weakened: true, character: soloFighter, rng: () => 0.99 }).damage,
  12
);

const fighterDamage = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 1,
  character: soloFighter,
  rng: () => 0
});
check("floor damage is not class-mitigated", fighterDamage.damage, 8);

const thiefDamage = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 1,
  character: soloThief,
  rng: () => 0
});
check("floor damage is the same for every class", thiefDamage.damage, 8);
const expectedFighterDamage = calculateFloorTrapExpectedDamage({
  trap: { type: "damage" },
  floor: 1,
  character: soloFighter
});
const expectedThiefDamage = calculateFloorTrapExpectedDamage({
  trap: { type: "damage" },
  floor: 1,
  character: soloThief
});
check("expected damage follows full effect", expectedFighterDamage, 12);
check("expected damage has no scout mitigation", expectedThiefDamage, 12);
const ordinaryB5Trap = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 5,
  character: soloFighter,
  rng: () => 0
});
const ordinaryB5TrapMax = resolveFloorTrapEffect({
  trap: { type: "damage" },
  floor: 5,
  character: soloFighter,
  rng: () => 0.999
});
check("ordinary B5 floor damage min is unchanged", ordinaryB5Trap.damage, 16);
check("ordinary B5 floor damage max is unchanged", ordinaryB5TrapMax.damage, 32);
const flameTrap = { type: "damage", damageProfile: B5_FLAME_TRAP_DAMAGE_PROFILE };
const flameFullMin = resolveFloorTrapEffect({
  trap: flameTrap,
  floor: 5,
  character: soloFighter,
  rng: () => 0
});
const flameFullMax = resolveFloorTrapEffect({
  trap: flameTrap,
  floor: 5,
  character: soloFighter,
  rng: () => 0.999
});
const flamePartialMin = resolveFloorTrapEffect({
  trap: flameTrap,
  floor: 5,
  character: soloFighter,
  weakened: true,
  rng: () => 0
});
check("B5 flame full failure min is 8", flameFullMin.damage, 8);
check("B5 flame full failure max is 16", flameFullMax.damage, 16);
check("B5 flame partial success is weaker", flamePartialMin.damage < flameFullMin.damage, true);
check(
  "expected full gas risk uses source range",
  calculateChestTrapExpectedRisk({
    trap: "gas bomb",
    character: soloFighter
  }).expectedDamageHp,
  8.5
);

check(
  "trapGuard reduces only the solo character's HP damage",
  JSON.stringify(applyTrapGuardToEffect({ damage: 10, blinded: true }, { trapGuard: 40 })),
  JSON.stringify({ damage: 6, blinded: true })
);
check(
  "a dead character takes no gas or floor damage and consumes no roll",
  JSON.stringify([
    resolveChestTrapEffect({ trap: "gas bomb", character: { ...soloFighter, status: "dead" }, rng: () => { throw new Error("rng"); } }).damage,
    resolveFloorTrapEffect({ trap: { type: "damage" }, floor: 1, character: { ...soloFighter, status: "dead" }, rng: () => { throw new Error("rng"); } }).damage
  ]),
  JSON.stringify([0, 0])
);
check(
  "floor MP drain targets the solo character only when it has MP",
  JSON.stringify([
    resolveFloorTrapEffect({ trap: { type: "mpDrain" }, floor: 5, character: { ...soloFighter, maxMp: 10, mp: 10 }, rng: () => 0.99 }).mpDrain,
    resolveFloorTrapEffect({ trap: { type: "mpDrain" }, floor: 5, character: { ...soloFighter, maxMp: 0, mp: 0 }, rng: () => 0.99 }).mpDrain
  ]),
  JSON.stringify([6, 0])
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

console.log(`[PASS] ${21} shared trap rule assertions`);
