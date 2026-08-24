import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PACKAGE = "@sentry/browser";
export const DEPENDENCY_STAMP_FILE = ".dependency-preflight.json";

export class DependencyPreflightError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "DependencyPreflightError";
  }
}

function hashFile(filePath, fsImpl) {
  return createHash("sha256").update(fsImpl.readFileSync(filePath)).digest("hex");
}

function getPaths(root) {
  return {
    packageLockPath: path.join(root, "package-lock.json"),
    packagePath: path.join(root, "node_modules", "@sentry", "browser", "package.json"),
    stampPath: path.join(root, "node_modules", DEPENDENCY_STAMP_FILE)
  };
}

export function dependencyPaths(root) {
  const paths = getPaths(root);
  return { ...paths, markerPath: paths.stampPath };
}

function readStamp(stampPath, fsImpl) {
  if (!fsImpl.existsSync(stampPath)) return null;
  try {
    const stamp = JSON.parse(fsImpl.readFileSync(stampPath, "utf8"));
    return typeof stamp?.lockfileSha256 === "string" ? stamp : null;
  } catch {
    return null;
  }
}

function writeStamp(stampPath, lockfileSha256, fsImpl) {
  fsImpl.writeFileSync(
    stampPath,
    `${JSON.stringify({ package: REQUIRED_PACKAGE, lockfileSha256 }, null, 2)}\n`,
    "utf8"
  );
}

function packageFingerprint(status, fsImpl) {
  if (!status.ready) return null;
  try {
    return hashFile(status.packagePath, fsImpl);
  } catch {
    return null;
  }
}

function verifyLegacyInstallEvidence(evidence, beforeInstall, afterInstall, packageJsonSha256) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  const dependencyTree = evidence.dependencyTree;
  return evidence.verified === true &&
    evidence.lockfileSha256 === beforeInstall.lockfileSha256 &&
    evidence.lockfileSha256 === afterInstall.lockfileSha256 &&
    dependencyTree?.package === REQUIRED_PACKAGE &&
    dependencyTree.ready === true &&
    dependencyTree.packageJsonSha256 === packageJsonSha256;
}

export function inspectDependencies({ root = process.cwd(), fsImpl = fs } = {}) {
  const { packageLockPath, packagePath, stampPath } = getPaths(root);
  if (!fsImpl.existsSync(packageLockPath)) {
    return {
      ready: false,
      reason: "missing-lockfile",
      packageLockPath,
      packagePath,
      stampPath,
      lockfileSha256: null,
      stamp: null
    };
  }

  const lockfileSha256 = hashFile(packageLockPath, fsImpl);
  const packagePresent = fsImpl.existsSync(packagePath);
  const stamp = readStamp(stampPath, fsImpl);
  return {
    ready: packagePresent,
    reason: packagePresent ? "package-present" : "missing-package",
    packageLockPath,
    packagePath,
    stampPath,
    lockfileSha256,
    stamp,
    stampMatches: stamp?.lockfileSha256 === lockfileSha256
  };
}

function recoveryMessage(root, detail) {
  return [
    `[dependency-preflight] ${detail}`,
    `[dependency-preflight] Recovery: cd ${root} && npm ci --ignore-scripts`,
    "[dependency-preflight] After dependencies are restored, rerun the test or simulation command."
  ].join("\n");
}

export function ensureDependencies({
  root = process.cwd(),
  fsImpl = fs,
  exec = execFileSync,
  log = null
} = {}) {
  const status = inspectDependencies({ root, fsImpl });
  if (!status.lockfileSha256) {
    throw new DependencyPreflightError(recoveryMessage(root, "package-lock.json is missing."));
  }

  if (status.ready && status.stampMatches) {
    log?.("[dependency-preflight] dependencies ready; lockfile unchanged");
    return { ...status, action: "reused" };
  }

  const reason = !status.ready
    ? `${REQUIRED_PACKAGE} is not installed`
    : !status.stamp
      ? "dependency stamp is missing"
      : "package-lock.json changed";
  log?.(`[dependency-preflight] ${reason}; running npm ci --ignore-scripts`);
  try {
    exec("npm", ["ci", "--ignore-scripts"], { cwd: root, stdio: "inherit" });
  } catch (error) {
    throw new DependencyPreflightError(
      recoveryMessage(root, `dependency installation failed: ${error.message}`),
      { cause: error }
    );
  }

  const afterInstall = inspectDependencies({ root, fsImpl });
  if (!afterInstall.ready) {
    throw new DependencyPreflightError(
      recoveryMessage(root, `${REQUIRED_PACKAGE}/package.json is still missing after npm ci.`)
    );
  }

  try {
    writeStamp(afterInstall.stampPath, afterInstall.lockfileSha256, fsImpl);
  } catch (error) {
    throw new DependencyPreflightError(
      recoveryMessage(root, `dependency stamp could not be written: ${error.message}`),
      { cause: error }
    );
  }
  return { ...afterInstall, action: "installed" };
}

