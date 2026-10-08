import assert from "node:assert/strict";
import { findSeed, seedWindow } from "../fixtures/seed_search.js";

process.env.SIM_SEED = "231";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_RUNS = "1";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SCENARIOS = "workshop-empty";

const { simulateRun } = await import("../../../scratch/simulations/sim_depth_material_ev.js");

function runConfig(runIndex) {
  return {
    className: "Fighter",
    // Keep this lethal chest fixture on the first floor where the production
    // chest-trap grammar is still active after the #1233 B1F introduction
    // delay.
    startFloor: 2,
    targetDepth: 4,
    runIndex,
    seriesId: "lethal-smash-regression",
    scoringProfile: null,
    scenario: {
      chestTrapPolicy: "legacy",
      trapPolicy: "disabled",
      // A low solo HP pool keeps full-strength chest traps lethal.
      hpBaseBonus: -37
    },
    encounterRateOverride: () => 0
  };
}

function summarize(result) {
  return {
    outcome: result.outcome,
    deathEncounterType: result.deathEncounterType,
    finalHp: result.finalHp,
    chestsOpened: result.chestsOpened,
    chestActions: result.chestPath.ordinary.actions,
    rewardsAwarded: result.chestPath.ordinary.rewardsAwarded,
    materialAcquiredBySource: result.materialAcquiredBySource,
    equipmentFoundBySource: result.equipmentFoundBySource
  };
}

// A failed automatic disarm fires the full trap. Like the live path, the
// chest is still resolved before the game-over transition.
const lethal = simulateRun(runConfig(2));
assert.equal(lethal.outcome, "death");
// #1803: the needle takes a tenth of maximum HP, so it no longer kills a
// healthy opener outright; the poison it leaves finishes this one.
assert.equal(lethal.deathEncounterType, "poison");
assert.equal(lethal.finalHp, 0);
assert.ok(lethal.chestPath.ordinary.actions.open >= 1);
assert.equal(lethal.chestPath.ordinary.actions.leave, 0);
assert.deepEqual(summarize(simulateRun(runConfig(2))), summarize(lethal));

// When opening is more likely than not to kill, the simulated player leaves,
// and a left chest grants neither materials nor rewards. Which run meets such
// a chest moves with floor layouts and trap damage (a needle takes a tenth of
// maximum HP since #1803, so only a badly hurt opener is at risk), so the
// first run index from 1 that leaves one is used.
const { seed: cautiousIndex, result: cautious } = await findSeed(
  "likely-lethal chest left",
  seedWindow(1, 20),
  index => simulateRun(runConfig(index)),
  result => result.chestLootEvents.some(event =>
    event.source === "ordinary" && event.action === "leave" && event.generatedItems.length > 0)
);
const ordinaryEvents = cautious.chestLootEvents.filter(event => event.source === "ordinary");
assert.ok(ordinaryEvents.some(event => event.action === "leave" && event.generatedItems.length > 0));
assert.equal(
  cautious.chestPath.ordinary.rewardsAwarded,
  ordinaryEvents
    .filter(event => event.action !== "leave")
    .reduce((sum, event) => sum + event.generatedItems.length, 0),
  "only opened chests award their generated rewards"
);
assert.deepEqual(summarize(simulateRun(runConfig(cautiousIndex))), summarize(cautious));

console.log("[PASS] deterministic lethal chest traps resolve on opening and likely-lethal chests are left");
