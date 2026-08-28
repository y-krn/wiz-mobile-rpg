import assert from "node:assert/strict";

process.env.SIM_SEED = "231";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_RUNS = "1";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SCENARIOS = "workshop-empty";

const { simulateRun } = await import("../../simulations/sim_depth_material_ev.js");

const runConfig = {
  className: "Fighter",
  startFloor: 1,
  targetDepth: 3,
  runIndex: 0,
  seriesId: "lethal-smash-regression",
  scoringProfile: null,
  scenario: {
    chestTrapPolicy: "legacy",
    trapPolicy: "disabled",
    hpBaseBonus: -10
  },
  encounterRateOverride: () => 0
};

const first = simulateRun(runConfig);
const second = simulateRun(runConfig);

assert.equal(first.outcome, "death");
assert.equal(first.deathEncounterType, "secret-room-chest-trap");
assert.equal(first.finalHp, 0);
assert.equal(first.chestForcedByFloor[1], 5);
assert.equal(first.chestsOpened, 10);
assert.equal(first.chestsOpenedInRun, first.chestsOpened);

// The deterministic lethal chest awards neither its generated materials nor
// its rewards/current-run records. These values cover the preceding live
// chest awards and make a post-death award regression observable.
assert.equal(first.materialAcquiredBySource.chest, 20);
assert.equal(first.carriedMaterials, 20);
assert.equal(first.equipmentFoundBySource.chest, 4);

assert.deepEqual(
  {
    outcome: first.outcome,
    deathEncounterType: first.deathEncounterType,
    chestsOpened: first.chestsOpened,
    chestsOpenedInRun: first.chestsOpenedInRun,
    materialAcquiredBySource: first.materialAcquiredBySource,
    carriedMaterials: first.carriedMaterials,
    equipmentFoundBySource: first.equipmentFoundBySource,
    chestForcedByFloor: first.chestForcedByFloor
  },
  {
    outcome: second.outcome,
    deathEncounterType: second.deathEncounterType,
    chestsOpened: second.chestsOpened,
    chestsOpenedInRun: second.chestsOpenedInRun,
    materialAcquiredBySource: second.materialAcquiredBySource,
    carriedMaterials: second.carriedMaterials,
    equipmentFoundBySource: second.equipmentFoundBySource,
    chestForcedByFloor: second.chestForcedByFloor
  }
);

console.log("[PASS] deterministic lethal smash-equivalent chest stops material/reward accounting");
