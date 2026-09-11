import assert from "node:assert/strict";

const diagnostic = await import("../../../scratch/measurements/early_b1f_composition_diagnostic.js");

const report = await diagnostic.runEarlyB1FCompositionDiagnostic({
  runs: 2,
  fixedRuns: 1,
  selectionRuns: 2,
  seed: 1192,
  selectionSeed: 1192,
  fixedSeed: 1151,
  allowSmallRunCount: true
});

assert.equal(report.configuration.startingKit, "vanguard");
assert.equal(report.legalPairSurface.length, 43);
assert.ok(report.legalPairSurface.every(pair => pair.names.length === 2));
assert.equal(report.fixedCombat.cases.length, 43 * 4 * 2);
assert.deepEqual(
  Object.keys(report.cases).sort(),
  [
    "baseline",
    "cadence-first-single",
    "composition-pool-redistribution",
    "ordering-defer",
    "ordering-defer-top5",
    "ordering-defer-risk90"
  ].sort()
);
assert.ok(report.candidateProfile.targetCompositionKeys.length > 0);
assert.deepEqual(Object.keys(report.candidateProfile.profiles).sort(), ["risk90", "top3", "top5"]);
assert.ok(report.candidateProfile.profiles.top5.targetCompositionKeys.length >= report.candidateProfile.profiles.top3.targetCompositionKeys.length);
assert.ok(report.candidateProfile.profiles.risk90.targetCompositionKeys.length >= report.candidateProfile.profiles.top3.targetCompositionKeys.length);
for (const profile of Object.values(report.candidateProfile.profiles)) {
  assert.ok(profile.targetCoverage.targetCount > 0);
  assert.ok(profile.targetCoverage.earlyEncounterShare >= 0);
  assert.ok(profile.targetCoverage.earlyDeathShare >= 0);
  assert.ok(Math.abs(profile.targetMass + profile.replacementMass - 1) < 1e-9);
}
assert.ok(report.candidateProfile.replacementPairs.length > 0);
assert.ok(report.candidateProfile.replacementPairs.every(pair =>
  pair.names.length === 2 && pair.weight > 0
));
assert.ok(report.candidateProfile.replacementPairs.every(pair =>
  !report.candidateProfile.targetCompositionKeys.includes(pair.key)
));
assert.ok(report.candidateProfile.targetMass > 0);
assert.ok(report.candidateProfile.replacementMass > 0);
assert.equal(report.fixedCombat.riskDistribution["100:fight"].compositionCount, 43);
assert.equal(report.fixedCombat.riskDistribution["100:fight"].risk.count, 43);
for (const result of Object.values(report.cases)) {
  assert.equal(typeof result.metrics.b1DeathRate, "number");
  assert.equal(typeof result.metrics.b2ArrivalRate, "number");
  assert.equal(typeof result.metrics.byEncounterOrdinal["1"].pair.exposureRate, "number");
  assert.ok(
    result.metrics.byEncounterOrdinal["2"].all.firstActionNotExecutedRate === null ||
    typeof result.metrics.byEncounterOrdinal["2"].all.firstActionNotExecutedRate === "number"
  );
  assert.equal(typeof result.metrics.meaningfulRewardRate, "number");
  assert.equal(typeof result.metrics.buildOpportunityRate, "number");
  assert.equal(typeof result.metrics.diversity.uniqueEffectivePairCompositions, "number");
  assert.equal(typeof result.metrics.byEncounterOrdinal["1"].generatedPair.deathRate, "number");
  assert.ok(!Object.hasOwn(result.metrics.byEncounterOrdinal["1"].candidateActions || {}, "release-deferred"));
  assert.ok(
    result.metrics.byEncounterOrdinal["1"].nextEntryHpRate === null ||
    typeof result.metrics.byEncounterOrdinal["1"].nextEntryHpRate === "object"
  );
}
assert.equal(report.flee.selected, report.flee.executed + report.flee.selectedButNotExecuted);
assert.equal(report.flee.executed, report.flee.survived + report.flee.partingAttackDeaths);

const repeated = await diagnostic.runEarlyB1FCompositionDiagnostic({
  runs: 2,
  fixedRuns: 1,
  selectionRuns: 2,
  seed: 1192,
  selectionSeed: 1192,
  fixedSeed: 1151,
  allowSmallRunCount: true
});
assert.deepEqual(repeated, report);

console.log("[PASS] early B1F legal-pair surface and matched C/P/O diagnostic wiring");
