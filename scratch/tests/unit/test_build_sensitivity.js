import assert from "node:assert/strict";
import {
  createEncounterFixture,
  deriveSharedCaseSeed,
  getBuildDefinitions,
  isSignificantReversal,
  classifyCausalDeath,
  runEncounterSample,
  runMeasurement
} from "../../measurements/issue973_build_sensitivity.js";
import { CORE_AFFIXES, SUPPORT_AFFIXES } from "../../../src/data/affixes.js";
import { ITEMS } from "../../../src/data/items.js";
import { SPELLS } from "../../../src/data/spells.js";

const coreIds = new Set(CORE_AFFIXES.map(affix => affix.id));
const supportIds = new Set(SUPPORT_AFFIXES.map(affix => affix.id));

const first = createEncounterFixture("magic-denial", 13);
const second = createEncounterFixture("magic-denial", 13);
assert.deepEqual(first, second, "production encounter fixtures must be deterministic");
assert.notDeepEqual(
  first.monsters.map(monster => monster.maxHp),
  createEncounterFixture("magic-denial", 18).monsters.map(monster => monster.maxHp),
  "depth scaling must remain visible in fixture stats"
);

const builds = getBuildDefinitions();
assert.equal(builds.length, 4, "the v0 measurement must expose four Mage archetypes");
builds.forEach(build => {
  assert.equal(build.className || "Mage", "Mage");
  build.spells.forEach(spellName => assert.ok(SPELLS[spellName], `unknown spell ${spellName}`));
  Object.entries(build.equipment).forEach(([slot, item]) => {
    assert.ok(ITEMS[item.baseId], `unknown item ${item.baseId}`);
    if (item.coreId) assert.ok(coreIds.has(item.coreId), `unknown core ${item.coreId}`);
    (item.supports || []).forEach(support => assert.ok(supportIds.has(support.id), `unknown support ${support.id}`));
    assert.ok(slot, "equipment slot must be named");
  });
});

const sharedSeed = deriveSharedCaseSeed("fixture-seed", 7, 13, "mp-pressure");
assert.equal(
  sharedSeed,
  deriveSharedCaseSeed("fixture-seed", 7, 13, "mp-pressure"),
  "the same case inputs must derive the same seed"
);
const sampleA = runEncounterSample({ buildId: "hybrid-fallback", encounterId: "mp-pressure", depth: 13, seed: sharedSeed });
const sampleB = runEncounterSample({ buildId: "hybrid-fallback", encounterId: "mp-pressure", depth: 13, seed: sharedSeed });
assert.deepEqual(sampleA, sampleB, "production combat sample must be deterministic");
assert.equal(sampleA.seed, sharedSeed, "the sample must retain the shared case seed");

const significantDifference = (estimate, significant = true) => ({
  estimate,
  ci95: estimate > 0 ? [0.1, estimate] : [estimate, -0.1],
  significant
});
const utilityOnlyReversalA = {
  pairedN: 500,
  outcomeDifference: significantDifference(0.4),
  utilityDifference: significantDifference(0.3)
};
const utilityOnlyReversalB = {
  pairedN: 500,
  outcomeDifference: significantDifference(0.2),
  utilityDifference: significantDifference(-0.3)
};
assert.equal(
  isSignificantReversal(utilityOnlyReversalA, utilityOnlyReversalB),
  false,
  "utility-only encounter reversal must not be significant"
);
const bothMetricsReversalB = {
  pairedN: 500,
  outcomeDifference: significantDifference(-0.2),
  utilityDifference: significantDifference(-0.3)
};
assert.equal(
  isSignificantReversal(utilityOnlyReversalA, bothMetricsReversalB),
  true,
  "outcome and utility encounter reversal must be significant"
);

const pureSynthetic = classifyCausalDeath({
  outcome: "death",
  directCause: "raw_damage",
  evidence: { actionEconomy: false },
  deathRound: 3
});
assert.equal(pureSynthetic.finalExclusiveCategory, "pure_raw_damage");
assert.equal(pureSynthetic.contributingCause, "pure_raw_damage");

const firingOnlySynthetic = classifyCausalDeath({
  outcome: "death",
  directCause: "raw_damage",
  evidence: { actionEconomy: false, spellDenial: false },
  deathRound: 3
});
assert.equal(
  firingOnlySynthetic.finalExclusiveCategory,
  "pure_raw_damage",
  "mechanic firing without state degradation must not become mediated"
);

const mediatedSynthetic = classifyCausalDeath({
  outcome: "death",
  directCause: "raw_damage",
  evidence: { spellDenial: true },
  deathRound: 3
});
assert.equal(mediatedSynthetic.finalExclusiveCategory, "mechanic_mediated_raw_lethal");
assert.equal(mediatedSynthetic.contributingCause, "spell_denial_chain");

