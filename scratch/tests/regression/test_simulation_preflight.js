import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parse } from "espree";
import {
  mkdtempSync,
  mkdirSync,
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
} from "../../../scripts/dependency-preflight.js";
import {
  classifySimulationRunner,
  discoverSimulationRunnerFiles
} from "../../simulations/simulation_manifest.js";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);

function hasOrderedEntrypointPreflight(source) {
  const program = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const firstStatement = program.body[0];
  return firstStatement?.type === "ImportDeclaration" &&
    ["./simulation_preflight.js", "../simulations/simulation_preflight.js"].includes(firstStatement.source.value);
}

const manifestSimEntrypoints = discoverSimulationRunnerFiles()
  .filter(file => classifySimulationRunner(file)?.scope !== "infra");
const unguardedManifestSimEntrypoints = manifestSimEntrypoints.filter(file =>
  !hasOrderedEntrypointPreflight(readFileSync(path.resolve(repoRoot, file), "utf8"))
);
assert.ok(manifestSimEntrypoints.length > 0, "manifest must discover simulation entrypoints");
assert.deepEqual(
  unguardedManifestSimEntrypoints,
  [],
  "every direct manifest runner must import dependency preflight before runner setup"
);

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-824-"));
const lockfile = JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: {} });
const packagePath = path.join(tempRoot, "node_modules", "@sentry", "browser", "package.json");

function writeLockfile(value = lockfile) {
  writeFileSync(path.join(tempRoot, "package-lock.json"), value);
}

function fakeNpmCi(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    mkdirSync(path.dirname(packagePath), { recursive: true });
    writeFileSync(packagePath, JSON.stringify({ name: REQUIRED_PACKAGE, version: "10.63.0" }));
  };
}

try {
  writeLockfile();
  const installCalls = [];
  const installed = ensureDependencies({
    root: tempRoot,
    exec: fakeNpmCi(installCalls)
  });
  assert.equal(installed.action, "installed");
  assert.equal(installCalls.length, 1);
  assert.deepEqual(installCalls[0].args, ["ci", "--ignore-scripts"]);
  assert.equal(inspectDependencies({ root: tempRoot }).ready, true);
  assert.match(readFileSync(path.join(tempRoot, "node_modules", ".dependency-preflight.json"), "utf8"), /lockfileSha256/);

  const reused = ensureDependencies({
    root: tempRoot,
    exec: () => { throw new Error("npm ci must not repeat for an unchanged lockfile"); }
  });
  assert.equal(reused.action, "reused");

  const changedCalls = [];
  writeLockfile(`${lockfile}\nchanged`);
  const refreshed = ensureDependencies({ root: tempRoot, exec: fakeNpmCi(changedCalls) });
  assert.equal(refreshed.action, "installed");
  assert.equal(changedCalls.length, 1);

  const failedRoot = mkdtempSync(path.join(os.tmpdir(), "wiz-issue-824-failed-"));
  try {
    writeFileSync(path.join(failedRoot, "package-lock.json"), lockfile);
    assert.throws(
      () => ensureDependencies({
        root: failedRoot,
        exec: () => { throw new Error("offline"); }
      }),
      error => error.message.includes("npm ci --ignore-scripts") && error.message.includes("rerun")
    );
  } finally {
    rmSync(failedRoot, { recursive: true, force: true });
  }

  const nodeImport = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    "await import('./src/state.js'); await import('./src/sentry.js'); console.log('node-import-ok');"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, VITE_SENTRY_DSN: "https://example.invalid/1" }
  });
  assert.equal(nodeImport.status, 0, nodeImport.stderr);
  assert.match(nodeImport.stdout, /node-import-ok/);
  assert.doesNotMatch(nodeImport.stderr, /@sentry\/browser|document is not defined|window is not defined/);

  console.log("issue-824 dependency preflight and Node Sentry import: PASS");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
