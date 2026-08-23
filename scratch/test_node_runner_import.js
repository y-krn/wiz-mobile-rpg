import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const probe = [
  "globalThis.document = undefined;",
  "globalThis.window = undefined;",
  "await import('./src/state.js');",
  "await import('./scratch/sim_depth_material_ev.js');",
].join("\n");
const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
  cwd: process.cwd(),
  env: { ...process.env, SIM_SKIP_PROVENANCE: "1" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `Node runner import failed:\n${result.stderr}`);
assert.doesNotMatch(result.stderr, /@sentry\/browser/, "Node import must not load browser Sentry");
assert.doesNotMatch(
  readFileSync("src/sentry.js", "utf8"),
  /^\s*import[^\n]*@sentry\/browser/m,
  "runtime-neutral Sentry facade must not import browser Sentry"
);
console.log("[PASS] Node state/simulation imports do not require browser Sentry or DOM globals");
