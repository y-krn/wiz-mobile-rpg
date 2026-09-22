import assert from "node:assert/strict";

const { MONSTERS } = await import("../../../src/data/monsters.js");
const { buildCombatTurnQueue } = await import("../../../src/combat_logic/turn_order.js");
const {
  REFLECT_PHYSICAL_RATE_CANDIDATE,
  REFLECT_PHYSICAL_RATE_REFERENCE,
  resolveWorldSeed,
  runReflectPhysicalDiagnostic,
  runTraitScalingDiagnostic
} = await import(
  "../../../scratch/measurements/trait_scaling_diagnostic.js"
);

const first = await runTraitScalingDiagnostic({ runs: 1, seed: 1586, allowSmallRunCount: true });
const second = await runTraitScalingDiagnostic({ runs: 1, seed: 1586, allowSmallRunCount: true });

assert.deepEqual(first, second, "trait scaling smoke must be deterministic");
assert.deepEqual(first.configuration.depths, [5, 10, 20, 30]);
assert.deepEqual(
  first.configuration.traits.map(trait => trait.id),
  ["evasive", "multiAction", "regen", "reflectPhysical"]
);
assert.equal(first.cells.length, 32, "trait × depth × condition scope must remain bounded");
assert.equal(first.comparisons.length, 16);
assert.equal(first.configuration.buildFixtureId, null);
assert.equal(first.configuration.playerFixture.id, "phase1-freeze-candidate");
assert.deepEqual(
  first.configuration.playerFixture,
  {
    id: "phase1-freeze-candidate",
    startingKit: "vanguard",
    maxHp: 100,
    weapon: "sword",
    armor: "mediumArmor",
    shield: "smallShield",
    guardTiming: "declared",
    loadPolicy: "aggregate",
    loadCandidateId: "cappedHalfStep",
    actionPlan: "attack-defend",
    weaponPowerBase: 100,
    armorMitigation: 0.2,
    guardMultiplier: 0.5,
    weaponProfile: "sword",
    armorProfile: "mediumArmor",
    shieldProfile: "smallShield"
  }
);
assert.equal(first.configuration.scaling, "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0");
assert.equal(
  resolveWorldSeed({ seed: 1586, traitId: "evasive", depth: 10, runIndex: 3 }),
  resolveWorldSeed({ seed: 1586, traitId: "evasive", depth: 10, runIndex: 3, conditionId: "trait-absent" }),
  "paired conditions must share the same world seed"
);
assert.ok(!resolveWorldSeed({ seed: 1586, traitId: "evasive", depth: 10, runIndex: 3 }).includes("trait-present"));

const freeze = first.freezeApplication;
const evasiveTemplate = MONSTERS.find(monster => monster.name === "這い寄る影");
assert.ok(evasiveTemplate);
assert.equal(freeze.combatTier, 1);
assert.equal(freeze.enemyMaxHp, Math.round(evasiveTemplate.hp * 1.2));
assert.equal(freeze.enemyAtk, Math.round(evasiveTemplate.atk * 1.1));
assert.equal(freeze.weaponCandidateId, "sword");
assert.equal(freeze.weaponCandidateMultiplier, 1);
assert.equal(freeze.weaponCandidateHitChance, 0.92);
assert.equal(freeze.weaponCandidateHighDefPenetration, 0.05);
assert.equal(freeze.weaponTargetEvasionChance, evasiveTemplate.evasionChance);
assert.equal(freeze.weaponHitChance, 0.92 - evasiveTemplate.evasionChance);
assert.equal(freeze.evasionMissObserved, true);
assert.equal(freeze.weaponFormulaRaw, freeze.weaponBaseRaw);
assert.equal(freeze.weaponEffectiveDefense, freeze.weaponDefenseInput * 0.95);
assert.equal(freeze.armorDefResistance, 0.2);
assert.equal(freeze.guardResolvedMultiplier, true);
assert.equal(freeze.declaredGuardTimingObserved, true);

const evasiveB5 = first.comparisons.find(comparison =>
  comparison.traitId === "evasive" && comparison.depth === 5
);
assert.ok(evasiveB5);
assert.equal(evasiveB5.present.evasionMisses, 1, "paired present seed must observe evasive miss");
assert.equal(evasiveB5.absent.evasionMisses, 0, "paired absent seed must remove evasive miss");
assert.equal(evasiveB5.present.freezeApplication.evasionMissObserved, true);
assert.equal(evasiveB5.absent.freezeApplication.evasionMissObserved, false);
assert.equal(evasiveB5.absent.freezeApplication.weaponTargetEvasionChance, 0);
assert.equal(evasiveB5.absent.freezeApplication.weaponHitChance, 0.92);

