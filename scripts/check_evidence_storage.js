import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_POLICY_PATH = ".agents/evidence-storage-policy.json";
const JSON_LIMIT = 1024 * 1024;
const CLASSIFICATIONS = new Set([
  "raw-generated-json",
  "decision/provenance",
  "fixture",
  "protocol",
  "canonical-baseline",
  "visual-review",
]);
const EXCEPTION_MODES = new Set(["grandfathered", "allow-new"]);

function repoPath(filePath, root = ROOT) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function runGit(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function resolveCommit(root, ref) {
  return runGit(root, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

function resolveEvidenceTree(root, commit) {
  return runGit(root, ["rev-parse", "--verify", `${commit}:evidence`]).trim();
}

function readPolicyAtCommit(root, commit, policyPath) {
  try {
    return JSON.parse(runGit(root, ["show", `${commit}:${policyPath}`]));
  } catch (error) {
    if (error.status === 128 && /does not exist|exists on disk, but not in/.test(String(error.stderr || ""))) return null;
    throw error;
  }
}

function readTree(root, ref) {
  const output = runGit(root, ["ls-tree", "-r", "-l", "-z", ref, "--", "evidence/"]);
  const tree = new Map();

  for (const record of output.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const fields = record.slice(0, tab).split(/\s+/);
    const filePath = record.slice(tab + 1);
    if (fields.length < 4 || fields[1] !== "blob") continue;
    tree.set(filePath, {
      path: filePath,
      blob: fields[2],
      size: Number(fields[3]),
    });
  }

  return tree;
}

function readChangedPaths(root, baseCommit, headCommit) {
  // Treat a rename as a delete plus an add. This preserves forward-only
  // semantics without loading every large blob for similarity detection.
  const output = runGit(root, ["diff", "--name-status", "-z", "--no-renames", baseCommit, headCommit, "--", "evidence/"]);
  const changes = new Map();
  const fields = output.split("\0");

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (oldPath) changes.set(oldPath, kind === "R" ? "D" : "C");
      if (newPath) changes.set(newPath, kind === "R" ? "A" : "C");
      continue;
    }
    const filePath = fields[index++];
    if (filePath) changes.set(filePath, kind);
  }

  return changes;
}

function hasPathChange(root, baseCommit, headCommit, filePath) {
  try {
    runGit(root, ["diff", "--quiet", "--no-renames", baseCommit, headCommit, "--", filePath]);
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function addDiagnostic(diagnostics, policyPath, message) {
  diagnostics.push(`${policyPath}: ${message}`);
}

export function validatePolicy(policy, policyPath = DEFAULT_POLICY_PATH) {
  const diagnostics = [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return [`${policyPath}: policy must be a JSON object`];
  }
  if (policy.schemaVersion !== 1) addDiagnostic(diagnostics, policyPath, "schemaVersion must be 1");
  if (policy.newTrackedRawGeneratedJsonMaxBytes !== JSON_LIMIT) {
    addDiagnostic(diagnostics, policyPath, `newTrackedRawGeneratedJsonMaxBytes must be ${JSON_LIMIT}`);
  }
  if (!policy.artifactPolicy || typeof policy.artifactPolicy !== "object" || policy.artifactPolicy.defaultRetentionDays !== 14 || policy.artifactPolicy.rawUpload !== "failure-or-explicit-debug") {
    addDiagnostic(diagnostics, policyPath, "artifactPolicy requires defaultRetentionDays=14 and rawUpload=failure-or-explicit-debug");
  }
  if (!Array.isArray(policy.classificationRules) || policy.classificationRules.length === 0) {
    addDiagnostic(diagnostics, policyPath, "classificationRules must be a non-empty array");
  } else {
    const seenRuleClassifications = new Set();
    policy.classificationRules.forEach((rule, index) => {
      const label = `classificationRules[${index}]`;
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        addDiagnostic(diagnostics, policyPath, `${label} must be an object`);
        return;
      }
      if (!CLASSIFICATIONS.has(rule.classification)) addDiagnostic(diagnostics, policyPath, `${label}.classification is invalid`);
      if (seenRuleClassifications.has(rule.classification)) addDiagnostic(diagnostics, policyPath, `${label}.classification is duplicated`);
      seenRuleClassifications.add(rule.classification);
      if (!Array.isArray(rule.pathPrefixes) || rule.pathPrefixes.length === 0 || !rule.pathPrefixes.every(isNonEmptyString)) {
        addDiagnostic(diagnostics, policyPath, `${label}.pathPrefixes must be a non-empty string array`);
      }
      if (rule.extensions !== undefined && (!Array.isArray(rule.extensions) || !rule.extensions.every(isNonEmptyString))) {
        addDiagnostic(diagnostics, policyPath, `${label}.extensions must be a string array`);
      }
      if (!["allow", "size-limit", "deny-change"].includes(rule.changePolicy)) {
        addDiagnostic(diagnostics, policyPath, `${label}.changePolicy is invalid`);
      }
    });
  }

  if (!Array.isArray(policy.exceptions)) {
    addDiagnostic(diagnostics, policyPath, "exceptions must be an array");
  } else {
    const paths = new Set();
    policy.exceptions.forEach((exception, index) => {
      const label = `exceptions[${index}]`;
      if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
        addDiagnostic(diagnostics, policyPath, `${label} must be an object`);
        return;
      }
      if (!isNonEmptyString(exception.path) || !exception.path.startsWith("evidence/")) addDiagnostic(diagnostics, policyPath, `${label}.path must be an exact evidence path`);
      if (paths.has(exception.path)) addDiagnostic(diagnostics, policyPath, `${label}.path is duplicated`);
      paths.add(exception.path);
      if (!CLASSIFICATIONS.has(exception.classification)) addDiagnostic(diagnostics, policyPath, `${label}.classification is invalid`);
      if (!isNonEmptyString(exception.rationale)) addDiagnostic(diagnostics, policyPath, `${label}.rationale is required`);
      if (!isNonEmptyString(exception.owner)) addDiagnostic(diagnostics, policyPath, `${label}.owner is required`);
      if (!Number.isSafeInteger(exception.maximumSize) || exception.maximumSize <= 0) addDiagnostic(diagnostics, policyPath, `${label}.maximumSize must be a positive integer`);
      if (!EXCEPTION_MODES.has(exception.mode)) addDiagnostic(diagnostics, policyPath, `${label}.mode is invalid`);
      const review = exception.review;
      if (!review || typeof review !== "object" || !isNonEmptyString(review.reviewedBy) || !isNonEmptyString(review.reviewedAt) || !isNonEmptyString(review.expiresAt)) {
        addDiagnostic(diagnostics, policyPath, `${label}.review requires reviewedBy, reviewedAt, and expiresAt`);
      }
      if (exception.mode === "grandfathered") {
        if (!exception.base || typeof exception.base !== "object" || !isSha(exception.base.tree) || !isSha(exception.base.blob) || !Number.isSafeInteger(exception.base.size) || exception.base.size <= 0) {
          addDiagnostic(diagnostics, policyPath, `${label}.base requires tree, blob, and positive size`);
        }
      } else if (exception.base !== undefined) {
        addDiagnostic(diagnostics, policyPath, `${label}.base is only valid for grandfathered exceptions`);
      }
    });
  }

  return diagnostics;
}

function loadPolicy(root, policyFile) {
  const absolutePath = path.resolve(root, policyFile);
  const relativePath = repoPath(absolutePath, root);
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return { policy: null, diagnostics: [`${relativePath}: unable to parse policy: ${error.message}`] };
  }
  return { policy, diagnostics: validatePolicy(policy, relativePath) };
}

