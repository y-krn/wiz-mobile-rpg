import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { runMeasurement } from "../../measurements/issue990_partial_information_progression.js";

const report = runMeasurement({ seed: "issue990-phase2-regression", runs: 1 });
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
});

Object.values(report.arms).forEach(arm => Object.values(arm.byBuild).forEach(summary => {
  const categoryTotal = Object.values(summary.deathCategories).reduce((sum, count) => sum + count, 0);
  assert.equal(categoryTotal, summary.deaths,
    "death categories must be exclusive and exhaustive for non-clear runs");
}));
assert.ok(report.matchedComparison.commonSupport.familyComparisons.every(pair =>
  pair.status === "insufficient_sample" || pair.pairedN >= 30
));
assert.match(report.matchedComparison.commonSupport.rule, /outcome.*diagnostic utility.*N<30/);
assert.equal(report.references.issue993.mixedIntoPartial, false);

const changedFiles = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
assert.ok(changedFiles.every(file => file.startsWith("scratch/")),
  `Phase 2 must not edit production balance/source files: ${changedFiles.join(", ")}`);
assert.ok(fs.readFileSync("scratch/simulations/sim_depth_material_ev.js", "utf8")
  .includes("partial_information_exploration"));

console.log("Issue #990 Phase 2 regression checks passed");
