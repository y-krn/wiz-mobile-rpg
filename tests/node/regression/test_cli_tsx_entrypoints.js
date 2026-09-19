import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(".");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.scripts.simulation, "node --import tsx/esm scratch/simulations/sim_depth_material_ev.js");
assert.equal(packageJson.scripts["measure:balance"], "node --import tsx/esm scratch/measurements/measure_balance.js");

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

const measurement = runNpm(["run", "measure:balance", "--silent", "--", "--help"], process.env);
assert.equal(measurement.status, 0, `${measurement.stdout}\n${measurement.stderr}`);
assert.match(`${measurement.stdout}\n${measurement.stderr}`, /Usage:/);

console.log("[PASS] npm simulation and measure:balance execute through tsx");
