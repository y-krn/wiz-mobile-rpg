import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(".");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.scripts.simulation, "tsx scratch/simulations/sim_depth_material_ev.js");
assert.equal(packageJson.scripts["measure:balance"], "tsx scratch/measurements/measure_balance.js");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const simulationEnv = { ...process.env, ISSUE624_SMOKE: "1", SIM_RUNS: "1", SIM_CALIBRATION_RUNS: "1", SIM_SKIP_PROVENANCE: "1" };
delete simulationEnv.SIM_PARALLEL;
delete simulationEnv.SIM_PRESET;

function runNpm(args, env) {
  return spawnSync(npmCommand, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000
  });
}

const simulation = runNpm(["run", "simulation", "--silent"], simulationEnv);
assert.equal(simulation.status, 0, `${simulation.stdout}\n${simulation.stderr}`);
assert.match(simulation.stdout, /ISSUE697_MEASUREMENT_JSON=/);

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiz-cli-tsx-"));
const partialOutput = path.join(outputDir, "balance-shard.json");
const measurementEnv = { ...process.env };
delete measurementEnv.SIM_PARALLEL;
delete measurementEnv.SIM_SKIP_PROVENANCE;
try {
  const measurement = runNpm([
    "run", "measure:balance", "--silent", "--",
    "--runs", "500",
    "--calibration-runs", "1",
    "--partial-output", partialOutput,
    "--shard-index", "0",
    "--shard-count", "12"
  ], measurementEnv);
  assert.equal(measurement.status, 0, `${measurement.stdout}\n${measurement.stderr}`);
  assert.match(measurement.stdout, /Wrote standard balance measurement shard:/);
  const shard = JSON.parse(fs.readFileSync(partialOutput, "utf8"));
  assert.equal(shard.execution.taskCount, 1);
  assert.equal(shard.configuration.runs, 500);
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

console.log("[PASS] npm simulation and measure:balance execute through tsx");
