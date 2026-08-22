import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const fixture = JSON.parse(fs.readFileSync(
  "scratch/fixtures/issue-793-measurement-provenance.json",
  "utf8"
));
assert.equal(fixture.scope, "test-only");
assert.equal(fixture.productionBaseRef, "origin/main");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const childEnv = {
  ...process.env,
  SIM_SEED: "793",
  SIM_PROVENANCE_BASE_REF: fixture.baseRef,
  SIM_PROVENANCE_BASE_REF_REASON: fixture.id,
  SIM_PROVENANCE_TEST_FIXTURE: fixture.id,
  BLEEDING_MEASUREMENT_SIDE: "candidate",
  BLEEDING_SOURCE_CODE_SHA: sourceCommit,
  BLEEDING_RUNNER_COMMIT: sourceCommit,
  BLEEDING_SIM_N: "1",
  BLEEDING_CALIBRATION_N: "1"
};
delete childEnv.SIM_SKIP_PROVENANCE;
const result = spawnSync(
  process.execPath,
  ["scratch/sim_issue_793_bleeding.js"],
  {
    env: childEnv,
    encoding: "utf8"
  }
);
assert.equal(result.status, 0, result.stderr || result.stdout);

const measurement = JSON.parse(
  fs.readFileSync("scratch/results/issue-793-bleeding-measurement.json", "utf8")
);
assert.equal(measurement.measurementSide, "candidate");
assert.equal(measurement.sourceCommit, sourceCommit);
assert.equal(measurement.provenanceBaseRef, fixture.baseRef);
assert.equal(measurement.provenanceBaseCommit, sourceCommit);
assert.equal(measurement.provenanceBaseRefReason, fixture.id);
assert.equal(measurement.provenanceTestFixture, fixture.id);
assert.equal(measurement.originMainAncestor, true);
assert.equal(measurement.staleTreeAllowed, false);
assert.ok(measurement.cases.length >= 4);
measurement.cases.forEach(testCase => {
  assert.equal(testCase.measurement.sourceCommit, sourceCommit);
  assert.equal(testCase.measurement.provenanceBaseRef, fixture.baseRef);
  assert.equal(testCase.measurement.provenanceBaseCommit, sourceCommit);
  assert.equal(testCase.measurement.provenanceBaseRefReason, fixture.id);
  assert.equal(testCase.measurement.provenanceTestFixture, fixture.id);
  assert.equal(testCase.measurement.originMainAncestor, true);
  assert.equal(testCase.measurement.staleTreeAllowed, false);
  assert.ok(testCase.metrics.buildSelection);
  assert.ok(Number.isFinite(testCase.metrics.buildSelection.finalCombatBuildScore.mean));
});
const forced = measurement.cases.find(caseEntry => caseEntry.label.includes("forced-producer/payoff-1"));
assert.equal(forced.metrics.buildSelection.producerMode, "forced-calibration-bypasses-natural-source-selection");
assert.equal(forced.metrics.buildSelection.naturalSourceSelection, "unexecuted/omitted");

const missingRef = spawnSync(
  process.execPath,
  ["scratch/sim_issue_793_bleeding.js"],
  {
    env: { ...childEnv, SIM_PROVENANCE_BASE_REF: "refs/remotes/origin/missing" },
    encoding: "utf8"
  }
);
assert.notEqual(missingRef.status, 0);
assert.match(
  `${missingRef.stderr}\n${missingRef.stdout}`,
  /measurement provenance failed: git rev-parse --verify/
);

console.log("issue-793 measurement provenance/build metrics: PASS");
