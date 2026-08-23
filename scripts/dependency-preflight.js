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

  // Existing installs from before this preflight may not have a stamp. Trust
  // the required package once, then record the lockfile to avoid npm ci loops.
  if (status.ready && !status.stamp) {
    writeStamp(status.stampPath, status.lockfileSha256, fsImpl);
    log?.("[dependency-preflight] dependencies ready; recorded lockfile stamp");
    return { ...status, action: "stamped" };
  }

  if (status.ready && status.stampMatches) {
    log?.("[dependency-preflight] dependencies ready; lockfile unchanged");
    return { ...status, action: "reused" };
  }

  const reason = status.ready ? "package-lock.json changed" : `${REQUIRED_PACKAGE} is not installed`;
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

// Compatibility API for small fixture tests and older local wrappers. New
// runners use ensureDependencies so the required package.json is verified.
export function dependencyPreflight({ repoRoot = process.cwd(), install, log = console } = {}) {
  const status = inspectDependencies({ root: repoRoot });
  const markerExists = fs.existsSync(status.stampPath);
  const lockChanged = markerExists && !status.stampMatches;
  if (status.ready && !lockChanged) {
    return { installed: false, ...status };
  }
  if (typeof install === "function") {
    log.log?.(`[dependency-preflight] installing dependencies in ${repoRoot}`);
    const result = install(repoRoot);
    const afterInstall = inspectDependencies({ root: repoRoot });
    if (!afterInstall.stamp) writeStamp(afterInstall.stampPath, afterInstall.lockfileSha256, fs);
    return { installed: true, result, ...inspectDependencies({ root: repoRoot }) };
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