export function runDependencyPreflight(options = {}) {
  try {
    return ensureDependencies(options);
  } catch (error) {
    console.error(error.message);
    return null;
  }
}

// Compatibility API for small fixture tests and older local wrappers. Keep
// unstamped trees on the install path just like ensureDependencies. Legacy
// installers must be paired with an independent `verify` callback before a
// stamp is written. The verifier must establish the complete dependency tree
// against the current lockfile (for example, with canonical npm evidence) and
// return this contract. Its evidence is checked against the current filesystem;
// the install callback's return value is never used as verification evidence:
// { verified: true, lockfileSha256, dependencyTree: {
//   package: REQUIRED_PACKAGE, ready: true, packageJsonSha256
// } }. New callers should use ensureDependencies instead.
export function dependencyPreflight({ repoRoot = process.cwd(), install, verify, log = console } = {}) {
  const status = inspectDependencies({ root: repoRoot });
  if (!status.lockfileSha256) {
    throw new DependencyPreflightError(recoveryMessage(repoRoot, "package-lock.json is missing."));
  }

  const markerExists = fs.existsSync(status.stampPath);
  const lockChanged = markerExists && !status.stampMatches;
  if (status.ready && markerExists && !lockChanged) {
    return { installed: false, ...status };
  }
  if (typeof install === "function") {
    log.log?.(`[dependency-preflight] installing dependencies in ${repoRoot}`);
    const beforePackageFingerprint = packageFingerprint(status, fs);
    let result;
    try {
      result = install(repoRoot);
    } catch (error) {
      throw new DependencyPreflightError(
        recoveryMessage(repoRoot, `dependency installation failed: ${error.message}`),
        { cause: error }
      );
    }

    const afterInstall = inspectDependencies({ root: repoRoot });
    if (!afterInstall.ready) {
      throw new DependencyPreflightError(
        recoveryMessage(repoRoot, `${REQUIRED_PACKAGE}/package.json is still missing after the compatibility installer.`)
      );
    }

    let evidence = null;
    if (typeof verify === "function") {
      try {
        evidence = verify({
          root: repoRoot,
          beforeInstall: status,
          afterInstall
        });
      } catch (error) {
        throw new DependencyPreflightError(
          recoveryMessage(repoRoot, `independent dependency verification failed: ${error.message}`),
          { cause: error }
        );
      }
    }

    const verifiedInstall = inspectDependencies({ root: repoRoot });
    if (!verifiedInstall.ready) {
      throw new DependencyPreflightError(
        recoveryMessage(repoRoot, `${REQUIRED_PACKAGE}/package.json is missing after independent dependency verification.`)
      );
    }
    const verifiedPackageFingerprint = packageFingerprint(verifiedInstall, fs);
    if (!verifyLegacyInstallEvidence(evidence, status, verifiedInstall, verifiedPackageFingerprint)) {
      throw new DependencyPreflightError(
        recoveryMessage(
          repoRoot,
          status.ready && beforePackageFingerprint === verifiedPackageFingerprint
            ? `${REQUIRED_PACKAGE}/package.json was unchanged by the compatibility installer; an independent verifier must establish a valid dependency tree before a same-byte reinstall can be stamped.`
            : "the compatibility installer did not have independent lockfile and dependency-tree verification; provide the documented verifier callback and structured evidence."
        )
      );
    }

    try {
      writeStamp(verifiedInstall.stampPath, verifiedInstall.lockfileSha256, fs);
    } catch (error) {
      throw new DependencyPreflightError(
        recoveryMessage(repoRoot, `dependency stamp could not be written: ${error.message}`),
        { cause: error }
      );
    }
    return { installed: true, result, ...verifiedInstall };
  }
  const result = ensureDependencies({ root: repoRoot, log: message => log.log?.(message) });
  return { installed: result.action === "installed", ...result };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const separator = process.argv.indexOf("--");
  const command = separator === -1 ? [] : process.argv.slice(separator + 1);
  const preflight = runDependencyPreflight();
  if (!preflight) {
    process.exitCode = 1;
  } else if (command.length > 0) {
    const result = spawnSync(command[0], command.slice(1), { stdio: "inherit", cwd: process.cwd() });
    process.exitCode = result.status ?? 1;
  }
}