function matchesRule(filePath, rule) {
  return rule.pathPrefixes.some(prefix => filePath.startsWith(prefix)) &&
    (rule.extensions === undefined || rule.extensions.some(extension => filePath.endsWith(extension)));
}

function identity(commit, entry) {
  if (!entry) return `commit:${commit}:blob:-:size:-`;
  return `commit:${commit}:blob:${entry.blob}:size:${entry.size}`;
}

function diagnosticFor(filePath, size, reason, baseCommit, baseEntry, headCommit, headEntry) {
  return `path=${filePath} size=${size ?? "-"} reason=${reason} base=${identity(baseCommit, baseEntry)} head=${identity(headCommit, headEntry)}`;
}

function policyDiagnostic(policyPath, reason, baseCommit, headCommit) {
  return `path=${policyPath} size=- reason=${reason} base=commit:${baseCommit}:blob:-:size:- head=commit:${headCommit}:blob:-:size:-`;
}

function findException(policy, filePath) {
  return policy.exceptions.find(exception => exception.path === filePath);
}

function findRule(policy, filePath) {
  return policy.classificationRules.find(rule => matchesRule(filePath, rule));
}

function checkGrandfatheredBase(exception, baseCommit, baseEvidenceTree, baseEntry, enforceTree) {
  if (enforceTree && exception.base.tree !== baseEvidenceTree) return `grandfather base tree mismatch (policy=${exception.base.tree})`;
  if (!baseEntry) return "grandfather base path is missing";
  if (exception.base.blob !== baseEntry.blob) return `grandfather base blob mismatch (policy=${exception.base.blob})`;
  if (exception.base.size !== baseEntry.size) return `grandfather base size mismatch (policy=${exception.base.size})`;
  return null;
}

