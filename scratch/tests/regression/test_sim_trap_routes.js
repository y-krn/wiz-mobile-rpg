import assert from "node:assert/strict";

process.env.SIM_SKIP_PROVENANCE = "1";
process.env.SIM_SEED = "231";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const { simulateRun } = await import("../../simulations/sim_depth_material_ev.js");

const scenario = {
  trapPolicy: "conservative",
  chestTrapPolicy: "disabled",
  floorTrapDetection: "certain",
  fleePolicy: "never",
  useTownPortal: false
};

function run() {
  return simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 6,
    // The structure-driven generator changed the old fixture's trap order;
    // keep a deterministic seed that exercises the same detour guarantees.
    runIndex: 25,
    seriesId: "issue-933-route",
    scoringProfile: null,
    scenario,
    encounterRateOverride: () => 0.1
  });
}

const result = run();
const repeat = run();
assert.deepEqual(repeat, result, "trap route simulation must be deterministic");
assert.equal("trapAvoidancePolicy" in result, false);
assert.equal("trapAvoidanceExtraSteps" in result, false);

const route = result.trapRoute;
for (const field of [
  "discoveredTrapEncounters",
  "detourSelections",
  "noAlternateRoute",
  "detourExtraSteps",
  "detourActualMovementSteps",
  "detourBudgetExtraSteps",
  "detourNormalEncounters",
  "detourOtherTrapEncounters",
  "detourDeaths",
  "detourRetreats",
  "cycleDetections"
]) {
  assert.equal(typeof route[field], "number", `missing route diagnostic: ${field}`);
}
assert.equal(typeof route.actionSelections.disarm, "number");
assert.equal(typeof route.actionSelections.force, "number");
assert.ok(route.detourSelections > 0, "known traps should be able to select another route");
assert.ok(route.detourExtraSteps > 0, "detours must add actual route steps");
assert.ok(route.detourActualMovementSteps > 0, "detours must count actual movement");
assert.equal(
  route.detourExtraSteps,
  route.detourActualMovementSteps - route.decisions[0].directSteps,
  "detour extra steps must equal actual movement minus direct movement"
);
assert.ok(route.detourNormalEncounters > 0, "detours must process normal encounters");
assert.ok(route.detourOtherTrapEncounters > 0, "detours must process other floor traps normally");
assert.ok(route.decisions.every(decision => decision.selected === "detour"));

console.log("[PASS] #933 known floor traps use deterministic ordinary route selection diagnostics");
