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
import { COUNTERFACTUALS, runDecomposition } from "../../measurements/issue984_pure_raw_decomposition.js";
import { COUNTERFACTUALS as PRODUCTION_COUNTERFACTUALS, isStrictSignificantReversal, MIN_STRICT_PAIRED_N, runMeasurement as runProductionFrequencyMeasurement } from "../../measurements/issue987_production_frequency.js";
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
const c1 = COUNTERFACTUALS.find(condition => condition.id === "C1_multi_enemy_to_single");
const c2 = COUNTERFACTUALS.find(condition => condition.id === "C2_disable_multi_action_extra");
const w3 = PRODUCTION_COUNTERFACTUALS.find(condition => condition.id === "W3_enemy_action_exposure_1");
assert.equal(c1.kind, "multi_enemy_to_single");
assert.equal(createEncounterFixture("swarm-action-pressure", 13, c1).monsters.length, 1);
assert.match(c1.id, /multi_enemy_to_single/);
assert.doesNotMatch(c1.id, /enemy_count_only/);
const c2Baseline = runEncounterSample({
  buildId: "single-efficient",
  encounterId: "swarm-action-pressure",
  depth: 8,
  seed: "c2-test"
});
const c2Sample = runEncounterSample({
  buildId: "single-efficient",
  encounterId: "swarm-action-pressure",
  depth: 8,
  seed: "c2-test",
  counterfactual: c2
});
assert.ok(
  c2Baseline.trace.some(round => round.enemyTurnEvents.some(event => event.extraMultiAction)),
  "baseline must reach a multiAction extra turn for the C2 control"
);
assert.ok(
  c2Sample.trace.every(round => round.enemyTurnEvents.every(event => !event.extraMultiAction)),
  "C2 must suppress only multiAction extra turns"
);
assert.equal(
  c2Sample.trace[0].enemyTurnEvents.filter(event => !event.extraMultiAction).length,
  3,
  "C2 must retain one ordinary action for each of three living enemies"
);
assert.equal(c2.kind, "disable_multi_action_extra");
assert.notEqual(
  createEncounterFixture("durable-single-target", 13, { kind: "enemy_hp", rate: 0.5 }).monsters[0].maxHp,
  createEncounterFixture("durable-single-target", 13).monsters[0].maxHp
);
const generatedStressMonsters = createEncounterFixture("swarm-action-pressure", 8).monsters;
const w3Baseline = runEncounterSample({ buildId: "single-efficient", encounterId: "generated-stress", depth: 8, seed: "w3-test", generatedMonsters: generatedStressMonsters });
const w3Sample = runEncounterSample({ buildId: "single-efficient", encounterId: "generated-stress", depth: 8, seed: "w3-test", counterfactual: w3, generatedMonsters: generatedStressMonsters });
assert.ok(w3Baseline.trace.some(round => round.enemyTurnEvents.length > 1), "W3 baseline must expose multiple ordinary enemy turns");
assert.ok(w3Sample.trace.every(round => round.enemyTurnEvents.length <= 1), "W3 must cap total enemy turns per round");
assert.deepEqual(
  w3Sample.fixture.scaledStats.map(monster => ({ name: monster.name, traits: monster.traits })),
  w3Baseline.fixture.scaledStats.map(monster => ({ name: monster.name, traits: monster.traits })),
  "W3 must preserve generated monster identity and traits"
);

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
const strictSyntheticPair = (clear, utility, pairedRuns = 500) => ({
  pairedRuns,
  clearDifferences: Array(pairedRuns).fill(clear),
  hpDifferences: [],
  mpDifferences: [],
  utilityDifferences: Array(pairedRuns).fill(utility),
  baselinePureRawDeaths: 0,
  candidatePureRawDeaths: 0,
  pureRawDeathsAvoided: 0,
  dimensions: {}
});
assert.equal(
  isStrictSignificantReversal(strictSyntheticPair(0.4, 0.3), strictSyntheticPair(0.2, -0.3)),
  false,
  "clear-only reversal must not be strict when outcome does not reverse"
);
assert.equal(
  isStrictSignificantReversal(strictSyntheticPair(0.4, 0.3), strictSyntheticPair(-0.2, -0.3)),
  true,
  "strict reversal requires significant outcome and utility sign reversals"
);
assert.equal(
  isStrictSignificantReversal(strictSyntheticPair(0.4, 0.3, MIN_STRICT_PAIRED_N - 1), strictSyntheticPair(-0.2, -0.3)),
  false,
  "insufficient paired family samples must not be strict"
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
assert.equal(report.schemaVersion, 7);
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

const decomposition = runDecomposition({ seed: "issue984-unit", runs: 1 });
assert.deepEqual(
  decomposition.conditions.map(condition => condition.id),
  COUNTERFACTUALS.map(condition => condition.id)
);
assert.equal(decomposition.conditions.find(condition => condition.id === "baseline").cases.length, 144);
decomposition.conditions.filter(condition => condition.id !== "baseline").forEach(condition => {
  assert.equal(condition.paired.pairedRuns, 144);
  assert.equal(condition.cases[0].pureRawMetrics.sampleCount, condition.cases[0].pureRawDamageDeaths);
});
const measuredCell = decomposition.conditions[0].cases[0];
assert.ok(Object.hasOwn(measuredCell.pureRawMetrics, "lethalHitDamage"));
assert.ok(Object.hasOwn(measuredCell.pureRawMetrics, "enemyActionsPerRound"));
assert.ok(Object.hasOwn(measuredCell.pureRawMetrics, "enemyHpRemovalSpeed"));
assert.equal(decomposition.productionEncounterDistribution.length, 6);

const productionFrequency = runProductionFrequencyMeasurement({ seed: "issue987-unit", generatedRuns: 1, stressRuns: 1 });
assert.deepEqual(productionFrequency.measurement.configuration.depths, [8, 13, 18, 21, 25, 30]);
assert.equal(productionFrequency.productionFrequencyWeighted.distributions.every(item => item.runs === 1), true);
assert.equal(productionFrequency.productionFrequencyWeighted.conditions[0].buildSensitivity.pairwiseOverall.length, 6);
const productionBaseline = productionFrequency.productionFrequencyWeighted.conditions.find(condition => condition.id === "baseline");
const productionW1 = productionFrequency.productionFrequencyWeighted.conditions.find(condition => condition.id === "W1_normal_damage_075");
const overallView = condition => condition.views.find(view => Object.keys(view.dimensions).length === 0);
const w1Pair = productionW1.pairedAgainstBaseline.find(pair => Object.keys(pair.dimensions).length === 0);
assert.ok(Math.abs(w1Pair.clearRateDelta.estimate - (overallView(productionW1).clearRate - overallView(productionBaseline).clearRate)) < 1e-12);
assert.equal(Object.hasOwn(w1Pair, "clearRateDifference"), false, "counterfactual delta direction must be explicit");
const sensitivity = productionBaseline.buildSensitivity;
assert.ok(sensitivity.equalCellCoverage, "equal-cell coverage must be reported separately");
assert.ok(sensitivity.productionFrequencyWeightedDominance, "frequency-weighted dominance must be reported separately");
assert.notEqual(sensitivity.equalCellCoverage.weighting, sensitivity.productionFrequencyWeightedDominance.weighting);
assert.ok(Math.abs(Object.values(sensitivity.productionFrequencyWeightedDominance.shares).reduce((sum, share) => sum + share, 0) - 1) < 1e-12);
productionFrequency.productionFrequencyWeighted.conditions.forEach(condition => {
  condition.views.forEach(view => {
    const deathTotal = Object.values(view.exclusiveDeathCategories).reduce((sum, count) => sum + count, 0);
    assert.equal(deathTotal, view.outcomes.death, "production weighted death categories must be exclusive");
    const rawTotal = Object.values(view.legacyRawExclusiveCategories).reduce((sum, count) => sum + count, 0);
    assert.equal(rawTotal, view.legacyRawDamageDeaths, "production weighted raw categories must be exhaustive");
  });
});

console.log("[PASS] build definitions, fixture determinism, shared seeds, production combat determinism, provenance, status trajectory, and output schema verified");
