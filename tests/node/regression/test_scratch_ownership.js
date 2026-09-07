import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const scratchRoot = path.join(repoRoot, "scratch");
const testsRoot = path.join(repoRoot, "tests");
const nodeTestsRoot = path.join(testsRoot, "node");

assert.ok(fs.statSync(path.join(nodeTestsRoot, "run_tests.js")).isFile(), "node test runner must have an explicit owner");

const directoryRules = [
  { root: nodeTestsRoot, path: "unit", pattern: /^test_[a-z0-9_]+\.js$/ },
  { root: nodeTestsRoot, path: "regression", pattern: /^test_[a-z0-9_]+\.js$/ },
  { root: scratchRoot, path: "simulations", pattern: /^(?:sim_[a-z0-9_]+|simulation_(?:manifest|preflight))\.js$/ },
  { root: scratchRoot, path: "measurements", pattern: /^(?:[a-z][a-z0-9]*_[a-z0-9_]+|measurement_[a-z0-9_]+)\.js$/ },
  { root: scratchRoot, path: "benchmarks", pattern: /^bench_[a-z0-9_]+\.js$/ }
];

for (const rule of directoryRules) {
  const absolute = path.join(rule.root, rule.path);
  assert.ok(fs.statSync(absolute).isDirectory(), `${path.relative(repoRoot, absolute)} must be a directory`);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    assert.ok(entry.isFile(), `${path.relative(repoRoot, absolute)}/${entry.name} must be a file`);
    assert.match(entry.name, rule.pattern, `${path.relative(repoRoot, absolute)}/${entry.name} violates ownership naming`);
  }
}

const scratchTopLevelEntries = fs.readdirSync(scratchRoot, { withFileTypes: true })
  .map(entry => entry.name)
  .filter(name => name !== "README.md");
assert.deepEqual(
  scratchTopLevelEntries.sort(),
  ["benchmarks", "measurements", "simulations"],
  "scratch root must contain only experiment/measurement owner directories"
);

const nodeTopLevelEntries = fs.readdirSync(nodeTestsRoot, { withFileTypes: true })
  .map(entry => entry.name);
assert.deepEqual(
  nodeTopLevelEntries.sort(),
  ["fixtures", "regression", "run_tests.js", "unit"],
  "tests/node must contain only owned Node-test assets"
);

const executablePaths = directoryRules.flatMap(rule =>
  fs.readdirSync(path.join(rule.root, rule.path))
    .filter(name => name.endsWith(".js"))
    .map(name => `${path.relative(repoRoot, rule.root).split(path.sep).join("/")}/${rule.path}/${name}`)
);
assert.ok(executablePaths.length > 0, "ownership directories must contain executable assets");
assert.equal(
  executablePaths.filter(file => /(?:^|\/)(?:sim_)?issue[_-]?\d|_\d{3,}\.js$/.test(file)).length,
  0,
  "permanent scratch assets must use Issue-independent semantic names"
);
assert.equal(
  executablePaths.filter(file => /\/test_[a-z0-9_]*issue(?:_|\d)/.test(file)).length,
  0,
  "permanent tests must not use Issue-numbered names"
);

const browserSpecs = fs.readdirSync(testsRoot)
  .filter(name => name.endsWith(".spec.js"));
assert.ok(browserSpecs.length > 0, "root tests directory must retain browser spec entrypoints");
assert.equal(fs.existsSync(path.join(scratchRoot, "tests")), false, "scratch/tests must not be recreated");

for (const directory of ["evidence", "evidence/results", "evidence/fixtures"]) {
  assert.ok(fs.statSync(path.join(repoRoot, directory)).isDirectory(), `${directory} must exist`);
}

console.log(`[PASS] test/scratch ownership covers ${executablePaths.length} executable files`);
