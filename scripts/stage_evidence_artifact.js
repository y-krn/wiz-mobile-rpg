import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export const EVIDENCE_ARTIFACT_RETENTION_DAYS = 14;
export const DEFAULT_MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
// Diagnostics are required evidence. If the cap is reached, discard optional
// evidence in this fixed order so failure analysis is never silently removed.
export const OPTIONAL_REDUCTION_PRIORITY = Object.freeze(["logs", "visual", "raw"]);
const REQUIRED_CATEGORIES = Object.freeze(["summary", "provenance", "decision", "diagnostics", "execution"]);
const SAFE_VISUAL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SAFE_DIAGNOSTIC_EXTENSIONS = new Set([".json", ".txt", ".log", ".md", ".html", ".xml"]);
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /(?:^|[\s"'])github_pat_[A-Za-z0-9_]+/i,
  /(?:^|[\s"'])gh[pousr]_[A-Za-z0-9_]+/i,
  /(?:^|[\s"'])xox[baprs]-[A-Za-z0-9-]+/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:aws_secret_access_key|client_secret|access_token|refresh_token|api[_-]?key|password)\s*[:=]\s*[^\s,}"']+/i,
  /(?:^|[\\/])\.env(?:\.|$)/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

function normalizeSegment(value, fallback) {
  const normalized = String(value ?? fallback).trim().replace(/[^A-Za-z0-9_.-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || fallback;
}

export function createEvidenceArtifactName({ runId, jobName, runAttempt }) {
  return `evidence-${normalizeSegment(runId, "local")}-${normalizeSegment(jobName, "job")}-${normalizeSegment(runAttempt, "1")}`;
}

function parseArgs(argv) {
  const options = {
    raw: [],
    visual: [],
    diagnostics: [],
    logs: [],
    visual_dirs: [],
    diagnostics_dirs: [],
    logs_dirs: []
  };
  const valueOptions = new Set([
    "staging-dir", "summary", "provenance", "decision", "metadata", "raw", "visual",
    "diagnostics", "logs", "status", "run-id", "run-attempt", "job-name", "source-sha",
    "base-sha", "seed", "config", "determinism-status", "runner-os", "runner-path",
    "runner-version", "retention-days", "max-bytes", "github-output", "summary-label",
    "visual-dir", "diagnostics-dir", "logs-dir", "job-timeout-minutes", "step-timeout-minutes",
    "timeout-basis"
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--include-raw") {
      options.includeRaw = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`unknown argument: ${argument}`);
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    if (!valueOptions.has(key)) throw new Error(`unknown argument: --${key}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${key} requires a value`);
    const target = ["raw", "visual", "diagnostics", "logs"].includes(key) ? key : key.replaceAll("-", "_");
    if (["raw", "visual", "diagnostics", "logs"].includes(key)) options[target].push(value);
    else if (["visual-dir", "diagnostics-dir", "logs-dir"].includes(key)) options[`${target}s`].push(value);
    else options[target] = value;
  }
  return options;
}

function envOr(value, envKey, fallback = "") {
  return value || process.env[envKey] || fallback;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function safeName(value) {
  return normalizeSegment(path.basename(value), "evidence");
}

function containsForbiddenContent(filePath, content) {
  if (/\.env(?:\.|$)/i.test(path.basename(filePath))) return "environment file";
  const text = content.toString("utf8");
  const match = SECRET_PATTERNS.find(pattern => pattern.test(text));
  return match ? "secret, credential, token, or personal-information pattern" : null;
}

function isAllowedExtension(category, extension) {
  if (category === "visual") return SAFE_VISUAL_EXTENSIONS.has(extension);
  if (category === "raw") return extension === ".json";
  return SAFE_DIAGNOSTIC_EXTENSIONS.has(extension);
}

function candidateFiles(inputPath, category) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const stat = fs.lstatSync(inputPath);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) {
    const extension = path.extname(inputPath).toLowerCase();
    return isAllowedExtension(category, extension) ? [{ source: inputPath, relative: path.basename(inputPath) }] : [];
  }
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const source = path.join(inputPath, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      for (const child of candidateFiles(source, category)) {
        files.push({ ...child, relative: path.join(entry.name, child.relative) });
      }
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (!isAllowedExtension(category, extension)) continue;
      files.push({ source, relative: entry.name });
    }
  }
  return files;
}

function addUniqueDestination(destination, usedNames, relative) {
  const normalized = relative.split(path.sep).join("/").replace(/^\/+/, "");
  const parsed = path.posix.parse(normalized);
  let candidate = normalized;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = path.posix.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  }
  usedNames.add(candidate);
  return path.join(destination, candidate);
}

function copyAllowlisted(inputs, category, stagingRoot, diagnostics, usedNames) {
  const destination = path.join(stagingRoot, category);
  ensureDirectory(destination);
  for (const input of inputs) {
    for (const file of candidateFiles(input, category)) {
      const content = fs.readFileSync(file.source);
      const forbidden = containsForbiddenContent(file.source, content);
      if (forbidden) {
        diagnostics.push({ category, source: `${category}/${safeName(file.source)}`, action: "excluded", reason: forbidden });
        continue;
      }
      const target = addUniqueDestination(destination, usedNames, file.relative);
      ensureDirectory(path.dirname(target));
      fs.writeFileSync(target, content);
    }
  }
}

function fileList(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...fileList(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function totalBytes(root) {
  return fileList(root).reduce((total, file) => total + fs.statSync(file).size, 0);
}

function payloadHash(root) {
  const hash = createHash("sha256");
  for (const file of fileList(root).sort()) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (relative.startsWith("provenance/") || relative.startsWith("execution/")) continue;
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function trimOptionalEvidence(root, maxBytes) {
  const bytesBeforeTrim = totalBytes(root);
  const removedFiles = [];
  for (const [priorityIndex, category] of OPTIONAL_REDUCTION_PRIORITY.entries()) {
    const candidates = fileList(path.join(root, category)).sort();
    for (const file of candidates) {
      if (totalBytes(root) <= maxBytes) break;
      const bytes = fs.statSync(file).size;
      const relative = path.relative(root, file).split(path.sep).join("/");
      fs.rmSync(file, { force: true });
      removedFiles.push({
        category,
        path: relative,
        bytes,
        priority: priorityIndex + 1,
        reason: "optional evidence removed after artifact size limit was exceeded"
      });
    }
    if (totalBytes(root) <= maxBytes) break;
  }
  return {
    action: removedFiles.length > 0 ? "optional-evidence-removed" : "required-evidence-exceeds-limit",
    maxBytes,
    bytesBeforeTrim,
    bytesAfterTrim: totalBytes(root),
    priority: [...OPTIONAL_REDUCTION_PRIORITY],
    requiredCategories: [...REQUIRED_CATEGORIES],
    removedFiles
  };
}

function writeSizeReductionSummary(root, reduction) {
  if (!reduction) return;
  const summaryDirectory = path.join(root, "summary");
  const lines = [
    "# Artifact size policy",
    "",
    `- action: ${reduction.action}`,
    `- limit bytes: ${reduction.maxBytes}`,
    `- bytes before trim: ${reduction.bytesBeforeTrim}`,
    `- bytes after trim: ${reduction.bytesAfterTrim}`,
    `- fixed priority: ${reduction.priority.join(" -> ")}`,
    `- required categories preserved: ${reduction.requiredCategories.join(", ")}`,
    ...reduction.removedFiles.map(file => `- removed: ${file.path} (${file.bytes} bytes; ${file.reason})`),
    ""
  ];
  fs.writeFileSync(path.join(summaryDirectory, "size-reduction.md"), `${lines.join("\n")}\n`);
}

function mergeSizeReduction(previous, next, requiredExceeded = false) {
  if (!previous) return next;
  return {
    ...next,
    action: requiredExceeded ? "required-evidence-exceeds-limit" : "optional-evidence-removed",
    bytesBeforeTrim: previous.bytesBeforeTrim,
    removedFiles: [...previous.removedFiles, ...next.removedFiles]
  };
}

function writeGeneratedFiles({ stagingRoot, payloadStatus, options, artifactName, status, sizeReduction, maxBytes, securityDiagnostics }) {
  payloadStatus.sizeReduction = sizeReduction;
  ensureDirectory(path.join(stagingRoot, "decision"));
  fs.writeFileSync(path.join(stagingRoot, "decision", "result.json"), `${JSON.stringify(payloadStatus, null, 2)}\n`);

  const contentHash = payloadHash(stagingRoot);
  ensureDirectory(path.join(stagingRoot, "provenance"));
  const provenance = JSON.stringify(buildProvenance({ options, artifactName, contentHash, status, sizeReduction }), null, 2);
  const generatedForbidden = containsForbiddenContent("provenance.json", Buffer.from(provenance));
  if (generatedForbidden) throw new Error(`provenance contains forbidden content: ${generatedForbidden}`);
  fs.writeFileSync(path.join(stagingRoot, "provenance", "provenance.json"), `${provenance}\n`);

  ensureDirectory(path.join(stagingRoot, "execution"));
  {
    const diagnostics = JSON.stringify({
      status,
      failure: status === "failure" ? { reason: "measurement or merge step failed" } : null,
      security: securityDiagnostics,
      sizeWarning: sizeReduction
    }, null, 2);
    const diagnosticsForbidden = containsForbiddenContent("diagnostics.json", Buffer.from(diagnostics));
    if (diagnosticsForbidden) throw new Error(`execution diagnostics contain forbidden content: ${diagnosticsForbidden}`);
    fs.writeFileSync(path.join(stagingRoot, "execution", "diagnostics.json"), `${diagnostics}\n`);
  }

  const metadataPath = path.join(stagingRoot, "execution", "metadata.json");
  const writeMetadata = bytes => fs.writeFileSync(metadataPath, `${JSON.stringify({
    schemaVersion: 1,
    artifactName,
    status,
    retentionDays: EVIDENCE_ARTIFACT_RETENTION_DAYS,
    bytes,
    maxBytes,
    contentHash,
    generatedAt: new Date().toISOString(),
    timeoutMinutes: timeoutMinutes(options)
  }, null, 2)}\n`);
  let bytes = totalBytes(stagingRoot);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    writeMetadata(bytes);
    const nextBytes = totalBytes(stagingRoot);
    if (nextBytes === bytes) break;
    bytes = nextBytes;
  }
  return { contentHash, bytes: totalBytes(stagingRoot) };
}

function configValue(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return { value: String(value) }; }
}

function timeoutValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function timeoutMinutes(options) {
  return {
    job: timeoutValue(options.job_timeout_minutes),
    step: timeoutValue(options.step_timeout_minutes)
  };
}

export function buildProvenance({ options, artifactName, contentHash, status, sizeReduction = null }) {
  return {
    schemaVersion: 1,
    runner: {
      os: envOr(options.runner_os, "RUNNER_OS", os.platform()),
      path: envOr(options.runner_path, "RUNNER_TEMP", os.tmpdir()),
      version: envOr(options.runner_version, "RUNNER_VERSION", process.version)
    },
    sourceSha: envOr(options.source_sha, "GITHUB_SHA", "unknown"),
    baseSha: envOr(options.base_sha, "GITHUB_BASE_SHA", process.env.BASE_SHA || "unknown"),
    workflowRunId: envOr(options.run_id, "GITHUB_RUN_ID", "local"),
    runAttempt: envOr(options.run_attempt, "GITHUB_RUN_ATTEMPT", "1"),
    jobName: envOr(options.job_name, "GITHUB_JOB", "local"),
    seed: envOr(options.seed, "MEASUREMENT_SEED", null),
    config: configValue(envOr(options.config, "EVIDENCE_CONFIG", "")),
    determinismStatus: envOr(options.determinism_status, "DETERMINISM_STATUS", "not-provided"),
    contentHash,
    retentionDays: EVIDENCE_ARTIFACT_RETENTION_DAYS,
    timeoutMinutes: timeoutMinutes(options),
    timeoutBasis: options.timeout_basis || null,
    artifactName,
    sizeReduction,
    status
  };
}

export function stageEvidence(options = {}) {
  const stagingRoot = path.resolve(options.staging_dir || process.env.RUNNER_TEMP || os.tmpdir(), "evidence-artifact");
  if (stagingRoot === path.parse(stagingRoot).root || path.basename(stagingRoot) !== "evidence-artifact") {
    throw new Error(`refusing unsafe staging directory: ${stagingRoot}`);
  }
  if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
  ensureDirectory(stagingRoot);
  const status = options.status === "success" ? "success" : "failure";
  const artifactName = createEvidenceArtifactName({
    runId: envOr(options.run_id, "GITHUB_RUN_ID", "local"),
    jobName: envOr(options.job_name, "GITHUB_JOB", "local"),
    runAttempt: envOr(options.run_attempt, "GITHUB_RUN_ATTEMPT", "1")
  });
  const securityDiagnostics = [];
  const usedNames = new Set();
  const visualDirectories = options.visual_dirs || (options.visual_dir ? [options.visual_dir] : []);
  const diagnosticsDirectories = options.diagnostics_dirs || (options.diagnostics_dir ? [options.diagnostics_dir] : []);
  const logDirectories = options.logs_dirs || (options.logs_dir ? [options.logs_dir] : []);
  copyAllowlisted(options.summary ? [options.summary] : [], "summary", stagingRoot, securityDiagnostics, usedNames);
  copyAllowlisted(options.provenance ? [options.provenance] : [], "provenance", stagingRoot, securityDiagnostics, usedNames);
  copyAllowlisted(options.decision ? [options.decision] : [], "decision", stagingRoot, securityDiagnostics, usedNames);
  ensureDirectory(path.join(stagingRoot, "summary"));
  if (fileList(path.join(stagingRoot, "summary")).length === 0) {
    fs.writeFileSync(path.join(stagingRoot, "summary", "summary.md"), [
      "# CI evidence artifact",
      "",
      `- status: ${status}`,
      `- raw/image evidence: ${status === "success" && !options.includeRaw ? "omitted" : "included when available"}`,
      "- source: explicit CI staging allowlist",
      ""
    ].join("\n"));
  }
  const includeExtra = Boolean(options.includeRaw) || status !== "success";
  if (includeExtra) {
    copyAllowlisted(options.raw || [], "raw", stagingRoot, securityDiagnostics, usedNames);
    copyAllowlisted(options.visual || [], "visual", stagingRoot, securityDiagnostics, usedNames);
    copyAllowlisted(options.diagnostics || [], "diagnostics", stagingRoot, securityDiagnostics, usedNames);
    copyAllowlisted(options.logs || [], "logs", stagingRoot, securityDiagnostics, usedNames);
    for (const [category, directories] of [["visual", visualDirectories], ["diagnostics", diagnosticsDirectories], ["logs", logDirectories]]) {
      copyAllowlisted(directories, category, stagingRoot, securityDiagnostics, usedNames);
    }
  }

  const payloadStatus = {
    status,
    rawIncluded: includeExtra,
    explicitDebug: Boolean(options.includeRaw),
    timeoutMinutes: timeoutMinutes(options),
    timeoutBasis: options.timeout_basis || null,
    allowlist: {
      summary: options.summary ? [path.basename(options.summary)] : [],
      provenance: options.provenance ? [path.basename(options.provenance)] : [],
      decision: options.decision ? [path.basename(options.decision)] : [],
      raw: (options.raw || []).map(value => path.basename(value)),
      visual: (options.visual || []).concat(visualDirectories).map(value => path.basename(value)),
      diagnostics: (options.diagnostics || []).concat(diagnosticsDirectories).map(value => path.basename(value)),
      logs: (options.logs || []).concat(logDirectories).map(value => path.basename(value))
    },
    excluded: securityDiagnostics,
    trackedEvidenceGlobUsed: false
  };
  const maxBytes = Number(options.max_bytes || DEFAULT_MAX_ARTIFACT_BYTES);
  let sizeWarning = null;
  let generated;
  for (;;) {
    if (sizeWarning) writeSizeReductionSummary(stagingRoot, sizeWarning);
    generated = writeGeneratedFiles({
      stagingRoot,
      payloadStatus,
      options,
      artifactName,
      status,
      sizeReduction: sizeWarning,
      maxBytes,
      securityDiagnostics
    });
    if (generated.bytes <= maxBytes) break;

    const reduction = includeExtra
      ? trimOptionalEvidence(stagingRoot, maxBytes)
      : {
          action: "required-evidence-exceeds-limit",
          maxBytes,
          bytesBeforeTrim: generated.bytes,
          bytesAfterTrim: generated.bytes,
          priority: [...OPTIONAL_REDUCTION_PRIORITY],
          requiredCategories: [...REQUIRED_CATEGORIES],
          removedFiles: []
        };
    sizeWarning = mergeSizeReduction(sizeWarning, reduction, reduction.removedFiles.length === 0);
    if (reduction.removedFiles.length === 0) {
      if (sizeWarning) writeSizeReductionSummary(stagingRoot, sizeWarning);
      generated = writeGeneratedFiles({
        stagingRoot,
        payloadStatus,
        options,
        artifactName,
        status,
        sizeReduction: sizeWarning,
        maxBytes,
        securityDiagnostics
      });
      break;
    }
  }
  const size = generated.bytes;
  if (size > maxBytes) {
    throw new Error(`evidence artifact exceeds ${maxBytes} bytes after optional evidence trim: ${size}`);
  }
  if (options.github_output) {
    fs.appendFileSync(options.github_output, `artifact_name=${artifactName}\nartifact_dir=${stagingRoot}\n`);
  }
  return { stagingRoot, artifactName, status, includeExtra, contentHash: generated.contentHash, bytes: size, securityDiagnostics, sizeWarning };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = stageEvidence(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
