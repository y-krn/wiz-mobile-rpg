import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureDependencies,
  inspectDependencies,
  REQUIRED_PACKAGE
} from "../scripts/dependency-preflight.js";

const lockfile = JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: {} });
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-"));
const packagePath = path.join(tempRoot, "node_modules", "@sentry", "browser", "package.json");
const stampPath = path.join(tempRoot, "node_modules", ".dependency-preflight.json");

function writeLockfile(value = lockfile) {
  writeFileSync(path.join(tempRoot, "package-lock.json"), value);
}

function seedPackage(version = "stale") {
  mkdirSync(path.dirname(packagePath), { recursive: true });
  writeFileSync(packagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version }));
}

function fakeNpmCi(calls, { version = "10.63.0", writePackage = true } = {}) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    if (!writePackage) return;
    mkdirSync(path.dirname(packagePath), { recursive: true });
    writeFileSync(packagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version }));
  };
}

try {
  writeLockfile();

  // Counterfactual: a stale package-only tree is not trusted when the stamp is absent.
  seedPackage();
  const unstampedCalls = [];
  const installed = ensureDependencies({
    root: tempRoot,
    exec: fakeNpmCi(unstampedCalls)
  });
  assert.equal(installed.action, "installed");
  assert.equal(unstampedCalls.length, 1, "stamp-less trees must run npm ci");
  assert.deepEqual(unstampedCalls[0].args, ["ci", "--ignore-scripts"]);
  assert.equal(JSON.parse(readFileSync(packagePath, "utf8")).version, "10.63.0");
  assert.ok(inspectDependencies({ root: tempRoot }).stamp);

  // A matching stamp preserves the fast reuse path.
  const reused = ensureDependencies({
    root: tempRoot,
    exec: () => { throw new Error("npm ci must not repeat for an unchanged lockfile"); }
  });
  assert.equal(reused.action, "reused");

  // A changed lockfile invalidates the stamp and reinstalls.
  const changedCalls = [];
  writeLockfile(`${lockfile}\nchanged`);
  const refreshed = ensureDependencies({ root: tempRoot, exec: fakeNpmCi(changedCalls) });
  assert.equal(refreshed.action, "installed");
  assert.equal(changedCalls.length, 1);

  // Missing package after a nominal install remains an actionable failure.
  const missingAfterInstallRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-missing-"));
  try {
    writeFileSync(path.join(missingAfterInstallRoot, "package-lock.json"), lockfile);
    assert.throws(
      () => ensureDependencies({
        root: missingAfterInstallRoot,
        exec: fakeNpmCi([], { writePackage: false })
      }),
      error => error.message.includes(`${REQUIRED_PACKAGE}/package.json is still missing after npm ci.`) &&
        error.message.includes("npm ci --ignore-scripts") &&
        error.message.includes("rerun")
    );
  } finally {
    rmSync(missingAfterInstallRoot, { recursive: true, force: true });
  }

  // npm ci failures retain the command and recovery instructions.
  const failedRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-failed-"));
  try {
    writeFileSync(path.join(failedRoot, "package-lock.json"), lockfile);
    assert.throws(
      () => ensureDependencies({
        root: failedRoot,
        exec: () => { throw new Error("offline"); }
      }),
      error => error.message.includes("dependency installation failed: offline") &&
        error.message.includes("npm ci --ignore-scripts") &&
        error.message.includes("rerun")
    );
  } finally {
    rmSync(failedRoot, { recursive: true, force: true });
  }

  console.log("issue-850 dependency preflight integrity: PASS");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
