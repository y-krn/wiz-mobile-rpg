import assert from "node:assert/strict";

import {
  DEPTHS,
  SCALING_POLICIES,
  SCENARIOS,
  resolveScaling,
  runDepthScalingDiagnostic
} from "../../../scratch/measurements/depth_scaling_diagnostic.js";
import { getDepthScaling } from "../../../src/rules/depth_scaling.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";

assert.deepEqual(DEPTHS, [1, 5, 10, 20, 30]);
assert.deepEqual(Object.keys(SCALING_POLICIES), ["currentProduction", "vNextCandidate"]);
assert.equal(SCENARIOS.length, 4);
assert.deepEqual(resolveScaling("vNextCandidate", 5), {
  policyId: "vNextCandidate",
  floor: 5,
  tier: 1,
  hp: 1.2,
  atk: 1.1,
  def: 1,
  reward: null,
  source: "diagnostic policy: 1 + HP 0.20 × Tier; ATK 0.10 × Tier; DEF fixed"
});
const tierOneAtB5 = resolveScaling("vNextCandidate", 5);
assert.deepEqual({ ...tierOneAtB5, floor: 9 }, resolveScaling("vNextCandidate", 9));
assert.equal(resolveScaling("vNextCandidate", 30).hp, 2);
assert.equal(resolveScaling("vNextCandidate", 30).atk, 1.5);
assert.equal(resolveScaling("vNextCandidate", 30).def, 1);
assert.equal(resolveScaling("currentProduction", 1).hp, getDepthScaling(1).enemy);
assert.equal(resolveScaling("currentProduction", 30).def, 1 + (getDepthScaling(30).enemy - 1) * 0.34);

assert.ok(MEASUREMENT_IDS.includes("depth-scaling-diagnostic"));
const invocation = resolveRunnerInvocation({
  measurement: "depth-scaling-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1582-test"
});
assert.equal(invocation.runner, "scratch/measurements/depth_scaling_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

const result = await runDepthScalingDiagnostic({ runs: 3, seed: 1582, allowSmallRunCount: true });
assert.equal(result.measurementId, "depth-scaling-diagnostic");
assert.equal(result.rows.length, 70);
assert.equal(result.specializationDiffs.length, 30);
assert.equal(result.rows.every(row => row.runs === 3 && row.invariant), true);
assert.equal(result.rows.every(row => row.confidence === "runner-correctness-only"), true);
assert.deepEqual(result.configuration.tiers, [
  { depth: 1, tier: 0 },
  { depth: 5, tier: 1 },
  { depth: 10, tier: 2 },
  { depth: 20, tier: 4 },
  { depth: 30, tier: 5 }
]);
assert.equal(result.rows.filter(row => row.scenarioId === "high-def-sword-vs-mace").length, 20);
assert.equal(result.rows.filter(row => row.scenarioId === "physical-small-vs-large-shield").length, 20);
assert.equal(result.rows.filter(row => row.scenarioId === "arcane-small-vs-magic-shield").length, 20);
assert.equal(result.rows.find(row => row.policyId === "vNextCandidate" && row.depth === 30).enemyMultipliers.def, 1);
assert.equal(result.rows.find(row => row.policyId === "vNextCandidate" && row.depth === 30).enemyMultipliers.hp, 2);
assert.equal(result.rows.find(row => row.policyId === "vNextCandidate" && row.depth === 30).enemyMultipliers.atk, 1.5);

console.log("[PASS] Issue #1582 depth scaling diagnostic contract and bounded smoke");
