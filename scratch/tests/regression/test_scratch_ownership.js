import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const scratchRoot = path.join(repoRoot, "scratch");
assert.ok(fs.statSync(path.join(scratchRoot, "tests/run_tests.js")).isFile(), "test runner must have an explicit owner");

const directoryRules = [
  { path: "tests/unit", pattern: /^test_[a-z0-9_]+\.js$/ },
  { path: "tests/regression", pattern: /^test_[a-z0-9_]+\.js$/ },
  { path: "simulations", pattern: /^(?:sim_[a-z0-9_]+|simulation_(?:manifest|preflight))\.js$/ },
  { path: "measurements", pattern: /^(?:[a-z][a-z0-9]*_[a-z0-9_]+|measurement_[a-z0-9_]+)\.js$/ },
  { path: "benchmarks", pattern: /^bench_[a-z0-9_]+\.js$/ }
];

for (const rule of directoryRules) {
  const absolute = path.join(scratchRoot, rule.path);
  assert.ok(fs.statSync(absolute).isDirectory(), `${rule.path} must be a directory`);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    assert.ok(entry.isFile(), `${rule.path}/${entry.name} must be a file`);
    assert.match(entry.name, rule.pattern, `${rule.path}/${entry.name} violates ownership naming`);
  }
}

const topLevelEntries = fs.readdirSync(scratchRoot, { withFileTypes: true })
  .map(entry => entry.name)
  .filter(name => name !== "README.md");
assert.deepEqual(
  topLevelEntries.sort(),
  ["benchmarks", "measurements", "simulations", "tests"],
  "scratch root must contain only owned directories"
);

const executablePaths = directoryRules.flatMap(rule =>
  fs.readdirSync(path.join(scratchRoot, rule.path))
    .filter(name => name.endsWith(".js"))
    .map(name => `${rule.path}/${name}`)
);
assert.ok(executablePaths.length > 0, "ownership directories must contain executable assets");
assert.equal(
  executablePaths.filter(file => /\/test_[a-z0-9_]*issue(?:_|\d)/.test(file)).length,
  0,
  "permanent tests must not use Issue-numbered names"
);

for (const directory of ["evidence", "evidence/results", "evidence/fixtures"]) {
  assert.ok(fs.statSync(path.join(repoRoot, directory)).isDirectory(), `${directory} must exist`);
}

console.log(`[PASS] scratch ownership covers ${executablePaths.length} executable files`);
