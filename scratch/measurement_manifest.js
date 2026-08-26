// sim-scope: infra — validate and record the operational metadata for a standard measurement run
/* global process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BALANCE_MEASUREMENT_RUNNER_VERSION,
  BALANCE_MEASUREMENT_SCHEMA_VERSION
} from "./balance_measurement.js";

export const BALANCE_MEASUREMENT_MANIFEST_SCHEMA_VERSION = 1;
export const MEASUREMENT_RUN_TYPES = Object.freeze([
  "baseline-candidate",
  "diagnostic",
  "temporary"
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredString(value, name, errors) {
  if (!isNonEmptyString(value)) errors.push(`${name} is missing`);
}

function validateMeasurementReport(report) {
  const errors = [];
  const measurement = report?.measurement;

  if (!measurement || typeof measurement !== "object") {
    return ["measurement record is missing"];
  }
  if (measurement.schemaVersion !== BALANCE_MEASUREMENT_SCHEMA_VERSION) {
    errors.push(`measurement schema version must be ${BALANCE_MEASUREMENT_SCHEMA_VERSION}`);
  }
  if (measurement.runnerVersion !== BALANCE_MEASUREMENT_RUNNER_VERSION) {
    errors.push(`measurement runner must be ${BALANCE_MEASUREMENT_RUNNER_VERSION}`);
  }
  for (const [field, value] of Object.entries({
    comparisonKey: measurement.comparisonKey,
    productionBaselineSha: measurement.productionBaselineSha,
    sourceCommit: measurement.sourceCommit,
    simulatorRunnerCommit: measurement.simulatorRunnerCommit
  })) {
    requiredString(value, `measurement.${field}`, errors);
  }
  for (const field of ["productionBaselineSha", "sourceCommit", "simulatorRunnerCommit"]) {
    if (isNonEmptyString(measurement[field]) && !SHA_PATTERN.test(measurement[field])) {
      errors.push(`measurement.${field} must be a 40-character commit SHA`);
    }
  }
  if (measurement.originMainAncestor !== true) {
    errors.push("measurement.originMainAncestor must be true");
  }
  if (measurement.staleTreeAllowed !== false) {
    errors.push("measurement.staleTreeAllowed must be false");
  }
  if (measurement.workingTreeClean !== true) {
    errors.push("measurement.workingTreeClean must be true");
  }

  const configuration = measurement.configuration;
  if (!configuration || typeof configuration !== "object") {
    errors.push("measurement.configuration is missing");
  } else {
    if (!Number.isInteger(configuration.runs) || configuration.runs < 500) {
      errors.push("measurement.configuration.runs must be at least 500");
    }
    if (!Number.isInteger(configuration.seed) || configuration.seed < 1) {
      errors.push("measurement.configuration.seed must be a positive integer");
    }
    if (!Array.isArray(configuration.scenarioIds) || configuration.scenarioIds.length === 0) {
      errors.push("measurement.configuration.scenarioIds is missing");
    }
    if (!Array.isArray(configuration.targetDepths) || configuration.targetDepths.length === 0) {
      errors.push("measurement.configuration.targetDepths is missing");
    }
  }

  if (!Array.isArray(report.cases) || report.cases.length === 0) {
    errors.push("measurement cases are missing");
  } else {
    report.cases.forEach((testCase, index) => {
      if (!isNonEmptyString(testCase?.scenarioId)) {
        errors.push(`measurement case ${index} has no scenarioId`);
      }
      if (!Array.isArray(testCase?.depths) || testCase.depths.length === 0) {
        errors.push(`measurement case ${index} has no depth results`);
      }
    });
  }
  return errors;
}

function copyMeasurementIdentity(measurement) {
  if (!measurement) return null;
  return {
    schemaVersion: measurement.schemaVersion,
    runnerVersion: measurement.runnerVersion,
    profile: measurement.profile,
    comparisonKey: measurement.comparisonKey,
    productionBaselineSha: measurement.productionBaselineSha,
    sourceCommit: measurement.sourceCommit,
    simulatorRunnerCommit: measurement.simulatorRunnerCommit,
    simulatorRunnerDiffSha256: measurement.simulatorRunnerDiffSha256,
    seed: measurement.configuration?.seed,
    runs: measurement.configuration?.runs,
    calibrationRuns: measurement.configuration?.calibrationRuns,
    seedPolicy: measurement.seedPolicy
  };
}

function normalizeTimestamp(value) {
  if (isNonEmptyString(value) && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

export function createMeasurementManifest({
  measurementReport = null,
  purpose = "",
  runType = "baseline-candidate",
  workflowRunId = "",
  workflowRunUrl = "",
  repository = "",
  requestedRef = "main",
  runAttempt = "",
  measuredAt = "",
  measurementStepOutcome = "success",
  measurementReadError = null
} = {}) {
  const reportErrors = measurementReadError
    ? [`unable to read measurement report: ${measurementReadError}`]
    : validateMeasurementReport(measurementReport);
  const metadataErrors = [];
  requiredString(purpose, "purpose", metadataErrors);
  requiredString(workflowRunId, "workflow.runId", metadataErrors);
  requiredString(workflowRunUrl, "workflow.url", metadataErrors);
  requiredString(repository, "workflow.repository", metadataErrors);
  requiredString(requestedRef, "requestedRef", metadataErrors);
  if (measurementStepOutcome !== "success") {
    metadataErrors.push(`measurement step outcome was ${measurementStepOutcome}`);
  }

  const normalizedRunType = MEASUREMENT_RUN_TYPES.includes(runType) ? runType : "invalid";
  if (normalizedRunType === "invalid") metadataErrors.push(`runType is invalid: ${runType}`);
  const errors = [...reportErrors, ...metadataErrors];
  const status = errors.length === 0 ? "valid" : "invalid";
  return {
    schemaVersion: BALANCE_MEASUREMENT_MANIFEST_SCHEMA_VERSION,
    status,
    baselineCandidate: status === "valid" && normalizedRunType === "baseline-candidate",
    invalidReasons: errors,
    purpose: String(purpose || ""),
    runType: normalizedRunType,
    measuredAt: normalizeTimestamp(measuredAt),
    requestedRef: String(requestedRef || ""),
    workflow: {
      repository: String(repository || ""),
      runId: String(workflowRunId || ""),
      runAttempt: String(runAttempt || ""),
      url: String(workflowRunUrl || ""),
      successfulRunRequiredForBaseline: true
    },
    measurement: copyMeasurementIdentity(measurementReport?.measurement),
    storage: {
      historyKey: `${repository || "repository"}/actions/runs/${workflowRunId || "unknown"}`,
      rawData: "GitHub Actions artifact; short-lived and not committed",
      manifest: "GitHub Actions Job Summary and manifest artifact"
    }
  };
}

export function renderMeasurementManifestMarkdown(manifest) {
  const measurement = manifest.measurement;
  const lines = [
    `## Balance measurement run (${manifest.status})`,
    "",
    `- purpose: ${manifest.purpose || "(missing)"}`,
    `- run type: ${manifest.runType}`,
    `- baseline candidate: ${manifest.baselineCandidate ? "yes" : "no"}`,
    `- measured at: ${manifest.measuredAt}`,
    `- requested ref: \`${manifest.requestedRef || "(missing)"}\``,
    `- workflow run: [${manifest.workflow.runId || "(missing)"}](${manifest.workflow.url || "#"})`,
    `- configuration key: \`${measurement?.comparisonKey || "(missing)"}\``,
    `- production baseline SHA: \`${measurement?.productionBaselineSha || "(missing)"}\``,
    `- simulator runner SHA: \`${measurement?.simulatorRunnerCommit || "(missing)"}\``,
    `- seed / runs: ${measurement?.seed ?? "(missing)"} / ${measurement?.runs ?? "(missing)"}`,
    ""
  ];
  if (manifest.invalidReasons.length > 0) {
    lines.push("### Invalid reasons", "", ...manifest.invalidReasons.map(reason => `- ${reason}`), "");
  }
  lines.push(
    "The workflow run and this manifest identify the durable record. Raw measurement data remains a short-lived artifact.",
    ""
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--measurement" || value === "--output" || value === "--summary") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a path`);
      options[value.slice(2)] = next;
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurement_manifest.js --output /tmp/manifest.json [--measurement /tmp/measurement.json] [--summary /tmp/manifest.md]");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output) throw new Error("--output is required");
  return options;
}

function readMeasurement(path) {
  try {
    return { report: JSON.parse(fs.readFileSync(path, "utf8")), error: null };
  } catch (error) {
    return { report: null, error: error.message };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const read = options.measurement ? readMeasurement(resolve(options.measurement)) : {
    report: null,
    error: "measurement path was not supplied"
  };
  const manifest = createMeasurementManifest({
    measurementReport: read.report,
    measurementReadError: read.error,
    purpose: process.env.MEASUREMENT_PURPOSE,
    runType: process.env.MEASUREMENT_RUN_TYPE,
    workflowRunId: process.env.MEASUREMENT_WORKFLOW_RUN_ID,
    workflowRunUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL,
    repository: process.env.MEASUREMENT_REPOSITORY,
    requestedRef: process.env.MEASUREMENT_REQUESTED_REF,
    runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT,
    measuredAt: process.env.MEASUREMENT_AT,
    measurementStepOutcome: process.env.MEASUREMENT_STEP_OUTCOME || "success"
  });
  const outputPath = resolve(options.output);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (options.summary) {
    const summaryPath = resolve(options.summary);
    fs.mkdirSync(dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, renderMeasurementManifestMarkdown(manifest));
  }
  console.log(`Wrote measurement manifest (${manifest.status}): ${outputPath}`);
}
