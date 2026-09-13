import assert from "node:assert/strict";

process.env.SIM_SEED = "231";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_RUNS = "1";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SCENARIOS = "workshop-empty";

const { simulateRun } = await import("../../../scratch/simulations/sim_depth_material_ev.js");

const runConfig = {
  className: "Fighter",
  // Keep this lethal chest fixture on the first floor where the production
  // chest-trap grammar is still active after the #1233 B1F introduction
  // delay.
  startFloor: 2,
  targetDepth: 4,
  runIndex: 2,
  seriesId: "lethal-smash-regression",
  scoringProfile: null,
  scenario: {
    chestTrapPolicy: "legacy",
    trapPolicy: "disabled",
    // The #1009 role-targeted affix supply changes the deterministic loot
    // path; keep the fixture's purpose (a lethal chest trap) at the new
    // threshold rather than restoring the old affix selection.
    hpBaseBonus: -12
  },
  encounterRateOverride: () => 0
};

const first = simulateRun(runConfig);
const second = simulateRun(runConfig);

assert.equal(first.outcome, "death");
assert.equal(first.deathEncounterType, "chest-trap");
assert.equal(first.finalHp, 0);
assert.equal(first.chestForcedByFloor[2], 2);
// #1078's cumulative Rune supply changes the deterministic reward choices
// before the lethal chest; the fixture still asserts the lethal stop and
// current-run accounting boundary at the production baseline cadence.
assert.equal(first.chestsOpened, 2);
assert.equal(first.chestsOpenedInRun, first.chestsOpened);

// The deterministic lethal chest awards neither its generated materials nor
// its rewards/current-run records. These values cover the preceding live
// chest awards and make a post-death award regression observable.
assert.equal(first.materialAcquiredBySource.chest, 3);
assert.equal(first.carriedMaterials, 3);
assert.equal(first.equipmentFoundBySource.chest, 1);

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
