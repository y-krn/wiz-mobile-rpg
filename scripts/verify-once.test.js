import test from "node:test";
import assert from "node:assert/strict";
import { createFingerprint, parseArgs } from "./verify-once.js";

test("parses a named command without shell interpolation", () => {
  const options = parseArgs(["--name", "lint", "--", "npm", "run", "lint"]);
  assert.equal(options.name, "lint");
  assert.deepEqual(options.command, ["npm", "run", "lint"]);
});

test("parses force and custom ledger options", () => {
  const options = parseArgs(["--name", "e2e", "--force", "--ledger", "/tmp/checks.json", "--", "npm", "test"]);
  assert.equal(options.force, true);
  assert.equal(options.ledger, "/tmp/checks.json");
});

test("changes fingerprint when command or changed file evidence changes", async () => {
  const base = { repoRoot: "/repo", head: "abc", files: [], environment: {} };
  const first = await createFingerprint({ ...base, command: ["npm", "run", "lint"] });
  const second = await createFingerprint({ ...base, command: ["npm", "run", "test"] });
  assert.notEqual(first, second);
});
