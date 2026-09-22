import assert from "node:assert/strict";

const { runTraitScalingDiagnostic } = await import(
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
assert.equal(first.configuration.buildFixtureId, "light-shield");
assert.equal(first.configuration.scaling, "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0");

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
