import assert from "node:assert/strict";

const diagnostic = await import(
  "../../../scratch/measurements/early_encounter_cause_diagnostic.js"
);
const starting = await import("../../../scratch/measurements/starting_kit_diagnostic.js");

assert.deepEqual(diagnostic.RUNNER_VERSION, "issue1187-early-encounter-cause-v4");
assert.deepEqual(starting.EARLY_COMPOSITION_POLICY_IDS, [
  "baseline",
  "suppress-first-multi",
  "suppress-first-two-multi"
]);

const report = await diagnostic.runEarlyEncounterCauseDiagnostic({
  runs: 20,
  fixedRuns: 1,
  seed: 1187,
  fixedSeed: 1151,
  allowSmallRunCount: true
});

assert.equal(report.configuration.startingKit, "vanguard");
assert.equal(report.configuration.runs, 20);
assert.equal(report.configuration.fixedCombatRuns, 1);
assert.deepEqual(Object.keys(report.runs), starting.EARLY_COMPOSITION_POLICY_IDS);
assert.deepEqual(Object.keys(report.sensitivity), starting.EARLY_COMPOSITION_POLICY_IDS);
assert.deepEqual(report.naturalEntryResource.fixedHpBandReference, ["100%", "75%", "50%", "25%"]);
for (const ordinal of ["1", "2"]) {
  for (const group of ["all", "single", "pair"]) {
    const entry = report.naturalEntryResource.byEncounterOrdinal[ordinal][group];
    assert.ok(entry.encounters > 0);
    assert.ok(Number.isFinite(entry.hpRateBeforeEncounter.p25));
    assert.ok(Number.isFinite(entry.hpRateBeforeEncounter.p50));
    assert.ok(Number.isFinite(entry.hpRateBeforeEncounter.p75));
    assert.ok(Number.isFinite(entry.hpRateBeforeEncounter.p95));
    assert.ok(Number.isFinite(entry.mpRateBeforeEncounter.p25));
    assert.ok(Number.isFinite(entry.mpRateBeforeEncounter.p50));
    assert.ok(Number.isFinite(entry.mpRateBeforeEncounter.p75));
    assert.ok(Number.isFinite(entry.mpRateBeforeEncounter.p95));
  }
}
for (const ordinal of ["1", "2"]) {
  for (const group of ["all", "single", "pair"]) {
    const cost = report.naturalEncounterCost.byEncounterOrdinal[ordinal][group];
    assert.ok(cost.encounters > 0);
    assert.ok(Number.isFinite(cost.normalDamage.p50));
    assert.ok(Number.isFinite(cost.normalDamage.p95));
    if (cost.survivorPostCombatHp.count > 0) {
      assert.ok(Number.isFinite(cost.survivorPostCombatHp.p50));
      assert.ok(Number.isFinite(cost.survivorPostCombatHp.p95));
      assert.ok(Number.isFinite(cost.survivorPostCombatHpRate.p50));
    }
  }
}
assert.ok(report.naturalEncounterCost.encounter1ToEncounter2.all.runs > 0);
assert.ok(report.naturalEncounterCost.encounter1ToEncounter2.single.runs > 0);
assert.ok(report.naturalEncounterCost.encounter1ToEncounter2.pair.runs > 0);
assert.ok(report.fleeEncounter2Cohort.encounter2ReachedRuns > 0);
assert.ok(report.fleeEncounter2Cohort.selected.selectedRuns > 0);
assert.ok(report.fleeEncounter2Cohort.executed.selectedRuns > 0);

for (const policy of starting.EARLY_COMPOSITION_POLICY_IDS) {
  const result = report.runs[policy];
  assert.equal(result.configuration.earlyCompositionPolicy, policy);
  assert.equal(result.earlyActionOpportunity.byEncounterOrdinal["1"].encounteredRate >= 0, true);
  assert.equal(result.earlyActionOpportunity.byEncounterOrdinal["2"].encounteredRate >= 0, true);
  assert.ok(result.encounterExposure.encounterRows.length > 0);
  const firstRow = result.encounterExposure.encounterRows[0];
  for (const field of [
    "rawInitialVisibleEnemyCount",
    "initialVisibleEnemyCount",
    "firstPlayerActionExecutionTiming",
    "firstPlayerActionExecuted",
    "enemyActionsBeforeFirstPlayerAction",
    "damageBeforeFirstPlayerAction"
  ]) {
    assert.ok(Object.hasOwn(firstRow, field), `missing ${field}`);
  }
}

const baselineRows = report.runs.baseline.encounterExposure.encounterRows;
const candidateRows = report.runs["suppress-first-multi"].encounterExposure.encounterRows;
const matchedPair = baselineRows.find(row =>
  row.encounterOrdinal === 1 && row.rawInitialVisibleEnemyCount >= 2
);
assert.ok(matchedPair, "smoke must observe a first-encounter production pair");
const candidatePair = candidateRows.find(row =>
  row.runIndex === matchedPair.runIndex && row.encounterOrdinal === 1
);
assert.equal(candidatePair.rawInitialVisibleEnemyCount, matchedPair.rawInitialVisibleEnemyCount);
assert.equal(candidatePair.initialVisibleEnemyCount, 1);
assert.equal(candidatePair.earlyCompositionSuppressed, true);

const hp100Fight = report.fixedCombat.contrasts.find(row => row.hpBandId === "100");
const hp25Fight = report.fixedCombat.contrasts.find(row => row.hpBandId === "25");
assert.ok(hp100Fight);
assert.ok(hp25Fight);
assert.ok(Number.isFinite(hp100Fight.lowMinusHighFightClearRate));
assert.ok(Number.isFinite(hp25Fight.lowMinusHighFightClearRate));

assert.throws(
  () => starting.createDiagnosticScenario({
    startingKit: "vanguard",
    policy: "fight",
    fleeHpThreshold: 0.2,
    earlyCompositionPolicy: "all-pairs-disabled"
  }),
  /earlyCompositionPolicy must be/
);

console.log("[PASS] early encounter cause diagnostic wiring, matched counterfactuals, and fixed-combat reuse");
