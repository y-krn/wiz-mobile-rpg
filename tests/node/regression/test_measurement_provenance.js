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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("PASS measurement provenance");
