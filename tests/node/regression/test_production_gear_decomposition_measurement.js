import assert from "node:assert/strict";

const { CONDITIONS, runProductionGearDecompositionMeasurement } = await import(
  "../../../scratch/measurements/production_gear_decomposition_measurement.js"
);

const report = await runProductionGearDecompositionMeasurement({
  runs: 1,
  seed: 1173,
  fixedSeed: 1151,
  allowSmallRunCount: true
});

assert.equal(report.schemaVersion, 1);
assert.equal(report.configuration.runs, 1);
assert.equal(report.configuration.fixedCombatSeed, 1151);
assert.equal(report.configuration.fixedCompositionCount, 6);
assert.deepEqual(report.configuration.policies, ["fight", "visible-multi-enemy-flee"]);
assert.deepEqual(Object.keys(report.gear), CONDITIONS.map(condition => condition.id));
assert.deepEqual(Object.keys(report.b1f), CONDITIONS.map(condition => condition.id));
assert.deepEqual(Object.keys(report.fixed), CONDITIONS.map(condition => condition.id));
assert.equal(report.gear["actual-light"].equipment.slots.weapon.id, "DAGGER");
assert.equal(report.gear["actual-standard"].equipment.slots.weapon.id, "SHORT_SWORD");
assert.equal(report.gear["actual-heavy"].equipment.slots.weapon.id, "CLAYMORE");
assert.equal(report.gear["actual-heavy"].equipment.slots.shield, null);
assert.equal(report.fixed["weapon-claymore"].fight.cases.length, 6);
assert.equal(report.fixed["weapon-claymore"].fight.aggregate.runs, 6);
assert.equal(report.b1f["shield-large-shield"].fight.runs, 1);
assert.ok(Object.hasOwn(report.b1f["actual-light"].fight, "playerBeforeAnyEnemyRate"));
assert.ok(Object.hasOwn(report.b1f["actual-light"]["visible-multi-enemy-flee"], "fleeSelected"));
assert.match(report.decision.primary, /^[A-E]-/);

const repeated = await runProductionGearDecompositionMeasurement({
  runs: 1,
  seed: 1173,
  fixedSeed: 1151,
  allowSmallRunCount: true
});
assert.deepEqual(repeated, report);

console.log("[PASS] Issue #1173 production gear decomposition fixture smoke and determinism");
