import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  REQUIRED_PACKAGE
} from "../scripts/dependency-preflight.js";

const lockfile = JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: {} });

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function createFixture(prefix, { packageJson = null } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFileSync(path.join(root, "package-lock.json"), lockfile);
  if (packageJson) {
    const packagePath = path.join(root, "node_modules", "@sentry", "browser", "package.json");
    mkdirSync(path.dirname(packagePath), { recursive: true });
    writeFileSync(packagePath, packageJson);
  }
  return root;
}

function verifiedContract(root, packagePath) {
  return {
    verified: true,
    lockfileSha256: sha256(path.join(root, "package-lock.json")),
    dependencyTree: {
      package: REQUIRED_PACKAGE,
      ready: true,
      packageJsonSha256: sha256(packagePath)
    }
  };
}

function assertRecoveryFailure(callback, expectedText) {
  assert.throws(
    callback,
    error => error instanceof DependencyPreflightError &&
      error.message.includes(expectedText) &&
      error.message.includes("npm ci --ignore-scripts") &&
      error.message.includes("rerun")
  );
}

const roots = [];
try {
  // Same-byte reinstall: the installer repairs another tree entry and returns
  // evidence tied to the current lockfile and required package metadata.
  const sameByteRoot = createFixture("wiz-issue-854-same-byte-", {
    packageJson: JSON.stringify({ name: REQUIRED_PACKAGE, version: "10.63.0" })
  });
  roots.push(sameByteRoot);
  const sameBytePackagePath = path.join(sameByteRoot, "node_modules", "@sentry", "browser", "package.json");
  let sameByteInstallCalls = 0;
  const sameByteResult = dependencyPreflight({
    repoRoot: sameByteRoot,
    install: root => {
      sameByteInstallCalls += 1;
      writeFileSync(path.join(root, "node_modules", ".tree-repaired"), "verified");
      return verifiedContract(root, sameBytePackagePath);
    },
    log: { log() {} }
  });
  assert.equal(sameByteResult.installed, true);
  assert.equal(sameByteInstallCalls, 1);
  assert.equal(sameByteResult.result.verified, true);
  assert.equal(existsSync(path.join(sameByteRoot, "node_modules", ".dependency-preflight.json")), true);

  // A matching stamp reuses the tree and does not invoke the legacy installer.
  const reused = dependencyPreflight({
    repoRoot: sameByteRoot,
    install: () => { throw new Error("matching stamp must not invoke installer"); },
    log: { log() {} }
  });
  assert.equal(reused.installed, false);
  assert.equal(reused.stampMatches, true);

  // A no-op installer cannot turn a package-only tree into a stamped tree.
  const noOpRoot = createFixture("wiz-issue-854-no-op-", {
    packageJson: JSON.stringify({ name: REQUIRED_PACKAGE, version: "stale" })
  });
  roots.push(noOpRoot);
  assertRecoveryFailure(
    () => dependencyPreflight({ repoRoot: noOpRoot, install: () => undefined, log: { log() {} } }),
    "was unchanged by the compatibility installer"
  );
  assert.equal(existsSync(path.join(noOpRoot, "node_modules", ".dependency-preflight.json")), false);

  // Even a changed package is rejected when the legacy callback returns a
  // bare truthy/string result instead of verifiable evidence.
  const unverifiedRoot = createFixture("wiz-issue-854-unverified-", {
    packageJson: JSON.stringify({ name: REQUIRED_PACKAGE, version: "stale" })
  });
  roots.push(unverifiedRoot);
  const unverifiedPackagePath = path.join(unverifiedRoot, "node_modules", "@sentry", "browser", "package.json");
  assertRecoveryFailure(
    () => dependencyPreflight({
      repoRoot: unverifiedRoot,
      install: () => {
        writeFileSync(unverifiedPackagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version: "10.63.0" }));
        return "legacy-install-ok";
      },
      log: { log() {} }
    }),
    "did not provide verifiable lockfile and dependency-tree evidence"
  );
  assert.equal(existsSync(path.join(unverifiedRoot, "node_modules", ".dependency-preflight.json")), false);

  // A stale package-only tree also fails when the result has the wrong lockfile
  // SHA or claims an unready dependency tree; neither case may be stamped.
  const staleRoot = createFixture("wiz-issue-854-stale-", {
    packageJson: JSON.stringify({ name: REQUIRED_PACKAGE, version: "stale" })
  });
  roots.push(staleRoot);
  const stalePackagePath = path.join(staleRoot, "node_modules", "@sentry", "browser", "package.json");
  assertRecoveryFailure(
    () => dependencyPreflight({
      repoRoot: staleRoot,
      install: () => ({
        verified: true,
        lockfileSha256: "stale-lockfile-sha",
        dependencyTree: {
          package: REQUIRED_PACKAGE,
          ready: false,
          packageJsonSha256: sha256(stalePackagePath)
        }
      }),
      log: { log() {} }
    }),
    "was unchanged by the compatibility installer"
  );
  assert.equal(existsSync(path.join(staleRoot, "node_modules", ".dependency-preflight.json")), false);

  console.log("issue-854 legacy installer verification: PASS");
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