function checkPolicyEvolution({ root, baseCommit, headCommit, policyPath, headPolicy, baseTree, headTree, changedEvidence }) {
  const diagnostics = [];
  let basePolicy;
  try {
    basePolicy = readPolicyAtCommit(root, baseCommit, policyPath);
  } catch (error) {
    diagnostics.push(policyDiagnostic(policyPath, `unable to read base policy: ${error.message}`, baseCommit, headCommit));
    return diagnostics;
  }

  const policyChanged = hasPathChange(root, baseCommit, headCommit, policyPath);
  if (policyChanged && changedEvidence > 0) {
    diagnostics.push(policyDiagnostic(policyPath, "policy and evidence changes must be separate; this prevents same-PR policy relaxation", baseCommit, headCommit));
  }
  if (!basePolicy || !policyChanged) return diagnostics;

  const baseValidation = validatePolicy(basePolicy, `${policyPath}@base`);
  if (baseValidation.length > 0) {
    diagnostics.push(...baseValidation.map(message => policyDiagnostic(policyPath, `base policy invalid: ${message}`, baseCommit, headCommit)));
    return diagnostics;
  }

  const baseExceptions = new Map(basePolicy.exceptions.map(exception => [exception.path, exception]));
  const headExceptions = new Map(headPolicy.exceptions.map(exception => [exception.path, exception]));
  for (const [filePath, baseException] of baseExceptions) {
    const headException = headExceptions.get(filePath);
    if (!headException) continue;
    if (baseException.mode === "grandfathered" && headException.mode !== "grandfathered") {
      diagnostics.push(policyDiagnostic(policyPath, `grandfathered exception mode relaxation is not allowed for ${filePath}`, baseCommit, headCommit));
    }
    if (headException.maximumSize > baseException.maximumSize) {
      diagnostics.push(policyDiagnostic(policyPath, `exception size ceiling increase is not allowed for ${filePath}`, baseCommit, headCommit));
    }
  }

  // Keep an unchanged large blob protected even if a policy-only change removes
  // its exception. Tree metadata is sufficient; no large blob is read.
  for (const headEntry of headTree.values()) {
    const rule = findRule(headPolicy, headEntry.path);
    if (rule?.classification !== "raw-generated-json" || headEntry.size <= headPolicy.newTrackedRawGeneratedJsonMaxBytes) continue;
    const exception = headExceptions.get(headEntry.path);
    if (!exception) {
      diagnostics.push(diagnosticFor(headEntry.path, headEntry.size, "large raw/generated JSON has no grandfather or exact exception", baseCommit, baseTree.get(headEntry.path), headCommit, headEntry));
    }
  }

  return diagnostics;
}

