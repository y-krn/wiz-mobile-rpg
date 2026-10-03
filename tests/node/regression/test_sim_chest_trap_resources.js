import assert from "node:assert/strict";

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

const victory = run(57);
assert.deepEqual(mimicOutcome(victory), {
  encounters: 1, left: 0, fights: 1, victories: 1, flees: 0, deaths: 0
});
assert.deepEqual(mimicOutcome(run(57)), mimicOutcome(victory), "mimic fights are deterministic");

// Run indexes are fixtures; floor layouts (#1962) decide which chests a run meets.
const cautious = run(38);
const cautiousMimic = mimicOutcome(cautious);
assert.ok(cautiousMimic.encounters > 0, "the cautious fixture meets a mimic");
assert.equal(cautiousMimic.left, cautiousMimic.encounters, "a low-HP player leaves every mimic");
assert.equal(cautiousMimic.fights, 0);
assert.deepEqual(cautious.chestTrapOutcomes.corrosionItemsLost, { TRAP_SENSE_STONE: 1 });

for (const result of [victory, cautious]) {
  const mimic = mimicOutcome(result);
  assert.equal(mimic.encounters, mimic.left + mimic.fights);
  assert.equal(mimic.fights, mimic.victories + mimic.flees + mimic.deaths);
  assert.equal(result.trapActivationsByType?.["gas bomb"], undefined, "gas bomb is retired");
}

console.log("[PASS] simulated mimic fights and corrosion keep run accounting consistent");
