import assert from "node:assert/strict";
import {
  BALANCE_MEASUREMENT_MANIFEST_SCHEMA_VERSION,
  createMeasurementManifest,
  renderMeasurementManifestMarkdown
} from "../../measurements/measurement_manifest.js";

const validReport = {
  measurement: {
    schemaVersion: 1,
    runnerVersion: "standard-v1",
    profile: "standard-v1",
    comparisonKey: "0123456789abcdef",
    productionBaselineSha: "a".repeat(40),
    sourceCommit: "b".repeat(40),
    simulatorRunnerCommit: "c".repeat(40),
    simulatorRunnerDiffSha256: "d".repeat(64),
    originMainAncestor: true,
    staleTreeAllowed: false,
    workingTreeClean: true,
    seedPolicy: "deterministic",
    configuration: {
      seed: 843,
      runs: 500,
      calibrationRuns: 100,
      scenarioIds: ["workshop-empty"],
      targetDepths: [5]
    }
  },
  cases: [{ scenarioId: "workshop-empty", targetDepths: [5], depths: [{ depth: 5, runs: 500 }] }]
};

const metadata = {
  purpose: "after combat balance change",
  runType: "baseline-candidate",
  workflowRunId: "123456789",
  workflowRunUrl: "https://github.com/example/repo/actions/runs/123456789",
  repository: "example/repo",
  requestedRef: "main",
  measuredAt: "2026-08-26T06:00:00Z"
};

const valid = createMeasurementManifest({ measurementReport: validReport, ...metadata });
assert.equal(valid.schemaVersion, BALANCE_MEASUREMENT_MANIFEST_SCHEMA_VERSION);
assert.equal(valid.status, "valid");
assert.equal(valid.baselineCandidate, true);
assert.equal(valid.measurement.productionBaselineSha, "a".repeat(40));
assert.equal(valid.measurement.simulatorRunnerCommit, "c".repeat(40));
assert.equal(valid.measurement.originMainAncestor, true);
assert.equal(valid.measurement.staleTreeAllowed, false);
assert.equal(valid.measurement.workingTreeClean, true);
assert.equal(valid.measuredAt, "2026-08-26T06:00:00.000Z");
assert.match(renderMeasurementManifestMarkdown(valid), /workflow run: \[123456789\]/);

const classNames = ["Fighter", "Thief"];
const classReport = {
  ...validReport,
  measurement: {
    ...validReport.measurement,
    configuration: { ...validReport.measurement.configuration, classNames }
  },
  cases: [{
    scenarioId: "workshop-empty",
    targetDepths: [5],
    depths: [{
      depth: 5,
      runs: 500,
      metricsByClass: Object.fromEntries(classNames.map(className => [className, {}]))
    }]
  }]
};
const validClassReport = createMeasurementManifest({ measurementReport: classReport, ...metadata });
assert.equal(validClassReport.status, "valid");
assert.deepEqual(validClassReport.measurement.classNames, classNames);
assert.match(renderMeasurementManifestMarkdown(validClassReport), /classes: Fighter, Thief/);
const missingClass = createMeasurementManifest({
  measurementReport: {
    ...classReport,
    cases: [{ ...classReport.cases[0], depths: [{ ...classReport.cases[0].depths[0], metricsByClass: { Fighter: {} } }] }]
  },
  ...metadata
});
assert.equal(missingClass.status, "invalid");
assert.match(missingClass.invalidReasons.join("; "), /configured classes/);

const diagnostic = createMeasurementManifest({
  measurementReport: validReport,
  ...metadata,
  runType: "diagnostic"
});
assert.equal(diagnostic.status, "valid");
assert.equal(diagnostic.baselineCandidate, false);

const uncertain = createMeasurementManifest({
  measurementReport: validReport,
  ...metadata,
  purpose: "uncertain comparator follow-up"
});
assert.equal(uncertain.status, "valid");
assert.equal(uncertain.baselineCandidate, true);

const failed = createMeasurementManifest({
  measurementReport: validReport,
  ...metadata,
  measurementStepOutcome: "failure"
});
assert.equal(failed.status, "invalid");
assert.equal(failed.baselineCandidate, false);
assert.match(failed.invalidReasons.join("; "), /measurement step outcome was failure/);

const incomplete = createMeasurementManifest({
  measurementReport: null,
  measurementReadError: "ENOENT",
  ...metadata
});
assert.equal(incomplete.status, "invalid");
assert.equal(incomplete.baselineCandidate, false);
assert.match(incomplete.invalidReasons.join("; "), /unable to read measurement report/);

const incompleteProvenance = createMeasurementManifest({
  measurementReport: {
    ...validReport,
    measurement: { ...validReport.measurement, workingTreeClean: false }
  },
  ...metadata
});
assert.equal(incompleteProvenance.status, "invalid");
assert.match(incompleteProvenance.invalidReasons.join("; "), /workingTreeClean must be true/);

const partialReport = createMeasurementManifest({
  measurementReport: {
    ...validReport,
    measurement: {
      ...validReport.measurement,
      configuration: { ...validReport.measurement.configuration, targetDepths: [5, 10] }
    },
    cases: [{ scenarioId: "workshop-empty", targetDepths: [5, 10], depths: [{ depth: 5, runs: 500 }] }]
  },
  ...metadata
});
assert.equal(partialReport.status, "invalid");
assert.match(partialReport.invalidReasons.join("; "), /configured depths/);

const unexpectedRunCount = createMeasurementManifest({
  measurementReport: {
    ...validReport,
    cases: [{ scenarioId: "workshop-empty", targetDepths: [5], depths: [{ depth: 5, runs: 499 }] }]
  },
  ...metadata
});
assert.equal(unexpectedRunCount.status, "invalid");
assert.match(unexpectedRunCount.invalidReasons.join("; "), /unexpected run count/);

const missingPurpose = createMeasurementManifest({ measurementReport: validReport, ...metadata, purpose: "" });
assert.equal(missingPurpose.status, "invalid");
assert.equal(missingPurpose.baselineCandidate, false);

const invalidRunType = createMeasurementManifest({ measurementReport: validReport, ...metadata, runType: "baseline" });
assert.equal(invalidRunType.status, "invalid");
assert.equal(invalidRunType.baselineCandidate, false);

console.log("[PASS] measurement manifest validity, metadata, and baseline policy checks");
