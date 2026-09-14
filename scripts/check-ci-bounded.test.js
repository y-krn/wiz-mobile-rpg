import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs, summarizeChecks } from "./check-ci-bounded.js";

test("parseArgs applies bounded polling options", () => {
  assert.deepEqual(parseArgs(["1285", "--repo", "owner/repo", "--max-attempts", "3", "--interval-seconds", "2", "--max-seconds", "20"]), {
    target: "1285",
    repo: "owner/repo",
    attempts: 3,
    intervalSeconds: 2,
    maxSeconds: 20
  });
});

test("defaults cover the observed full unit-check duration", () => {
  const options = parseArgs([]);
  assert.equal(options.attempts, 36);
  assert.equal(options.intervalSeconds, 10);
  assert.equal(options.maxSeconds, 360);
});

test("summarizeChecks separates pending and failures", () => {
  const summary = summarizeChecks([
    { name: "lint", bucket: "pass" },
    { name: "unit", bucket: "pending" },
    { name: "browser", bucket: "fail" },
    { name: "docs", bucket: "skipping" }
  ]);
  assert.deepEqual(summary.buckets, { pass: 1, fail: 1, pending: 1, skipping: 1, cancel: 0, unknown: 0 });
  assert.equal(summary.failures[0].name, "browser");
  assert.equal(summary.pending[0].name, "unit");
  assert.equal(summary.complete, false);
});

test("unknown statuses remain unresolved", () => {
  const summary = summarizeChecks([{ name: "new-state", state: "waiting_for_runner" }]);
  assert.equal(summary.buckets.unknown, 1);
  assert.equal(summary.pending[0].name, "new-state");
  assert.equal(summary.complete, false);
});
