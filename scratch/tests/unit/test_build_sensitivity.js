import assert from "node:assert/strict";
import {
  createEncounterFixture,
  deriveSharedCaseSeed,
  getBuildDefinitions,
  isSignificantReversal,
  runEncounterSample,
  runMeasurement
} from "../../measurements/issue973_build_sensitivity.js";
import { CORE_AFFIXES, SUPPORT_AFFIXES } from "../../../src/data/affixes.js";
import { ITEMS } from "../../../src/data/items.js";
import { SPELLS } from "../../../src/data/spells.js";
import { getDepthScaling, scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";

const coreIds = new Set(CORE_AFFIXES.map(affix => affix.id));
const supportIds = new Set(SUPPORT_AFFIXES.map(affix => affix.id));

const scalingProbe = { name: "scaling probe", hp: 100, atk: 20, def: 10, exp: 100 };
const b8Probe = scaleEnemyForDepth(scalingProbe, 8);
const b13Probe = scaleEnemyForDepth(scalingProbe, 13);
const b18Probe = scaleEnemyForDepth(scalingProbe, 18);
assert.equal(
  b13Probe.maxHp,
  b18Probe.maxHp,
  "B11+ HP scaling should use the B10 ceiling"
);
assert.ok(
  b18Probe.atk > b13Probe.atk,
  "B13 and B18 must retain distinct ATK pressure"
);
assert.equal(
  b8Probe.maxHp,
  Math.round(scalingProbe.hp * getDepthScaling(8).enemy),
  "the deep-band HP tuning must not change B8"
);

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
assert.equal(report.schemaVersion, 5);
assert.equal(report.measurement.sourceCommit, "source-commit");
assert.equal(report.measurement.gameplaySourceCommit, "gameplay-commit");
assert.equal(report.measurement.originMainAncestor, true);
assert.equal(report.measurement.staleTreeAllowed, false);
assert.equal(report.measurement.workingTreeClean, true);
assert.equal(report.measurement.pairedRankingPolicy.bootstrapIterations, 2000);
assert.equal(report.measurement.configuration.runs, 1);
assert.deepEqual(report.measurement.configuration.depths, [8, 13, 18]);
assert.equal(report.builds.length, 4);
assert.equal(report.encounters.length, 6);
assert.equal(report.cases.length, 72);
assert.equal(report.pairwiseRanking.length, 18);
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
assert.equal(report.pairwiseRanking[0].rankings.at(-1).metric, "pairedOutcomeAndUtility");

console.log("[PASS] build definitions, fixture determinism, shared seeds, production combat determinism, provenance, status trajectory, and output schema verified");
