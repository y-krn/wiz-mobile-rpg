import assert from "node:assert/strict";
import {
  getScenarioById,
  runCalibratedDepthSimulationTask
} from "../../simulations/sim_depth_material_ev.js";

const scenario = getScenarioById("workshop-empty");
const task = runCalibratedDepthSimulationTask({
  kind: "scenario",
  scenarioId: scenario.id,
  identificationPolicyId: "powder",
  className: "Mage",
  runCount: 50,
  collectVNextObservability: true,
  scenarioOverrides: {
    routePolicy: "partial_information_exploration",
    personaPolicy: {
      exploration: {
        budgetMultiplier: 2.5,
        budgetExtraSteps: 10,
        afterStairsSteps: 4
      }
    }
  }
}, {});

const explorationRows = task.results.flatMap(result =>
  Object.values(result.vnextObservability?.exploration || {})
);
assert.ok(
  explorationRows.some(row => row.meanStepsBeforeStairs > 0 && row.meanStepsAfterStairs > 0),
  "observability simulation must measure both sides of stairs exploration"
);
assert.ok(task.results.every(result => result.vnextObservability?.objectLootLifecycle?.status === "not_modeled"));
console.log("Observability simulation measures stairs before/after exploration: PASS");
