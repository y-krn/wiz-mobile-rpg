import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const probe = String.raw`
  const { runCalibratedDepthSimulationTask, resolveBuildFixtureIds } = await import("./scratch/simulations/sim_depth_material_ev.js");
  const fixtureId = "medium-multi-rune";
  if (resolveBuildFixtureIds()[0] !== "light-shield") throw new Error("fixture registry order changed");
  const task = runCalibratedDepthSimulationTask({
    kind: "scenario",
    scenarioId: "workshop-empty",
    fixtureId,
    identificationPolicyId: "powder",
    runCount: 1
  }, {});
  for (const result of task.results) {
    if (result.runs !== 1 || result.axisType !== "build-fixture" || result.outcomesByClass[fixtureId].runs !== 1) {
      throw new Error(JSON.stringify({ targetDepth: result.targetDepth, runs: result.runs, outcomesByClass: result.outcomesByClass }));
    }
    for (const [className, outcome] of Object.entries(result.outcomesByClass)) {
      if (className !== fixtureId && outcome.runs !== 0) {
        throw new Error(JSON.stringify({ targetDepth: result.targetDepth, className, runs: outcome.runs }));
      }
    }
  }
`;
const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SIM_SKIP_PROVENANCE: "1",
    SIM_RUNS: "1",
    SIM_CALIBRATION_RUNS: "1",
    SIM_SEED: "843",
    SIM_SCENARIOS: "workshop-empty"
  },
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr || result.stdout);
console.log("[PASS] canonical build fixture axis isolates selected fixture");
