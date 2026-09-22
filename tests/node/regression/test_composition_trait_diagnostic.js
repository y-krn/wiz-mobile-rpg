import assert from "node:assert/strict";

const { MONSTERS } = await import("../../../src/data/monsters.js");
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

assert.deepEqual(first, second, "composition trait smoke must be deterministic");
assert.equal(first.measurementId, "composition-trait-diagnostic");
assert.deepEqual(first.configuration.depths, [...DEPTHS]);
assert.deepEqual(first.configuration.traits.map(trait => trait.id), [
  "guardAdjacent", "buffAtk", "buffPhysicalDef", "summonAlly"
]);
assert.deepEqual(first.configuration.conditions.map(condition => condition.id), [
  "trait-present", "trait-absent"
]);
assert.equal(first.cells.length, 32, "four traits × four depths × two conditions only");
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
  "1599:issue1599:buffAtk:B20:2",
  "paired conditions must share the same world seed"
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
  assert.equal(comparison.present.runs, 1);
  assert.equal(comparison.absent.runs, 1);
  assert.ok(comparison.present.observedTraitPresence.includes(comparison.traitId));
  assert.ok(!comparison.absent.observedTraitPresence.includes(comparison.traitId));
  assert.ok(Number.isFinite(comparison.delta.rounds.average));
  assert.ok(Number.isFinite(comparison.delta.damageTaken.average));
  assert.ok(Number.isFinite(comparison.delta.enemyActions.average));
  assert.ok(Number.isFinite(comparison.delta.survivalRate));
  assert.ok(Number.isFinite(comparison.delta.traitEffectAmount.average));
  if (comparison.traitId === "summonAlly") {
    assert.equal(comparison.present.spawnedAllies.average, comparison.present.traitEffect.effectAmount.average);
    assert.equal(comparison.absent.spawnedAllies.average, 0);
  }
}

console.log("[PASS] Issue #1599 composition trait pairing, fixed scope, and determinism");
