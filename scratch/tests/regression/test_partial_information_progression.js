import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  getPartialSecretDoorPlan,
  canTraverseKnownRouteEdge
} from "../../simulations/sim_depth_material_ev.js";
import {
  createBuildCharacter,
  BUILD_IDS
} from "../../measurements/issue973_build_sensitivity.js";
import {
  describe,
  percentile,
  runMeasurement
} from "../../measurements/issue990_partial_information_progression.js";
import { getCharDef, getCharMaxHp, getCharMaxMp, getCharWeaponAtk } from "../../../src/data.js";

const report = runMeasurement({ seed: "issue990-phase2-regression", runs: 1 });
assert.equal(report.schemaVersion, 2);
assert.match(report.measurement.runnerVersion, /-v2$/);

const oddPercentiles = describe([1, 2, 3, 4, 5]);
assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
assert.equal(oddPercentiles.p50, 3);
assert.equal(oddPercentiles.p90, 4.6);
assert.notEqual(oddPercentiles.p90, oddPercentiles.max,
  "p90 must not fall back to max for a fractional percentile index");
assert.equal(oddPercentiles.min, 1);
assert.equal(oddPercentiles.max, 5);
const evenPercentiles = describe([1, 2, 3, 4]);
assert.equal(evenPercentiles.p50, 2.5);
assert.equal(evenPercentiles.p90, 3.7);
const armIds = Object.keys(report.arms);
assert.deepEqual(armIds, ["oracle-fixed", "partial-info-fixed", "partial-info-equipment-update"]);
assert.equal(report.measurement.configuration.builds.length, 4);
assert.equal(report.measurement.configuration.runs, 1);
assert.deepEqual(report.audit.hiddenInformationAssertions, {
  hiddenStairsUsed: false,
  hiddenBossUsed: false,
  hiddenSecretDoorUsed: false,
  futureEncounterInfoUsed: false
});

const buildIds = report.measurement.configuration.builds;
buildIds.forEach(buildId => {
  const oracleRows = report.raw["oracle-fixed"][buildId];
  const partialRows = report.raw["partial-info-fixed"][buildId];
  const updateRows = report.raw["partial-info-equipment-update"][buildId];
  assert.equal(oracleRows[0].routePolicy, "omniscient_shortest_route");
  assert.equal(partialRows[0].routePolicy, "partial_information_exploration");
  assert.equal(partialRows[0].equipmentUpdatePolicy, "fixed");
  assert.equal(updateRows[0].equipmentUpdatePolicy, "deterministic_greedy");
  assert.equal(oracleRows[0].worldSeed, partialRows[0].worldSeed);
  assert.equal(partialRows[0].worldSeed, updateRows[0].worldSeed);
  assert.deepEqual(partialRows[0].audit, {
    hiddenStairsUsed: false,
    hiddenBossUsed: false,
    hiddenSecretDoorUsed: false,
    futureEncounterInfoUsed: false
  });
  assert.equal(partialRows[0].encounterIdentities.length >= 0, true);
  assert.equal(partialRows[0].startingBuildSnapshot.spells.length > 0, true);
  const expected = createBuildCharacter(buildId);
  const actual = partialRows[0].startingBuildSnapshot;
  assert.deepEqual(actual.spells, expected.spells, `${buildId}: starting spells`);
  assert.equal(actual.hp, expected.hp, `${buildId}: starting HP`);
  assert.equal(actual.maxHp, getCharMaxHp(expected), `${buildId}: derived max HP`);
  assert.equal(actual.mp, expected.mp, `${buildId}: starting MP`);
  assert.equal(actual.maxMp, getCharMaxMp(expected), `${buildId}: derived max MP`);
  assert.equal(actual.atk, getCharWeaponAtk(expected), `${buildId}: derived ATK`);
  assert.equal(actual.def, getCharDef(expected), `${buildId}: derived DEF`);
  assert.deepEqual(
    actual.coreIds,
    [...new Set(Object.values(expected.equipment).flatMap(item =>
      item.affixes.filter(affix => affix.kind === "core").map(affix => affix.id)
    ))],
    `${buildId}: starting cores`
  );
});

const secretDecisionSource = getPartialSecretDoorPlan.toString();
assert.doesNotMatch(secretDecisionSource, /secretDoor|secretFound/,
  "partial secret search decision must not inspect hidden door state");