const directMechanicSynthetic = classifyCausalDeath({
  outcome: "death",
  directCause: "reflection",
  evidence: { reflection: true },
  deathRound: 2
});
assert.equal(directMechanicSynthetic.finalExclusiveCategory, "direct_mechanic_death");
assert.equal(directMechanicSynthetic.contributingCause, "reflection");

const mixedSynthetic = classifyCausalDeath({
  outcome: "death",
  directCause: "raw_damage",
  evidence: { spellDenial: true, actionEconomy: true },
  deathRound: 4
});
assert.equal(mixedSynthetic.finalExclusiveCategory, "unknown_or_mixed");

const provenance = {
  sourceCommit: "source-commit",
  gameplaySourceCommit: "gameplay-commit",
  measurementRunnerCommit: "runner-commit",
  measurementRunnerDiffSha256: "runner-diff",
  originMainAncestor: true,
  staleTreeAllowed: false,
  workingTreeClean: true,
  baseRef: "origin/main",
  baseCommit: "base-commit"
};
const report = runMeasurement({ seed: "schema-seed", runs: 1, provenance });
assert.equal(report.schemaVersion, 6);
assert.equal(report.measurement.sourceCommit, "source-commit");
assert.equal(report.measurement.gameplaySourceCommit, "gameplay-commit");
assert.equal(report.measurement.originMainAncestor, true);
assert.equal(report.measurement.staleTreeAllowed, false);
assert.equal(report.measurement.workingTreeClean, true);
assert.equal(report.measurement.pairedRankingPolicy.bootstrapIterations, 2000);
assert.equal(report.measurement.configuration.runs, 1);
assert.deepEqual(report.measurement.configuration.depths, [8, 13, 18, 21, 25, 30]);
assert.equal(report.builds.length, 4);
assert.equal(report.encounters.length, 6);
assert.equal(report.cases.length, 144);
assert.equal(report.pairwiseRanking.length, 36);
assert.ok(Array.isArray(report.rawRankReversals));
assert.ok(Array.isArray(report.rankReversals));
assert.equal(report.redFlags.flags.length, 6);
assert.ok(Object.hasOwn(report.cases[0], "failureAttribution"));
assert.ok(Object.hasOwn(report.cases[0], "resourceSignature"));
assert.ok(Object.hasOwn(report.cases[0].mechanisms, "totals"));
assert.ok(Object.hasOwn(report.cases[0].mechanisms, "averagePerRun"));
assert.ok(Object.hasOwn(report.cases[0], "statusTrajectory"));
assert.ok(Object.hasOwn(report.cases[0].statusTrajectory, "roundsObservedPerRun"));
assert.ok(Object.hasOwn(report.cases[0].statusTrajectory, "incapacitatedRoundsPerRun"));
assert.ok(Object.hasOwn(report.cases[0], "mpStarvationRoundsPerRun"));
assert.ok(Object.hasOwn(report.cases[0], "causalAttribution"));
assert.ok(Object.hasOwn(report.cases[0].causalAttribution, "pureRawDamageDeaths"));
report.cases.forEach(testCase => {
  const attribution = testCase.causalAttribution;
  const finalTotal = Object.values(attribution.finalExclusiveCategoryCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(finalTotal, testCase.outcomes.death, "death runs must have one final exclusive category");
  const exclusiveTotal = Object.values(attribution.legacyRawExclusiveCategoryCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(exclusiveTotal, attribution.legacyRawDamageDeaths, "legacy raw exclusive categories must be exhaustive");
  (testCase.traces || []).forEach(run => {
    assert.ok([
      "pure_raw_damage",
      "mechanic_mediated_raw_lethal",
      "direct_mechanic_death",
      "unknown_or_mixed"
    ].includes(run.failure.finalExclusiveCategory), "every death trace has one exclusive category");
  });
});
const tracedDeathCase = report.cases.find(testCase => testCase.traces?.length > 0);
assert.ok(tracedDeathCase, "at least one death trace must be retained");
assert.ok(Object.hasOwn(tracedDeathCase.traces[0].trace[0], "damageEvents"));
assert.ok(Object.hasOwn(report, "causalSummary"));
assert.ok(Object.hasOwn(report, "fixtureValidation"));
assert.ok(Object.hasOwn(report, "autoActionReview"));
assert.equal(report.pairwiseRanking[0].rankings.at(-1).metric, "pairedOutcomeAndUtility");

console.log("[PASS] build definitions, fixture determinism, shared seeds, production combat determinism, provenance, status trajectory, and output schema verified");
