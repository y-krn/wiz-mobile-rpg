import {
  calculateChestDisarmChance,
  calculateFloorTrapSuccessRate,
  resolveTrapAction
} from "../../../src/rules/trap_rules.js";
import {
  applyTrapGuardToEffect,
  getCorrosionCandidateIndexes,
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
// #1803: the needle takes a tenth of the opener's maximum HP.
check("full poison needle damage", poison.damage, 2);
check(
  "poison needle damage follows maximum HP",
  resolveChestTrapEffect({ trap: "poison needle", character: { ...soloFighter, hp: 60, maxHp: 60 }, rng: () => 0.99 }).damage,
  6
);
check("full poison needle poison roll", poison.poisonTriggered, true);

const cursedPoisonRisk = calculateChestTrapExpectedRisk({
  trap: "poison needle",
  character: { ...soloFighter, hp: 20, maxHp: 20 },
  statusResistance: -30,
  poisonWard: 50
});
check("negative status resistance raises chest poison probability", cursedPoisonRisk.poisonProbability, 0.65);
const cappedCursedPoisonRisk = calculateChestTrapExpectedRisk({
  trap: "poison needle",
  character: { ...soloFighter, hp: 20, maxHp: 20 },
  statusResistance: -100,
  poisonWard: 50
});
check("negative status resistance poison probability caps at one", cappedCursedPoisonRisk.poisonProbability, 1);
const negativeResistanceEffect = resolveChestTrapEffect({
  trap: "poison needle",
  character: soloFighter,
  statusResistance: -100,
  poisonWard: 50,
  rng: () => 0.99
});
check("negative resistance capped probability cannot be resisted", negativeResistanceEffect.poisonResisted, false);

const combinedPoisonRisk = calculateChestTrapExpectedRisk({
  trap: "poison needle",
  character: { ...soloFighter, hp: 20, maxHp: 20 },
  statusResistance: 30,
  poisonWard: 50
});
check("status resistance and poisonWard multiply", combinedPoisonRisk.poisonProbability, 0.35);
const resistedPoison = resolveChestTrapEffect({
  trap: "poison needle",
  character: soloFighter,
  statusResistance: 30,
  poisonWard: 50,
  rng: () => 0.5
});
check("deterministic roll confirms combined poison resistance", resistedPoison.poisonResisted, true);
const unresistedPoison = resolveChestTrapEffect({
  trap: "poison needle",
  character: soloFighter,
  statusResistance: 30,
  poisonWard: 50,
  rng: () => 0.3
});
check("deterministic roll below combined probability is not resisted", unresistedPoison.poisonResisted, false);

const corrosion = resolveChestTrapEffect({
  trap: "corrosion",
  character: soloFighter,
  inventory: ["TOWN_PORTAL", { kind: "equipment", baseId: "DAGGER" }, "HEAL_POTION", "ANTIDOTE", "DRAGON_KEY"],
  rng: () => 0.99
});
check("corrosion destroys one carried consumable", corrosion.corrodedItem, "ANTIDOTE");
check("corrosion reports the bag index", corrosion.corrodedIndex, 3);
check("corrosion deals no HP damage", corrosion.damage, 0);
check(
  "corrosion never takes the retreat item, equipment, or key items",
  JSON.stringify(getCorrosionCandidateIndexes(["TOWN_PORTAL", { kind: "equipment" }, "DRAGON_KEY", "HEAL_POTION"])),
  JSON.stringify([3])
);
check(
  "corrosion with nothing to corrode consumes no roll",
  resolveChestTrapEffect({ trap: "corrosion", character: soloFighter, inventory: ["TOWN_PORTAL"], rng: () => { throw new Error("rng"); } }).corrodedIndex,
  -1
);
check(
  "a mimic is a fight, not an effect roll",
  resolveChestTrapEffect({ trap: "mimic", character: soloFighter, rng: () => { throw new Error("rng"); } }).mimic,
  true
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
check(
  "corrosion risk is item loss only when something can corrode",
  JSON.stringify([
    calculateChestTrapExpectedRisk({ trap: "corrosion", character: soloFighter, inventory: ["HEAL_POTION"] }).itemLossProbability,
    calculateChestTrapExpectedRisk({ trap: "corrosion", character: soloFighter, inventory: [] }).itemLossProbability,
    calculateChestTrapExpectedRisk({ trap: "corrosion", character: soloFighter, inventory: ["HEAL_POTION"] }).expectedDamageHp
  ]),
  JSON.stringify([1, 0, 0])
);

check(
  "trapGuard reduces only the solo character's HP damage",
  JSON.stringify(applyTrapGuardToEffect({ damage: 10, blinded: true }, { trapGuard: 40 })),
  JSON.stringify({ damage: 6, blinded: true })
);
check(
  "a dead character takes no flash or floor effect and consumes no roll",
  JSON.stringify([
    resolveChestTrapEffect({ trap: "flash bomb", character: { ...soloFighter, status: "dead" }, rng: () => { throw new Error("rng"); } }).damage,
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
