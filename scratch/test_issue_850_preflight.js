import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  dependencyPreflight,
  DependencyPreflightError,
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

  // The compatibility wrapper must fail if a legacy installer leaves the
  // required package missing, without creating a misleading stamp.
  const compatibilityMissingRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-compat-missing-"));
  try {
    writeFileSync(path.join(compatibilityMissingRoot, "package-lock.json"), lockfile);
    assert.throws(
      () => dependencyPreflight({
        repoRoot: compatibilityMissingRoot,
        install: () => undefined,
        log: { log() {} }
      }),
      error => error instanceof DependencyPreflightError &&
        error.message.includes(`${REQUIRED_PACKAGE}/package.json is still missing after the compatibility installer.`) &&
        error.message.includes("npm ci --ignore-scripts") &&
        error.message.includes("rerun")
    );
    assert.equal(existsSync(path.join(compatibilityMissingRoot, "node_modules", ".dependency-preflight.json")), false);
  } finally {
    rmSync(compatibilityMissingRoot, { recursive: true, force: true });
  }

  // A no-op legacy installer must not bless an old package-only tree.
  const compatibilityStaleRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-compat-stale-"));
  try {
    writeFileSync(path.join(compatibilityStaleRoot, "package-lock.json"), lockfile);
    const compatibilityPackagePath = path.join(
      compatibilityStaleRoot,
      "node_modules",
      "@sentry",
      "browser",
      "package.json"
    );
    mkdirSync(path.dirname(compatibilityPackagePath), { recursive: true });
    writeFileSync(compatibilityPackagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version: "stale" }));
    assert.throws(
      () => dependencyPreflight({
        repoRoot: compatibilityStaleRoot,
        install: () => undefined,
        log: { log() {} }
      }),
      error => error instanceof DependencyPreflightError &&
        error.message.includes("was unchanged by the compatibility installer") &&
        error.message.includes("npm ci --ignore-scripts") &&
        error.message.includes("rerun")
    );
    assert.equal(existsSync(path.join(compatibilityStaleRoot, "node_modules", ".dependency-preflight.json")), false);
  } finally {
    rmSync(compatibilityStaleRoot, { recursive: true, force: true });
  }

  // A compatibility install that replaces the required package is stamped
  // and reports success, then the matching stamp reuses without installing.
  const compatibilitySuccessRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-850-compat-success-"));
  try {
    writeFileSync(path.join(compatibilitySuccessRoot, "package-lock.json"), lockfile);
    let installCalls = 0;
    const compatibilityInstalled = dependencyPreflight({
      repoRoot: compatibilitySuccessRoot,
      install: root => {
        installCalls += 1;
        const installedPackagePath = path.join(root, "node_modules", "@sentry", "browser", "package.json");
        mkdirSync(path.dirname(installedPackagePath), { recursive: true });
        writeFileSync(installedPackagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version: "10.63.0" }));
        return "legacy-install-ok";
      },
      log: { log() {} }
    });
    assert.equal(compatibilityInstalled.installed, true);
    assert.equal(compatibilityInstalled.ready, true);
    assert.equal(compatibilityInstalled.result, "legacy-install-ok");
    assert.equal(installCalls, 1);
    assert.equal(existsSync(path.join(compatibilitySuccessRoot, "node_modules", ".dependency-preflight.json")), true);

    const compatibilityReused = dependencyPreflight({
      repoRoot: compatibilitySuccessRoot,
      install: () => { throw new Error("matching stamp must not invoke installer"); },
      log: { log() {} }
    });
    assert.equal(compatibilityReused.installed, false);
    assert.equal(compatibilityReused.stampMatches, true);
  } finally {
    rmSync(compatibilitySuccessRoot, { recursive: true, force: true });
  }

  console.log("issue-850 dependency preflight integrity: PASS");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
