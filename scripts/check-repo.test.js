import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRepo } from "./check-repo.js";

const valid = {
  cwd: "/repo",
  gitRoot: "/repo",
  insideWorkTree: true,
  packageName: "wiz-mobile-rpg",
  head: "abc123",
  markers: ["package.json", "src", "scripts", "vite.config.js", "playwright.config.js"]
};

test("accepts the expected repository identity", () => {
  assert.deepEqual(evaluateRepo(valid), { ok: true, failures: [] });
});

test("rejects a different repository root or package", () => {
  const result = evaluateRepo({ ...valid, gitRoot: "/other", packageName: "other-app" });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes("repository root")));
  assert.ok(result.failures.some((failure) => failure.includes("package name mismatch")));
});

test("rejects incomplete or non-Git worktrees", () => {
  const result = evaluateRepo({ ...valid, insideWorkTree: false, head: "", markers: ["package.json"] });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 6);
});
