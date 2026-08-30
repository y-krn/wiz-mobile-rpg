import assert from "node:assert/strict";
import {
  CHECKPOINTS,
  HORIZONS,
  POLICIES,
  RUNNER_VERSION,
  SCHEMA_VERSION,
  runMeasurement
} from "../../measurements/issue990_phase3_stage3_checkpoint_continuation.js";

const report = runMeasurement({ seed: "issue990-stage3-regression", runs: 1 });
assert.equal(report.schemaVersion, SCHEMA_VERSION);
assert.equal(report.measurement.runnerVersion, RUNNER_VERSION);
assert.deepEqual(report.measurement.configuration.checkpoints, [...CHECKPOINTS]);
assert.deepEqual(report.measurement.configuration.policies, [...POLICIES]);
assert.deepEqual(report.measurement.configuration.horizons, HORIZONS);
assert.equal(report.measurement.configuration.productionBalanceChanged, false);
assert.equal(report.audit.sameCheckpointStateForPolicies, true);
assert.equal(report.audit.sameContinuationSeedForPolicies, true);
assert.equal(report.audit.combatPolicyOnlyVariable, true);
assert.equal(report.audit.hiddenFutureCombatInfoUsed, false);
assert.equal(report.audit.hiddenMapInfoUsed, false);
assert.equal(report.audit.hiddenFutureLootUsed, false);
assert.equal(report.audit.rawFullCombatHistoriesStored, false);

for (const checkpoint of CHECKPOINTS) {
  const audit = report.checkpointStateAudits[checkpoint];
  assert.equal(audit.N, 1);
  for (const field of ["hpRatio", "mpRatio", "ATK", "DEF", "maxHP", "maxMP", "inventoryCount", "consumableCount", "coreCount", "supportCount", "equipmentChangesAccumulated", "buildScore", "equippedItemCount"]) {
    assert.equal(typeof audit.distribution.checkpointStateDistribution[field].p50, "number", `B${checkpoint} state ${field}`);
  }
  for (const rarity of ["magic", "rare", "epic", "other"]) assert.equal(typeof audit.distribution.checkpointStateDistribution.equipmentRarity[rarity].p50, "number", `B${checkpoint} rarity ${rarity}`);
  for (const policy of POLICIES) {
    const summary = report.policies[`B${checkpoint}:${policy}`];
    assert.equal(summary.N, 1);
    assert.equal(summary.deathIncidence, summary.deaths / summary.N);
    assert.equal(summary.pureRawIncidence, summary.pureRawDeaths / summary.N);
    assert.equal(summary.pureRawShareAmongDeaths, summary.deaths ? summary.pureRawDeaths / summary.deaths : null);
    assert.equal(Object.values(summary.deathCategories).reduce((total, value) => total + value.count, 0), summary.deaths);
    assert.ok(summary.checkpointSources);
    assert.ok(summary.resourceCohorts.results.lower_resource);
    assert.equal(typeof summary.normalDamage, "number");
  }
  const entryState = report.policies[`B${checkpoint}:balanced-combat`].entryHpRatio;
  for (const policy of POLICIES) assert.equal(report.policies[`B${checkpoint}:${policy}`].entryHpRatio.mean, entryState.mean, `same B${checkpoint} HP state`);
}

assert.equal(report.comparison.sameSeedPairs.length, CHECKPOINTS.length * 3);
assert.ok(report.comparison.sameSeedPairs.every(pair => pair.pairedN === 1));
assert.ok(report.comparison.sameSeedPairs.every(pair => pair.commonSupport.encounters >= 0));
assert.ok(report.comparison.sameSeedPairs.every(pair => pair.commonSupport.encounters <= pair.pairedN * 5));
assert.ok(report.policyDefinitions.every(definition => definition.unchangedFrom === "Issue #1002 Stage 2"));
assert.ok(report.checkpointProvenance[30].source.includes("production continuation"));
assert.equal(report.finalAnalysis.buildConfidence, "Revise");
assert.equal(report.finalAnalysis.close990, true);

const repeat = runMeasurement({ seed: "issue990-stage3-regression", runs: 1 });
assert.deepEqual(repeat, report, "checkpoint continuation must be deterministic");
console.log("[PASS] Phase 3 Stage 3 checkpoint state, same-seed, denominator, category, and determinism contracts");
