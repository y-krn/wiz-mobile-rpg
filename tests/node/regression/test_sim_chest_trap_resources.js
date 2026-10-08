import assert from "node:assert/strict";
import { findSeed, seedWindow } from "../fixtures/seed_search.js";

process.env.SIM_SEED = "231";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_RUNS = "1";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SCENARIOS = "workshop-empty";

const { simulateRun } = await import("../../../scratch/simulations/sim_depth_material_ev.js");

// #1939: from B4 a chest can be a mimic, fought through the production
// encounter path, and corrosion destroys one carried consumable. The run's
// provenance ledgers are checked inside simulateRun, so a corroded item that
// left a ledger out of step would throw here.
function run(runIndex) {
  return simulateRun({
    className: "Fighter",
    startFloor: 4,
    targetDepth: 6,
    runIndex,
    seriesId: "issue-1939-mimic",
    scoringProfile: null,
    scenario: { chestTrapPolicy: "legacy", trapPolicy: "disabled" },
    encounterRateOverride: () => 0
  });
}

function mimicOutcome(result) {
  return result.chestTrapOutcomes.mimic;
}

// Run indexes are scenario fixtures: floor layouts (#1962), gimmicks (#1963),
// the unified rules, exploration recovery (#2028) and #1803's recovery and
// needle each moved which run meets which chest (57 -> 14, 28 -> 2, 2 -> 31
// by hand). Each scenario now takes the first run index that shows it.
const { seed: victoryIndex, result: victory } = await findSeed("mimic fought and beaten", seedWindow(14, 40), run,
  result => mimicOutcome(result).victories > 0);
assert.deepEqual(mimicOutcome(run(victoryIndex)), mimicOutcome(victory), "mimic fights are deterministic");

const { result: cautious } = await findSeed("low-HP player leaves every mimic", seedWindow(31, 60), run, result => {
  const mimic = mimicOutcome(result);
  return mimic.encounters > 0 && mimic.left === mimic.encounters;
});
assert.equal(mimicOutcome(cautious).fights, 0);
const { result: corroded } = await findSeed("corrosion takes a consumable", seedWindow(2, 40), run,
  result => Object.values(result.chestTrapOutcomes.corrosionItemsLost || {}).some(count => count > 0));
assert.equal(Object.values(corroded.chestTrapOutcomes.corrosionItemsLost).reduce((sum, count) => sum + count, 0) >= 1, true);

for (const result of [victory, cautious, corroded]) {
  const mimic = mimicOutcome(result);
  assert.equal(mimic.encounters, mimic.left + mimic.fights);
  assert.equal(mimic.fights, mimic.victories + mimic.flees + mimic.deaths);
  assert.equal(result.trapActivationsByType?.["gas bomb"], undefined, "gas bomb is retired");
}

console.log("[PASS] simulated mimic fights and corrosion keep run accounting consistent");
