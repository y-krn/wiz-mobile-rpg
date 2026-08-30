import assert from "node:assert/strict";
import {
  CHECKPOINTS,
  DEATH_CATEGORIES,
  PERSONA_POLICIES,
  conditionalSurvival,
  percentile,
  runMeasurement,
  SCHEMA_VERSION,
  RUNNER_VERSION
} from "../../measurements/issue990_phase3_stage1.js";

const personaIds = ["cautious", "aggressive", "explorer", "stairs-first", "balanced"];
assert.deepEqual(Object.keys(PERSONA_POLICIES), personaIds, "Stage 1 registers five required personas");
for (const policy of Object.values(PERSONA_POLICIES)) {
  assert.deepEqual(Object.keys(policy).sort(), ["equipmentWeights", "exploration", "explorationPolicy", "id", "label", "priority", "resourcePolicy"].sort());
  assert.ok(policy.equipmentWeights.defense >= 0);
  assert.ok(policy.resourcePolicy.healPotionThreshold >= 0);
}

assert.equal(percentile([0, 10], 0.5), 5, "percentile uses linear interpolation");
assert.equal(percentile([], 0.5), null, "empty percentile is explicit");

const report = runMeasurement({ seed: "issue990-stage1-regression", runs: 1 });
assert.equal(report.schemaVersion, SCHEMA_VERSION);
assert.equal(report.measurement.runnerVersion, RUNNER_VERSION);
for (const field of ["sourceCommit", "mainBaselineSha", "measurementRunnerDiffSha256", "environmentSignature"]) {
  assert.ok(Object.hasOwn(report.measurement, field), `measurement provenance includes ${field}`);
}
assert.deepEqual(report.measurement.configuration.personas, personaIds);
assert.equal(report.measurement.configuration.startFloor, 1, "all personas start at B1");
assert.equal(report.measurement.configuration.forcedPush, true);
assert.equal(report.measurement.configuration.retreatModeled, false);
assert.equal(report.measurement.worldSeedTemplate, "issue990-stage1-regression:world:{runIndex}");
assert.deepEqual(report.audit, {
  hiddenStairsUsed: false,
  hiddenBossUsed: false,
  hiddenSecretDoorUsed: false,
  futureEncounterInfoUsed: false,
  futureLootUsed: false,
  unidentifiedHiddenAffixUsed: false,
  retreatDecisionUsed: false,
  forcedPush: true,
  rawEncounterHistoryStored: false,
  productionBalanceChanged: false,
  deathCategories: DEATH_CATEGORIES,
  deathCategoryContract: "every death receives exactly one exclusive category; mechanic-mediated requires state-degradation evidence from production causal classifier"
});

for (const persona of personaIds) {
  const summary = report.naturalProgression[persona].summary;
  assert.equal(summary.runs, 1);
  assert.deepEqual(Object.keys(summary.checkpoints).map(Number), CHECKPOINTS);
  for (const checkpoint of CHECKPOINTS) {
    const population = summary.checkpoints[String(checkpoint)];
    assert.ok(Number.isInteger(population.reachedCount));
    assert.ok(Object.hasOwn(population, "representativeSnapshots"));
    if (population.reachedCount) {
      const snapshot = population.representativeSnapshots[0];
      for (const field of ["persona", "worldSeed", "runIndex", "floor", "hp", "maxHP", "hpRatio", "mp", "maxMP", "mpRatio", "ATK", "DEF", "spells", "equippedBaseIds", "activeCoreIds", "supportAffixes", "combatBuildScore", "equipmentChangesSoFar", "equipmentDropsSeen", "encountersSoFar", "normalHitsReceivedSoFar", "totalNormalDamageSoFar", "enemyActionsSoFar", "roundsSoFar", "stepsSoFar", "exploredRatio", "searchActionsSoFar", "campUsageSoFar", "previousEncounterDamage"]) {
        assert.ok(Object.hasOwn(snapshot, field), `${persona} B${checkpoint} snapshot has ${field}`);
      }
    }
  }
  for (const category of DEATH_CATEGORIES) assert.ok(Object.hasOwn(summary.deathCategories, category));
}

assert.equal(report.raw, undefined, "full raw runs are not durable evidence");
assert.equal(report.naturalProgression.cautious.summary.reached["5"].count >= 0, true);
assert.equal(report.comparison.personaPairs["cautious__aggressive"].pairedRuns, 1);
assert.equal(report.comparison.personaPairs["cautious__aggressive"].leftReachedDeeper + report.comparison.personaPairs["cautious__aggressive"].sameDepth + report.comparison.personaPairs["cautious__aggressive"].rightReachedDeeper, 1);

const emptyConditional = conditionalSurvival([]);
for (const transition of Object.values(emptyConditional)) {
  assert.equal(transition.rate, null);
  assert.equal(transition.status, "unobserved");
  assert.equal(transition.insufficient, true);
}

const repeat = runMeasurement({ seed: "issue990-stage1-regression", runs: 1 });
assert.deepEqual(repeat, report, "same seed and runIndex are deterministic");
for (const persona of personaIds) {
  const snapshot = report.naturalProgression[persona].summary.checkpoints["5"].representativeSnapshots[0];
  if (snapshot) assert.equal(snapshot.worldSeed, "issue990-stage1-regression:world:0");
}
console.log("[PASS] Phase 3 Stage 1 persona, hidden-info, checkpoint, aggregation, and determinism contracts");
