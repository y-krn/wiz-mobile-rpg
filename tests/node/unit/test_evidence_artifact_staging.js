import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  EVIDENCE_ARTIFACT_RETENTION_DAYS,
  createEvidenceArtifactName,
  stageEvidence
} from "../../../scripts/stage_evidence_artifact.js";

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "evidence-artifact-test-"));

function createInputs() {
  const inputRoot = path.join(fixtureRoot, `input-${Date.now()}-${Math.random()}`);
  mkdirSync(inputRoot, { recursive: true });
  const visualRoot = path.join(inputRoot, "visual");
  mkdirSync(visualRoot);
  const playwrightVisualRoot = path.join(inputRoot, "output", "playwright");
  mkdirSync(playwrightVisualRoot, { recursive: true });
  const diagnosticsRoot = path.join(inputRoot, "diagnostics");
  mkdirSync(diagnosticsRoot);
  writeFileSync(path.join(inputRoot, "summary.md"), "# summary\n");
  writeFileSync(path.join(inputRoot, "manifest.json"), JSON.stringify({ seed: 42, status: "valid" }));
  writeFileSync(path.join(inputRoot, "raw.json"), JSON.stringify({ generated: true }));
  writeFileSync(path.join(visualRoot, "capture.png"), Buffer.from("png-fixture"));
  writeFileSync(path.join(playwrightVisualRoot, "browser-capture.png"), Buffer.from("playwright-png-fixture"));
  writeFileSync(path.join(diagnosticsRoot, "failure.log"), "diagnostic output\n");
  return {
    inputRoot,
    summary: path.join(inputRoot, "summary.md"),
    provenance: path.join(inputRoot, "manifest.json"),
    raw: path.join(inputRoot, "raw.json"),
    visual: visualRoot,
    playwrightVisual: playwrightVisualRoot,
    diagnostics: diagnosticsRoot
  };
}

const input = createInputs();
assert.equal(createEvidenceArtifactName({ runId: "123", jobName: "browser", runAttempt: "2" }), "evidence-123-browser-2");
assert.notEqual(
  createEvidenceArtifactName({ runId: "123", jobName: "browser", runAttempt: "1" }),
  createEvidenceArtifactName({ runId: "123", jobName: "browser", runAttempt: "2" })
);

const success = stageEvidence({
  staging_dir: path.join(fixtureRoot, "success"),
  status: "success",
  summary: input.summary,
  provenance: input.provenance,
  raw: [input.raw],
  visual: [input.visual],
  diagnostics: [input.diagnostics],
  run_id: "100",
  run_attempt: "1",
  job_name: "measure",
  source_sha: "a".repeat(40),
  base_sha: "b".repeat(40),
  seed: "42",
  config: JSON.stringify({ measurement: "standard" }),
  determinism_status: "pass"
});
assert.equal(success.includeExtra, false);
assert.ok(existsSync(path.join(success.stagingRoot, "summary", "summary.md")));
assert.ok(existsSync(path.join(success.stagingRoot, "provenance", "provenance.json")));
assert.ok(existsSync(path.join(success.stagingRoot, "decision", "result.json")));
assert.ok(existsSync(path.join(success.stagingRoot, "execution", "metadata.json")));
assert.equal(existsSync(path.join(success.stagingRoot, "raw", "raw.json")), false);
assert.equal(existsSync(path.join(success.stagingRoot, "visual", "capture.png")), false);
const successProvenance = JSON.parse(readFileSync(path.join(success.stagingRoot, "provenance", "provenance.json")));
assert.equal(successProvenance.sourceSha, "a".repeat(40));
assert.equal(successProvenance.baseSha, "b".repeat(40));
assert.equal(successProvenance.retentionDays, EVIDENCE_ARTIFACT_RETENTION_DAYS);
assert.match(successProvenance.contentHash, /^[0-9a-f]{64}$/);

