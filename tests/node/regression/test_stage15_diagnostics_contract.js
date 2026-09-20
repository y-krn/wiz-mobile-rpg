import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";

const { getScenarioById, simulateRun } = await import(
  "../../../scratch/simulations/sim_depth_material_ev.js"
);

function runCanonicalStage15(collectStage15Diagnostics) {
  const baseScenario = getScenarioById("workshop-empty");
  const scenario = {
    ...baseScenario,
    routePolicy: "partial_information_exploration",
    collectStage15Diagnostics,
    personaPolicy: {
      exploration: {
        budgetMultiplier: 2.5,
        budgetExtraSteps: 10,
        afterStairsSteps: 4
      }
    }
  };
  return simulateRun({
    className: "Mage",
    startFloor: 1,
    targetDepth: 2,
    runIndex: 0,
    seriesId: "stage15-diagnostics-contract",
    worldSeed: "stage15-diagnostics-contract:seed",
    scenario,
    workshop: scenario.workshop
  });
}

const off = runCanonicalStage15(false);
assert.equal(off.stage15Diagnostics, null, "Stage 1.5 diagnostics default off");

const on = runCanonicalStage15(true);
assert.ok(on.stage15Diagnostics, "Stage 1.5 diagnostics enabled");
const floors = Object.values(on.stage15Diagnostics.byFloor);
assert.ok(floors.length > 0, "observed floor diagnostics are generated");
for (const floor of floors) {
  assert.equal(
    floor.entered,
    floor.reachedNextFloor + floor.died + floor.incomplete,
    "floor terminal partition is self-consistent"
  );
  for (const field of [
    "mpSpent",
    "mpRecovered",
    "damageTaken",
    "rounds",
    "enemyActions",
    "normalHits",
    "normalDamage"
  ]) {
    assert.ok(floor[field] >= 0, `${field} is non-negative`);
  }
}
for (const spell of Object.values(on.stage15Diagnostics.spellUsage)) {
  assert.ok(spell.castCount >= spell.successfulCasts, "successful casts do not exceed casts");
  assert.ok(spell.totalMpSpent >= 0, "spell MP spent is non-negative");
}
assert.equal(JSON.stringify(on).includes("encounterTrace"), false);

const repeat = runCanonicalStage15(true);
assert.deepEqual(
  repeat.stage15Diagnostics,
  on.stage15Diagnostics,
  "canonical Stage 1.5 diagnostics are deterministic for the same seed"
);

console.log("[PASS] canonical Stage 1.5 diagnostics ON/OFF and determinism contract");