export function checkEvidenceStorage({
  root = ROOT,
  baseRef,
  headRef,
  policyPath = DEFAULT_POLICY_PATH,
} = {}) {
  const loaded = loadPolicy(root, policyPath);
  if (loaded.diagnostics.length > 0) return { ok: false, diagnostics: loaded.diagnostics, changedPaths: 0 };

  const explicitBase = Boolean(baseRef || process.env.EVIDENCE_BASE_SHA || process.env.BASE_SHA || process.env.BASE_REF);
  const baseName = baseRef || process.env.EVIDENCE_BASE_SHA || process.env.BASE_SHA || process.env.BASE_REF || "HEAD";
  const headName = headRef || process.env.EVIDENCE_HEAD_SHA || "HEAD";
  let baseCommit;
  let headCommit;
  try {
    baseCommit = resolveCommit(root, baseName);
    headCommit = resolveCommit(root, headName);
  } catch (error) {
    return { ok: false, diagnostics: [`evidence: unable to resolve base/head: ${error.message}`], changedPaths: 0 };
  }

  let baseTree;
  let headTree;
  let changes;
  let baseEvidenceTree;
  try {
    baseTree = readTree(root, baseCommit);
    headTree = readTree(root, headCommit);
    changes = readChangedPaths(root, baseCommit, headCommit);
    baseEvidenceTree = resolveEvidenceTree(root, baseCommit);
  } catch (error) {
    return { ok: false, diagnostics: [`evidence: unable to inspect base/head trees: ${error.message}`], changedPaths: 0 };
  }

  const diagnostics = [];
  const exceptions = loaded.policy.exceptions;
  diagnostics.push(...checkPolicyEvolution({
    root,
    baseCommit,
    headCommit,
    policyPath,
    headPolicy: loaded.policy,
    baseTree,
    headTree,
    changedEvidence: changes.size,
  }));
  for (const exception of exceptions.filter(item => item.mode === "grandfathered")) {
    const mismatch = checkGrandfatheredBase(exception, baseCommit, baseEvidenceTree, baseTree.get(exception.path), explicitBase);
    if (mismatch) {
      const entry = baseTree.get(exception.path);
      diagnostics.push(diagnosticFor(exception.path, entry?.size, mismatch, baseCommit, entry, headCommit, headTree.get(exception.path)));
    }
  }

  for (const [filePath, changeKind] of changes) {
    const baseEntry = baseTree.get(filePath);
    const headEntry = headTree.get(filePath);
    const exception = findException(loaded.policy, filePath);
    const rule = findRule(loaded.policy, filePath);
    if (!rule && !exception && !baseEntry?.path?.startsWith("evidence/")) continue;

    if (!headEntry) {
      diagnostics.push(diagnosticFor(filePath, baseEntry?.size, "deleting tracked evidence is not allowed", baseCommit, baseEntry, headCommit, headEntry));
      continue;
    }

    if (exception?.mode === "grandfathered") {
      if (!baseEntry) {
        diagnostics.push(diagnosticFor(filePath, headEntry.size, "grandfathered path was newly added", baseCommit, baseEntry, headCommit, headEntry));
      } else if (headEntry.size > exception.maximumSize) {
        diagnostics.push(diagnosticFor(filePath, headEntry.size, `grandfathered size exceeds ceiling ${exception.maximumSize}`, baseCommit, baseEntry, headCommit, headEntry));
      } else if (baseEntry.blob !== headEntry.blob) {
        diagnostics.push(diagnosticFor(filePath, headEntry.size, "grandfathered content changed", baseCommit, baseEntry, headCommit, headEntry));
      }
      continue;
    }

    if (exception?.mode === "allow-new") {
      if (headEntry.size > exception.maximumSize) {
        diagnostics.push(diagnosticFor(filePath, headEntry.size, `exception size exceeds ceiling ${exception.maximumSize}`, baseCommit, baseEntry, headCommit, headEntry));
      }
      continue;
    }

    if (!rule) continue;
    if (rule.changePolicy === "deny-change" && (changeKind === "A" || changeKind === "R" || changeKind === "C" || baseEntry?.blob !== headEntry.blob)) {
      diagnostics.push(diagnosticFor(filePath, headEntry.size, "new or changed visual evidence requires an exact canonical exception", baseCommit, baseEntry, headCommit, headEntry));
      continue;
    }
    if (rule.changePolicy === "size-limit" && headEntry.size > loaded.policy.newTrackedRawGeneratedJsonMaxBytes) {
      diagnostics.push(diagnosticFor(filePath, headEntry.size, `raw/generated JSON exceeds ${loaded.policy.newTrackedRawGeneratedJsonMaxBytes} bytes without a grandfather or exception`, baseCommit, baseEntry, headCommit, headEntry));
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    changedPaths: changes.size,
    baseCommit,
    headCommit,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = checkEvidenceStorage();
  if (!result.ok) {
    for (const diagnostic of result.diagnostics) console.error(`[evidence] FAIL ${diagnostic}`);
    process.exitCode = 1;
  } else {
    console.log(`[evidence] PASS base=${result.baseCommit} head=${result.headCommit} changed=${result.changedPaths}`);
  }
}
