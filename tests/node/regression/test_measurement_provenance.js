import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMeasurementProvenance } from "../../../scratch/measurements/measurement_provenance.js";

// Unit runners deliberately skip git-backed provenance assertions because CI
// checkouts may not have an origin/main ref. Direct invocation still exercises
// the real repository provenance check.
if (process.env.SIM_SKIP_PROVENANCE === "1") {
  console.log("SKIP measurement provenance in unit-test process");
  process.exit(0);
}

const failures = [];
function check(label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

function expectRejected(action, pattern) {
  assert.throws(action, pattern);
}

const provenanceEnvKeys = [
  "SIM_PROVENANCE_BASE_REF",
  "SIM_PROVENANCE_BASE_COMMIT",
  "SIM_PROVENANCE_BASE_REF_REASON",
  "SIM_PROVENANCE_TEST_FIXTURE",
  "SIM_PROVENANCE_ALLOW_DIRTY_TREE"
];

function withProvenanceEnv(overrides, callback) {
  const previous = Object.fromEntries(
    provenanceEnvKeys.map(key => [key, process.env[key]])
  );
  provenanceEnvKeys.forEach(key => { delete process.env[key]; });
  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
  try {
    return callback();
  } finally {
    provenanceEnvKeys.forEach(key => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

function createFixture({ dirty = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "measurement-provenance-contract-"));
  const git = args => execFileSync("git", args, { cwd, stdio: "ignore" });
  git(["init", "--initial-branch=main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Measurement Test"]);
  writeFileSync(join(cwd, "runner.txt"), "base\n");
  git(["add", "runner.txt"]);
  git(["commit", "-m", "base"]);
  const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8"
  }).trim();
  git(["update-ref", "refs/remotes/origin/main", baseCommit]);
  writeFileSync(join(cwd, "runner.txt"), "base\nhead\n");
  git(["commit", "-am", "head"]);
  if (dirty) writeFileSync(join(cwd, "runner.txt"), "base\nhead\ndirty\n");
  return { cwd, baseCommit };
}

function withFixture(options, callback) {
  const fixture = createFixture(options);
  try {
    return callback(fixture);
  } finally {
    rmSync(fixture.cwd, { recursive: true, force: true });
  }
}

function fixtureEnv(fixture, overrides = {}) {
  return {
    SIM_PROVENANCE_BASE_REF: "origin/main",
    SIM_PROVENANCE_BASE_COMMIT: fixture.baseCommit,
    SIM_PROVENANCE_BASE_REF_REASON: "generic-provenance-test",
    SIM_PROVENANCE_TEST_FIXTURE: "generic-provenance-test",
    ...overrides
  };
}

const provenance = resolveMeasurementProvenance({ fetchOriginMain: false });
check("source commit", () => {
  if (!/^[0-9a-f]{40}$/.test(provenance.sourceCommit)) {
    throw new Error(`unexpected commit: ${provenance.sourceCommit}`);
  }
});
check("origin/main ancestry", () => {
  if (provenance.originMainAncestor !== true) {
    throw new Error("current test tree is not a descendant of origin/main");
  }
});
check("stale-tree override", () => {
  if (provenance.staleTreeAllowed !== false) {
    throw new Error("stale-tree override unexpectedly active");
  }
});
check("clone-independent runner diff hash", () => {
  const fixtureRoots = [7, 8].map(abbrev => {
    const cwd = mkdtempSync(join(tmpdir(), `measurement-provenance-${abbrev}-`));
    const git = args => execFileSync("git", args, { cwd, stdio: "ignore" });
    git(["init", "--initial-branch=main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Measurement Test"]);
    writeFileSync(join(cwd, "runner.txt"), "base\n");
    git(["add", "runner.txt"]);
    git(["commit", "-m", "base"]);
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    git(["update-ref", "refs/remotes/origin/main", baseCommit]);
    writeFileSync(join(cwd, "runner.txt"), "base\nhead\n");
    git(["commit", "-am", "head"]);
    git(["config", "core.abbrev", String(abbrev)]);
    return cwd;
  });
  try {
    const rawHashes = fixtureRoots.map(cwd => createHash("sha256")
      .update(execFileSync("git", ["diff", "--binary", "origin/main", "HEAD"], { cwd }))
      .digest("hex"));
    if (rawHashes[0] === rawHashes[1]) {
      throw new Error("fixture failed to produce clone-dependent raw diff hashes");
    }
    const provenanceHashes = fixtureRoots.map(cwd => resolveMeasurementProvenance({
      cwd,
      fetchOriginMain: false
    }).measurementRunnerDiffSha256);
    if (provenanceHashes[0] !== provenanceHashes[1]) {
      throw new Error(`clone-dependent provenance hashes: ${provenanceHashes.join(" vs ")}`);
    }
  } finally {
    fixtureRoots.forEach(cwd => rmSync(cwd, { recursive: true, force: true }));
  }
});

check("fixture-less explicit base is rejected", () => withFixture({}, fixture => {
  withProvenanceEnv({
    SIM_PROVENANCE_BASE_REF: "origin/main",
    SIM_PROVENANCE_BASE_COMMIT: fixture.baseCommit
  }, () => {
    expectRejected(
      () => resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false }),
      /explicit base ref\/commit requires an explicit test fixture marker/
    );
  });
}));

check("fixture requires base ref and commit", () => withFixture({}, fixture => {
  for (const key of ["SIM_PROVENANCE_BASE_REF", "SIM_PROVENANCE_BASE_COMMIT"]) {
    const overrides = fixtureEnv(fixture);
    delete overrides[key];
    withProvenanceEnv(overrides, () => {
      expectRejected(
        () => resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false }),
        /test fixture requires SIM_PROVENANCE_BASE_REF and SIM_PROVENANCE_BASE_COMMIT/
      );
    });
  }
}));

check("explicit base requires reason", () => withFixture({}, fixture => {
  const overrides = fixtureEnv(fixture);
  delete overrides.SIM_PROVENANCE_BASE_REF_REASON;
  withProvenanceEnv(overrides, () => {
    expectRejected(
      () => resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false }),
      /explicit base ref origin\/main requires SIM_PROVENANCE_BASE_REF_REASON/
    );
  });
}));

check("invalid base ref is rejected", () => withFixture({}, fixture => {
  withProvenanceEnv(fixtureEnv(fixture, {
    SIM_PROVENANCE_BASE_REF: "refs/remotes/origin/missing"
  }), () => {
    expectRejected(
      () => resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false }),
      /measurement provenance failed: git rev-parse --verify/
    );
  });
}));

check("dirty-tree override is test-fixture-only", () => {
  withFixture({ dirty: true }, fixture => {
    withProvenanceEnv({ SIM_PROVENANCE_ALLOW_DIRTY_TREE: "1" }, () => {
      expectRejected(
        () => resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false }),
        /Only an explicit test fixture may opt in to dirty-tree execution/
      );
    });
    withProvenanceEnv(fixtureEnv(fixture, {
      SIM_PROVENANCE_ALLOW_DIRTY_TREE: "1"
    }), () => {
      const provenance = resolveMeasurementProvenance({ cwd: fixture.cwd, fetchOriginMain: false });
      if (!provenance.workingTreeDirty || !provenance.dirtyTreeAllowed) {
        throw new Error("fixture dirty-tree override was not recorded");
      }
    });
  });
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS measurement provenance");