const failure = stageEvidence({
  staging_dir: path.join(fixtureRoot, "failure"),
  status: "failure",
  summary: input.summary,
  provenance: input.provenance,
  raw: [input.raw],
  visual: [input.visual],
  visual_dirs: [input.playwrightVisual],
  diagnostics: [input.diagnostics],
  logs: [path.join(input.diagnostics, "failure.log")],
  run_id: "100",
  run_attempt: "1",
  job_name: "browser"
});
assert.equal(failure.includeExtra, true);
assert.ok(existsSync(path.join(failure.stagingRoot, "raw", "raw.json")));
assert.ok(existsSync(path.join(failure.stagingRoot, "visual", "capture.png")));
assert.ok(existsSync(path.join(failure.stagingRoot, "visual", "browser-capture.png")));
assert.ok(existsSync(path.join(failure.stagingRoot, "diagnostics", "failure.log")));
assert.ok(existsSync(path.join(failure.stagingRoot, "provenance", "provenance.json")));

const debug = stageEvidence({
  staging_dir: path.join(fixtureRoot, "debug"),
  status: "success",
  includeRaw: true,
  raw: [input.raw],
  visual: [input.visual],
  run_id: "100",
  run_attempt: "2",
  job_name: "measure"
});
assert.equal(debug.includeExtra, true);
assert.ok(existsSync(path.join(debug.stagingRoot, "raw", "raw.json")));
assert.ok(existsSync(path.join(debug.stagingRoot, "visual", "capture.png")));

const unsafe = path.join(input.inputRoot, "unsafe.json");
writeFileSync(unsafe, JSON.stringify({ access_token: "ghp_not-for-upload", owner: "person@example.com" }));
const safe = stageEvidence({
  staging_dir: path.join(fixtureRoot, "safe"),
  status: "failure",
  raw: [unsafe],
  run_id: "100",
  run_attempt: "3",
  job_name: "measure"
});
assert.equal(safe.securityDiagnostics.length, 1);
assert.equal(readdirSync(path.join(safe.stagingRoot, "raw")).length, 0);
assert.ok(existsSync(path.join(safe.stagingRoot, "execution", "diagnostics.json")));

const zipSecret = path.join(input.inputRoot, "secret.zip");
writeFileSync(zipSecret, Buffer.from("PK\x03\x04 access_token=ghp_not-for-upload"));
const zipExcluded = stageEvidence({
  staging_dir: path.join(fixtureRoot, "zip-excluded"),
  status: "failure",
  diagnostics: [zipSecret],
  run_id: "100",
  run_attempt: "3b",
  job_name: "measure"
});
assert.equal(existsSync(path.join(zipExcluded.stagingRoot, "diagnostics", "secret.zip")), false);

const oversized = path.join(input.inputRoot, "oversized.json");
writeFileSync(oversized, JSON.stringify({ generated: "x".repeat(20_000) }));
const trimmed = stageEvidence({
  staging_dir: path.join(fixtureRoot, "trimmed"),
  status: "failure",
  raw: [oversized],
  max_bytes: "4096",
  run_id: "100",
  run_attempt: "4",
  job_name: "measure"
});
assert.equal(trimmed.sizeWarning.action, "optional-evidence-removed");
assert.ok(trimmed.bytes <= 4096);
assert.equal(existsSync(path.join(trimmed.stagingRoot, "raw", "oversized.json")), false);
assert.deepEqual(trimmed.sizeWarning.priority, ["logs", "visual", "raw"]);
assert.equal(trimmed.sizeWarning.removedFiles[0].path, "raw/oversized.json");
assert.match(readFileSync(path.join(trimmed.stagingRoot, "summary", "size-reduction.md"), "utf8"), /oversized\.json/);
const trimmedProvenance = JSON.parse(readFileSync(path.join(trimmed.stagingRoot, "provenance", "provenance.json")));
assert.equal(trimmedProvenance.sizeReduction.action, "optional-evidence-removed");
assert.equal(trimmedProvenance.sizeReduction.removedFiles[0].reason, "optional evidence removed after artifact size limit was exceeded");
assert.equal(JSON.parse(readFileSync(path.join(trimmed.stagingRoot, "execution", "metadata.json"))).bytes, trimmed.bytes);

rmSync(fixtureRoot, { recursive: true, force: true });
console.log("[PASS] evidence artifact staging conditions, provenance, allowlist, and secret exclusion");