function resolveFirstTurn(playerLoadModifier) {
  const state = {
    party: [{
      status: "ok",
      equipment: { weapon: null, armor: null, shield: null, accessory: null, accessory2: null },
      buffs: []
    }],
    combatState: {
      roundNumber: 1,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      monsters: [{ hp: 10, traits: [], name: "fixture" }]
    }
  };
  return buildCombatTurnQueue(
    state,
    { actions: [{ type: "fight", actorIdx: 0 }] },
    [],
    {
      rng: () => 0.1,
      policy: {
        measurementInitiative: { rollSize: 20, playerLoadModifier, enemySpeedModifier: 0 },
        measurementDisableSharedNormalEnemyActionSlot: true
      }
    }
  )[0].type;
}

assert.equal(resolveFirstTurn(-1), "monster", "capped half-step Load must affect initiative calculation");
assert.equal(resolveFirstTurn(2), "char", "initiative regression must distinguish Load candidates");

const reflectFirst = await runReflectPhysicalDiagnostic({ runs: 1, seed: 1594, allowSmallRunCount: true });
const reflectSecond = await runReflectPhysicalDiagnostic({ runs: 1, seed: 1594, allowSmallRunCount: true });
assert.deepEqual(reflectFirst, reflectSecond, "reflectPhysical diagnostic smoke must be deterministic");
assert.equal(reflectFirst.measurementId, "reflect-physical-diagnostic");
assert.deepEqual(reflectFirst.configuration.depths, [5, 10, 20, 30]);
assert.deepEqual(reflectFirst.configuration.traits.map(trait => trait.id), ["reflectPhysical"]);
assert.deepEqual(reflectFirst.configuration.conditions.map(condition => condition.id), [
  "trait-absent", "production-reference", "candidate-020"
]);
assert.deepEqual(reflectFirst.configuration.metrics, [
  "rounds", "damageTaken", "enemyActions", "survival", "reflectedDamage"
]);
assert.equal(reflectFirst.configuration.reflectPhysical.productionReferenceRate, REFLECT_PHYSICAL_RATE_REFERENCE);
assert.equal(reflectFirst.configuration.reflectPhysical.candidateRate, REFLECT_PHYSICAL_RATE_CANDIDATE);
const reflectTemplate = MONSTERS.find(monster => monster.name === "鋼殻ビートル");
assert.equal(reflectTemplate?.physicalReflect?.rate, REFLECT_PHYSICAL_RATE_REFERENCE);
assert.equal(reflectFirst.cells.length, 12, "reflectPhysical scope must be one fixture × depth × three conditions");
assert.equal(reflectFirst.comparisons.length, 4);
for (const comparison of reflectFirst.comparisons) {
  assert.equal(comparison.noTrait.observedTraitPresence.includes("reflectPhysical"), false);
  assert.equal(comparison.productionReference.observedTraitPresence.includes("reflectPhysical"), true);
  assert.equal(comparison.candidate.observedTraitPresence.includes("reflectPhysical"), true);
  assert.equal(comparison.productionReference.freezeApplication.reflectPhysicalRate, null);
  assert.equal(comparison.candidate.freezeApplication.reflectPhysicalRate, REFLECT_PHYSICAL_RATE_CANDIDATE);
  assert.equal(comparison.noTrait.reflectedDamage.average, 0);
  assert.ok(Number.isFinite(comparison.deltas.candidateVsNoTrait.reflectedDamage.average));
  assert.ok(Number.isFinite(comparison.deltas.candidateVsProductionReference.reflectedDamage.average));
}

for (const comparison of first.comparisons) {
  assert.equal(comparison.present.runs, 1);
  assert.equal(comparison.absent.runs, 1);
  assert.ok(comparison.present.observedTraitPresence.includes(comparison.traitId));
  assert.ok(!comparison.absent.observedTraitPresence.includes(comparison.traitId));
  assert.ok(Number.isFinite(comparison.delta.rounds.average));
  assert.ok(Number.isFinite(comparison.delta.damageTaken.average));
  assert.ok(Number.isFinite(comparison.delta.enemyActions.average));
  assert.ok(Number.isFinite(comparison.delta.survivalRate));
  assert.ok(Number.isFinite(comparison.delta.traitEffectAmount.average));
}

console.log("[PASS] Phase 2a trait scaling diagnostic scope, pairing, and determinism");
