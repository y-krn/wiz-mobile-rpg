import assert from "node:assert/strict";

const {
  getScenarioById,
  simulateRun,
  PARTIAL_INFORMATION_ELITE_POLICY_VALIDATION
} = await import(
  "../../../scratch/simulations/sim_depth_material_ev.js"
);

function runWithElitePolicy(elitePolicy) {
  const baseScenario = getScenarioById("workshop-empty");
  const scenario = {
    ...baseScenario,
    routePolicy: "partial_information_exploration",
    elitePolicy,
    personaPolicy: {
      exploration: {
        budgetMultiplier: 2.5,
        budgetExtraSteps: 10,
        afterStairsSteps: 4
      }
    }
  };
  return simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 4,
    runIndex: 0,
    seriesId: "partial-information-elite-policy-isolation",
    worldSeed: "partial-information-elite-policy-isolation:seed",
    scenario,
    workshop: scenario.workshop
  });
}

const avoid = runWithElitePolicy("avoid");
const engage = runWithElitePolicy("engage");

for (const result of [avoid, engage]) {
  assert.deepEqual(
    result.elitePolicyValidation,
    PARTIAL_INFORMATION_ELITE_POLICY_VALIDATION,
    "partial-information elite policy must not claim a production observation boundary"
  );
  assert.equal(result.eliteOpportunities, null, "hidden elite opportunities stay unobserved");
  assert.equal(result.eliteEncounters, 0, "unvalidated elite policy schedules no oracle encounter");
}

function withoutElitePolicyMetadata(result) {
  const comparable = structuredClone(result);
  delete comparable.elitePolicy;
  delete comparable.elitePolicyValidation;
  return comparable;
}

assert.deepEqual(
  withoutElitePolicyMetadata(avoid),
  withoutElitePolicyMetadata(engage),
  "partial-information avoid and engage must be policy-isolated when elite observation is unavailable"
);

console.log("partial-information elite policy isolation regression passed");
