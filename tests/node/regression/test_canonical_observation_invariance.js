import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";

const {
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("../../../scratch/simulations/sim_depth_material_ev.js");

const scenario = {
  ...getScenarioById("workshop-empty"),
  departureCraftMeasurement: true,
  hpBaseBonus: 1000
};

const gameplayFields = [
  "reachedFloor",
  "endFloor",
  "deathFloor",
  "survived",
  "died",
  "outcome",
  "finalLevel",
  "expGained",
  "deathCause",
  "deathEncounterType",
  "deathSnapshot",
  "finalCoreIds",
  "finalRecoveryPotions",
  "finalStatusCureInventory",
  "materialAcquired",
  "materialConsumed",
  "carriedMaterials",
  "bankedMaterials",
  "timeCost",
  "battles",
  "trapEncounterCount",
  "trapDamageHp",
  "fleeCount",
  "townPortalsUsed",
  "mpDepleted"
];

function runCanonicalObservation(collectCombatFormula) {
  resetSimulationRandom(1438);
  return simulateRun({
    fixtureId: "exploration-support",
    startFloor: 1,
    targetDepth: 8,
    runIndex: 1,
    seriesId: "canonical-observation-invariance",
    scoringProfile: null,
    scenario,
    workshop: scenario.workshop,
    collectCombatFormula
  });
}

const off = runCanonicalObservation(false);
const on = runCanonicalObservation(true);

assert.deepEqual(
  Object.fromEntries(gameplayFields.map(field => [field, on[field]])),
  Object.fromEntries(gameplayFields.map(field => [field, off[field]])),
  "collectCombatFormula must not change canonical gameplay outcome"
);
assert.equal(off.combatFormula, null, "telemetry must be absent when collection is off");
assert.ok(on.combatFormula, "telemetry must be observed when collection is on");
assert.ok(
  Object.values(on.combatFormula).some(value => Array.isArray(value) && value.length > 0),
  "canonical combat telemetry must contain an observed event"
);

console.log("[PASS] canonical collectCombatFormula observation invariance and ON-only telemetry");
