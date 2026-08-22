import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const sourceCommit = "ecac8c2deabb984802bab7d28a407475cd529e97";
const result = spawnSync(
  process.execPath,
  ["scratch/sim_issue_793_bleeding.js"],
  {
    env: {
      ...process.env,
      SIM_SEED: "793",
      BLEEDING_MEASUREMENT_SIDE: "candidate",
      BLEEDING_SOURCE_CODE_SHA: sourceCommit,
      BLEEDING_RUNNER_COMMIT: sourceCommit,
      BLEEDING_SIM_N: "1",
      BLEEDING_CALIBRATION_N: "1"
    },
    encoding: "utf8"
  }
);
assert.equal(result.status, 0, result.stderr || result.stdout);

const measurement = JSON.parse(
  fs.readFileSync("scratch/results/issue-793-bleeding-measurement.json", "utf8")
);
assert.equal(measurement.measurementSide, "candidate");
assert.equal(measurement.sourceCommit, sourceCommit);
assert.equal(measurement.originMainAncestor, true);
assert.equal(measurement.staleTreeAllowed, false);
assert.ok(measurement.cases.length >= 4);
measurement.cases.forEach(testCase => {
  assert.equal(testCase.measurement.sourceCommit, sourceCommit);
  assert.equal(testCase.measurement.originMainAncestor, true);
  assert.equal(testCase.measurement.staleTreeAllowed, false);
  assert.ok(testCase.metrics.buildSelection);
  assert.ok(Number.isFinite(testCase.metrics.buildSelection.finalCombatBuildScore.mean));
});
const forced = measurement.cases.find(caseEntry => caseEntry.label.includes("forced-producer/payoff-1"));
assert.equal(forced.metrics.buildSelection.producerMode, "forced-calibration-bypasses-natural-source-selection");
assert.equal(forced.metrics.buildSelection.naturalSourceSelection, "unexecuted/omitted");

console.log("issue-793 measurement provenance/build metrics: PASS");
