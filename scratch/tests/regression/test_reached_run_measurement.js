import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BUILD_IDS } from "../../measurements/issue973_build_sensitivity.js";
import { runMeasurement } from "../../measurements/issue990_reached_run.js";

const runnerSource = readFileSync(new URL("../../measurements/issue990_reached_run.js", import.meta.url), "utf8");
for (const requiredCall of ["generateRunFloor", "generateEncounter", "calculateEncounterChance", "runEncounterSample"]) {
  assert.match(runnerSource, new RegExp(requiredCall), `${requiredCall} must remain production-backed`);
}

const report = runMeasurement({ seed: "issue990-regression", runs: 1 });
assert.deepEqual(report.measurement.configuration.builds, [...BUILD_IDS]);
assert.equal(report.measurement.configuration.startedRunsPerBuild, 1);
assert.equal(report.references.generatedFrequency.bestBuildShare.dominantBuild, "sustain");
assert.equal(report.matchedCommonSupport.minimumPairedN, 30);

const firstRuns = BUILD_IDS.map(buildId => report.runRecords[buildId][0]);
assert.ok(firstRuns.every(run => Number.isInteger(run.eventCount)), "each build must retain event count records");
assert.ok(report.matchedCommonSupport.buildPairs.some(pair => pair.commonSupportPairedN > 0), "shared seed must produce common-support encounters");

for (const buildId of BUILD_IDS) {
  const result = report.actualReachedRun[buildId];
  assert.equal(result.allRuns.startedRuns, 1);
  assert.ok(result.allRuns.reachedDepth["1"].reached === 1);
  assert.ok(Object.hasOwn(result.reachedRunPopulations, "B30"));
  assert.ok(Array.isArray(result.allRuns.deathWindows));
}

console.log("issue-990 reached-run production path and survivor-bias schema: PASS");