const searchRoute = {
  current: { x: 2, y: 2 },
  secretSearchDirectionByCell: new Map(),
  searchedSecretDoorKeys: new Set()
};
assert.deepEqual(getPartialSecretDoorPlan(searchRoute), {
  source: { x: 2, y: 2 }, room: { x: 2, y: 1 }, direction: 0, key: "2,2>2,1"
});
const hiddenDoorGrid = [[
  { walls: [false, true, true, true], blockEnter: [false, false, false, false], secretDoor: { 1: true } },
  { walls: [true, true, true, true], blockEnter: [false, false, false, false] }
]];
const hiddenDoorRoute = { knownCellKeys: new Set(["0,0"]), revealedSecretDoorKeys: new Set() };
assert.equal(canTraverseKnownRouteEdge({ grid: hiddenDoorGrid }, hiddenDoorRoute, { x: 0, y: 0 }, { dx: 1, dy: 0, dir: 1 }), false,
  "unsearched secret edge remains blocked");
hiddenDoorRoute.revealedSecretDoorKeys.add("0,0>1,0");
assert.equal(canTraverseKnownRouteEdge({ grid: hiddenDoorGrid }, hiddenDoorRoute, { x: 0, y: 0 }, { dx: 1, dy: 0, dir: 1 }), true,
  "secret edge opens only after revealed key is recorded");

Object.values(report.arms).forEach(arm => Object.values(arm.byBuild).forEach(summary => {
  const categoryTotal = Object.values(summary.deathCategories).reduce((sum, count) => sum + count, 0);
  assert.equal(categoryTotal, summary.deaths,
    "death categories must be exclusive and exhaustive for non-clear runs");
}));
assert.ok(report.matchedComparison.commonSupport.familyComparisons.every(pair =>
  pair.status === "insufficient_sample" || pair.pairedN >= 30
));
assert.match(report.matchedComparison.commonSupport.rule, /outcome.*diagnostic utility.*N<30/);
assert.match(report.matchedComparison.commonSupport.rule, /eventKey.*enemy composition/);
report.matchedComparison.commonSupport.familyComparisons.forEach(pair => {
  assert.ok(pair.pairedN >= 0);
});
const eventRecord = report.raw["partial-info-fixed"][buildIds[0]][0].encounterIdentities[0];
if (eventRecord) {
  assert.ok(eventRecord.eventKey);
  assert.ok(eventRecord.enemyCompositionKey);
  assert.ok(["clear", "death", "flee"].includes(eventRecord.outcome));
  assert.ok(Number.isFinite(eventRecord.hpAfter));
  assert.ok(Number.isFinite(eventRecord.mpAfter));
  assert.ok(Number.isFinite(eventRecord.rounds));
  assert.ok(Number.isFinite(eventRecord.diagnosticUtility));
}
assert.equal(report.references.issue993.mixedIntoPartial, false);

for (const buildId of buildIds) {
  const oracle = report.arms["oracle-fixed"].byBuild[buildId];
  const partial = report.arms["partial-info-fixed"].byBuild[buildId];
  assert.equal(
    report.comparison.oracleVsPartial[buildId].reachedDepthDelta,
    partial.reachedDepth.mean - oracle.reachedDepth.mean
  );
  assert.equal(
    report.comparison.oracleVsPartial[buildId].encountersPerFloorDelta,
    partial.encountersPerFloor.mean - oracle.encountersPerFloor.mean
  );
}

const changedFiles = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
const phase2FilesChanged = changedFiles.some(file =>
  file === "scratch/measurements/issue990_partial_information_progression.js" ||
  file === "evidence/results/issue-990-phase2.json" ||
  file === "evidence/results/issue-990-phase2.md"
);
if (phase2FilesChanged) {
  assert.ok(changedFiles.every(file => file.startsWith("scratch/") || file === "evidence/results/issue-990-phase2.json" || file === "evidence/results/issue-990-phase2.md"),
    `Phase 2 must not edit production balance/source files: ${changedFiles.join(", ")}`);
}
assert.ok(fs.readFileSync("scratch/simulations/sim_depth_material_ev.js", "utf8")
  .includes("partial_information_exploration"));
if (phase2FilesChanged) {
  assert.ok(changedFiles.every(file => !file.startsWith("src/")),
    "production source/balance constants must remain untouched");
}

const repeat = runMeasurement({ seed: "issue990-phase2-regression", runs: 1 });
assert.deepEqual(repeat.raw, report.raw, "same world seed reproduces exploration and search");

console.log("Issue #990 Phase 2 regression checks passed");
