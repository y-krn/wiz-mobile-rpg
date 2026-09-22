import assert from "node:assert/strict";

const { MONSTERS } = await import("../../../src/data/monsters.js");
const { getCombatTierForStartFloor } = await import("../../../src/rules/combat_tier.js");
const {
  CONDITIONS,
  DEPTHS,
  PLAYER_FIXTURE,
  REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
  TRAIT_FIXTURES,
  runCompositionTraitDiagnostic,
  resolveWorldSeed
} = await import("../../../scratch/measurements/composition_trait_diagnostic.js");

const first = await runCompositionTraitDiagnostic({ runs: 1, seed: 1599, allowSmallRunCount: true });
const second = await runCompositionTraitDiagnostic({ runs: 1, seed: 1599, allowSmallRunCount: true });
const activationSmoke = await runCompositionTraitDiagnostic({ runs: 30, seed: 1599 });

assert.deepEqual(first, second, "composition trait smoke must be deterministic");
assert.equal(first.measurementId, "composition-trait-diagnostic");
assert.deepEqual(first.configuration.depths, [...DEPTHS]);
assert.deepEqual(first.configuration.traits.map(trait => trait.id), [
  "guardAdjacent", "buffAtk", "buffPhysicalDef", "summonAlly"
]);
assert.deepEqual(first.configuration.conditions.map(condition => condition.id), [
  "trait-absent", "production", "candidate"
]);
assert.equal(first.cells.length, 44, "guardAdjacent has two conditions; three support traits have three conditions");
assert.equal(first.comparisons.length, 16);
assert.equal(first.configuration.reflectPhysicalDiagnosticFreeze, REFLECT_PHYSICAL_DIAGNOSTIC_RATE);
assert.deepEqual(first.configuration.playerFixture, {
  ...PLAYER_FIXTURE,
  weaponProfile: PLAYER_FIXTURE.weapon,
  armorProfile: PLAYER_FIXTURE.armor,
  shieldProfile: PLAYER_FIXTURE.shield
});
assert.equal(first.configuration.scaling, "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0");
assert.equal(
  resolveWorldSeed({ seed: 1599, traitId: "buffAtk", depth: 20, runIndex: 2 }),
  "1599:issue1608:buffAtk:B20:2",
  "all paired conditions must share the same world seed"
);

for (const fixture of TRAIT_FIXTURES) {
  const owner = MONSTERS.find(monster => monster.name === fixture.ownerName);
  const neutral = MONSTERS.find(monster => monster.name === fixture.neutralAllyName);
  assert.ok(owner, `${fixture.id} owner must be production data`);
  assert.ok(neutral, `${fixture.id} neutral ally must be production data`);
  assert.ok(owner.traits.includes(fixture.id), `${fixture.id} owner trait must be production data`);
  assert.ok(!neutral.traits?.includes(fixture.id), `${fixture.id} neutral ally must stay neutral`);
  if (fixture.id === "summonAlly") {
    assert.equal(owner.summon.name, "ゴブリンの呪術師");
    assert.equal(owner.summon.maxAllies, 5);
    const configuration = first.configuration.traits.find(trait => trait.id === fixture.id);
    assert.deepEqual(configuration.productionSummon, { name: "ゴブリンの呪術師", maxAllies: 5 });
  }
}

for (const comparison of first.comparisons) {
  assert.equal(comparison.production.runs, 1);
  assert.equal(comparison.noTrait.runs, 1);
  assert.ok(comparison.production.observedTraitPresence.includes(comparison.traitId));
  assert.ok(!comparison.noTrait.observedTraitPresence.includes(comparison.traitId));
  assert.ok(Number.isFinite(comparison.deltas.productionVsNoTrait.rounds.average));
  assert.ok(Number.isFinite(comparison.deltas.productionVsNoTrait.damageTaken.average));
  assert.ok(Number.isFinite(comparison.deltas.productionVsNoTrait.enemyActions.average));
  assert.ok(Number.isFinite(comparison.deltas.productionVsNoTrait.survivalRate));
  assert.ok(Number.isFinite(comparison.deltas.productionVsNoTrait.traitEffectAmount.average));
  if (comparison.candidate) {
    assert.equal(comparison.candidate.runs, 1);
    assert.ok(comparison.candidate.observedTraitPresence.includes(comparison.traitId));
    assert.ok(Number.isFinite(comparison.deltas.candidateVsProduction.normalActionContinuation.average));
  }
  if (comparison.traitId === "summonAlly") {
    assert.equal(comparison.production.spawnedAllies.average, comparison.production.traitEffect.effectAmount.average);
    assert.equal(comparison.noTrait.spawnedAllies.average, 0);
    const measured = activationSmoke.comparisons.find(candidate =>
      candidate.traitId === comparison.traitId && candidate.depth === comparison.depth
    );
    const target = MONSTERS.find(monster => monster.name === "ゴブリンの呪術師");
    const tier = getCombatTierForStartFloor(comparison.depth);
    const expected = {
      name: target.name,
      hp: Math.round(target.hp * (1 + 0.20 * tier)),
      maxHp: Math.round(target.hp * (1 + 0.20 * tier)),
      atk: Math.round(target.atk * (1 + 0.10 * tier)),
      def: Math.round(target.def * 1.0)
    };
    assert.ok(measured.production.summonedAllies.length > 0, `summonAlly B${comparison.depth} must observe a summon`);
    assert.deepEqual(measured.production.summonedAllies, [expected]);
  }
}

for (const traitId of ["buffAtk", "buffPhysicalDef", "summonAlly"]) {
  const comparisons = activationSmoke.comparisons.filter(comparison => comparison.traitId === traitId);
  assert.ok(
    comparisons.some(comparison => comparison.production.traitEffect.activationCount.average > 0),
    `${traitId} production must observe an activation`
  );
  if (traitId === "buffPhysicalDef") {
    assert.ok(
      comparisons.some(comparison => comparison.production.normalActionContinuation.average > 0),
      "buffPhysicalDef current flat DEF row must continue with a normal action"
    );
  } else {
    assert.ok(
      comparisons.every(comparison => comparison.production.normalActionContinuation.average === 0),
      `${traitId} production support action must remain a normal-action replacement`
    );
  }
  assert.ok(
    comparisons.every(comparison => comparison.noTrait.traitEffect.activationCount.average === 0),
    `${traitId} no-trait must observe zero activations`
  );
  assert.ok(
    comparisons.some(comparison => comparison.candidate.normalActionContinuation.average > 0),
    `${traitId} candidate must continue a normal action`
  );
}

for (const comparison of activationSmoke.comparisons.filter(item => item.traitId === "buffPhysicalDef")) {
  assert.equal(comparison.noTrait.physicalMitigationHits.average, 0);
  assert.equal(comparison.production.physicalMitigationHits.average, 0);
  assert.ok(comparison.production.normalActionContinuation.average > 0);
  assert.equal(comparison.candidate.physicalMitigationConsumed, true);
  assert.ok(comparison.candidate.normalActionContinuation.average > 0);
  assert.ok(comparison.candidate.physicalMitigationHits.average > 0);
}

console.log("[PASS] Issue #1608 buffPhysicalDef effect semantic pairing, mitigation consumption, and determinism");
