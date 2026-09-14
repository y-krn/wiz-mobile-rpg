import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkEvidenceStorage, validatePolicy } from "../../../scripts/check_evidence_storage.js";

const LIMIT = 1024 * 1024;
const POLICY_PATH = ".agents/evidence-storage-policy.json";
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Evidence Policy Test",
  GIT_AUTHOR_EMAIL: "evidence-policy@example.test",
  GIT_COMMITTER_NAME: "Evidence Policy Test",
  GIT_COMMITTER_EMAIL: "evidence-policy@example.test",
};

function git(root, args) {
  return execFileSync("git", args, { cwd: root, env: gitEnv, encoding: "utf8" }).trim();
}

function write(root, filePath, content) {
  const absolute = path.join(root, filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function exception(pathName, classification, mode, maximumSize, base) {
  return {
    path: pathName,
    classification,
    mode,
    maximumSize,
    rationale: "Tested reviewed exception.",
    owner: "test-owner",
    review: { reviewedBy: "test-reviewer", reviewedAt: "2026-09-15", expiresAt: "2027-09-15" },
    ...(base ? { base } : {}),
  };
}

function policyFor(baseTree, baseBlob, extraExceptions = []) {
  return {
    schemaVersion: 1,
    newTrackedRawGeneratedJsonMaxBytes: LIMIT,
    artifactPolicy: {
      defaultRetentionDays: 14,
      durableOutputs: ["summary", "provenance"],
      rawUpload: "failure-or-explicit-debug",
      provenanceFields: ["runnerPath"],
      forbiddenContent: ["secrets"],
    },
    classificationRules: [
      { classification: "fixture", pathPrefixes: ["evidence/fixtures/"], changePolicy: "allow" },
      { classification: "protocol", pathPrefixes: ["evidence/protocols/"], changePolicy: "allow" },
      { classification: "raw-generated-json", pathPrefixes: ["evidence/results/"], extensions: [".json"], changePolicy: "size-limit" },
      { classification: "visual-review", pathPrefixes: ["evidence/results/"], extensions: [".png", ".jpg", ".jpeg", ".webp"], changePolicy: "deny-change" },
    ],
    exceptions: [
      exception("evidence/results/legacy.json", "raw-generated-json", "grandfathered", baseBlob.size, {
        tree: baseTree,
        blob: baseBlob.blob,
        size: baseBlob.size,
      }),
      ...extraExceptions,
    ],
  };
}

function createRepo(extraExceptions = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-policy-"));
  git(root, ["init", "--initial-branch=main", "-q"]);
  write(root, "evidence/results/legacy.json", "x".repeat(LIMIT + 128));
  const baseCommit = commit(root, "seed grandfathered evidence");
  const baseTree = git(root, ["rev-parse", `${baseCommit}:evidence`]);
  const baseBlob = {
    blob: git(root, ["rev-parse", "HEAD:evidence/results/legacy.json"]),
    size: Number(git(root, ["cat-file", "-s", "HEAD:evidence/results/legacy.json"])),
  };
  write(root, POLICY_PATH, JSON.stringify(policyFor(baseTree, baseBlob, extraExceptions), null, 2) + "\n");
  const policyHead = commit(root, "add policy");
  return { root, baseCommit, baseTree, baseBlob, policyHead };
}

function check(repo, headRef = repo.policyHead) {
  return checkEvidenceStorage({ root: repo.root, baseRef: repo.policyHead, headRef });
}

function assertFail(result, text) {
  assert.equal(result.ok, false, text);
  assert.ok(result.diagnostics.some(diagnostic => diagnostic.includes(text)), `${text}: ${result.diagnostics.join("\n")}`);
}

const repos = [];
try {
  {
    const repo = createRepo();
    repos.push(repo);
    assert.equal(check(repo).ok, true, "current baseline passes");
    assert.equal(checkEvidenceStorage({ root: repo.root, baseRef: repo.policyHead, headRef: repo.policyHead }).changedPaths, 0);
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "evidence/results/new-raw.json", "x".repeat(LIMIT + 1));
    const head = commit(repo.root, "add oversized raw output");
    assertFail(check(repo, head), "raw/generated JSON exceeds");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    const relaxed = policyFor(repo.baseTree, repo.baseBlob, [
      exception("evidence/results/new-raw.json", "raw-generated-json", "allow-new", LIMIT + 1),
    ]);
    write(repo.root, POLICY_PATH, JSON.stringify(relaxed));
    write(repo.root, "evidence/results/new-raw.json", "x".repeat(LIMIT + 1));
    const head = commit(repo.root, "try to relax policy with evidence addition");
    const result = checkEvidenceStorage({ root: repo.root, baseRef: repo.baseCommit, headRef: head });
    assertFail(result, "policy and evidence changes must be separate");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    assert.equal(check(repo).ok, true, "grandfathered unchanged large JSON passes");
    write(repo.root, "evidence/results/legacy.json", "x".repeat(LIMIT + 129));
    const head = commit(repo.root, "grow grandfathered output");
    assertFail(check(repo, head), "grandfathered size exceeds ceiling");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    const relaxed = policyFor(repo.baseTree, repo.baseBlob);
    relaxed.exceptions[0].maximumSize += 1;
    write(repo.root, POLICY_PATH, JSON.stringify(relaxed));
    const head = commit(repo.root, "try to increase grandfather ceiling");
    const result = checkEvidenceStorage({ root: repo.root, baseRef: repo.policyHead, headRef: head });
    assertFail(result, "exception size ceiling increase is not allowed");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "unrelated.txt", "main advanced\n");
    const advancedBase = commit(repo.root, "advance main outside evidence");
    assert.equal(checkEvidenceStorage({ root: repo.root, baseRef: advancedBase, headRef: repo.policyHead }).ok, true, "unrelated main commit does not invalidate evidence tree baseline");
  }

  {
    const workflow = fs.readFileSync(path.resolve(".github/workflows/test.yml"), "utf8");
    assert.match(workflow, /github\.event\.pull_request\.base\.sha/);
    assert.match(workflow, /github\.event\.before/);
    assert.match(workflow, /github\.event\.merge_group\.base_sha/);
    assert.match(workflow, /EVIDENCE_HEAD_SHA: \$\{\{ github\.sha \}\}/);
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "evidence/results/legacy.json", "y".repeat(LIMIT + 128));
    const head = commit(repo.root, "replace grandfathered output");
    assertFail(check(repo, head), "grandfathered content changed");
  }

  {
    const decision = exception("evidence/results/decision.json", "decision/provenance", "allow-new", 10240);
    const repo = createRepo([decision]);
    repos.push(repo);
    write(repo.root, "evidence/results/decision.json", "{}\n");
    const head = commit(repo.root, "add small decision record");
    assert.equal(check(repo, head).ok, true, "small decision/provenance JSON passes");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "evidence/results/review.png", "png");
    const head = commit(repo.root, "add visual review image");
    assertFail(check(repo, head), "canonical exception");
  }

  {
    const canonical = exception("evidence/results/canonical.png", "canonical-baseline", "allow-new", 1024);
    const repo = createRepo([canonical]);
    repos.push(repo);
    write(repo.root, "evidence/results/canonical.png", "png");
    const head = commit(repo.root, "add canonical baseline");
    assert.equal(check(repo, head).ok, true, "explicit canonical baseline passes");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "evidence/fixtures/required-large-fixture.json", "x".repeat(LIMIT + 1));
    write(repo.root, "evidence/protocols/required-large-protocol.json", "x".repeat(LIMIT + 1));
    const head = commit(repo.root, "add required fixture and protocol");
    assert.equal(check(repo, head).ok, true, "required fixture and protocol pass");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    const malformed = policyFor(repo.baseTree, repo.baseBlob);
    delete malformed.exceptions[0].owner;
    write(repo.root, POLICY_PATH, JSON.stringify(malformed));
    const head = commit(repo.root, "malform exception metadata");
    const result = check(repo, head);
    assertFail(result, "owner is required");
    assert.ok(validatePolicy(malformed).some(message => message.includes("owner is required")));
  }

  {
    const repo = createRepo();
    repos.push(repo);
    fs.renameSync(path.join(repo.root, "evidence/results/legacy.json"), path.join(repo.root, "evidence/results/renamed.json"));
    const head = commit(repo.root, "rename evidence");
    const result = check(repo, head);
    assert.equal(result.ok, false, "rename is rejected");
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.includes("legacy.json")));
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.includes("renamed.json")));
  }

  {
    const repo = createRepo();
    repos.push(repo);
    fs.rmSync(path.join(repo.root, "evidence/results/legacy.json"));
    const head = commit(repo.root, "delete evidence");
    assertFail(check(repo, head), "deleting tracked evidence is not allowed");
  }

  {
    const repo = createRepo();
    repos.push(repo);
    write(repo.root, "evidence/results/multi-commit.json", "small\n");
    const first = commit(repo.root, "add small raw output");
    write(repo.root, "evidence/results/multi-commit.json", "x".repeat(LIMIT + 1));
    const second = commit(repo.root, "grow raw output in second commit");
    const result = checkEvidenceStorage({ root: repo.root, baseRef: repo.policyHead, headRef: second });
    assertFail(result, "raw/generated JSON exceeds");
    assert.notEqual(first, second, "multiple commits create distinct head");
  }

  console.log("[PASS] evidence storage policy regression coverage");
} finally {
  for (const repo of repos) fs.rmSync(repo.root, { recursive: true, force: true });
}
