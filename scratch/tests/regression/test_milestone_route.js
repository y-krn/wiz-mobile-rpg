import assert from "node:assert/strict";

const { getScenarioById, resetSimulationRandom, simulateRun } =
  await import("../../simulations/sim_depth_material_ev.js");

const baseScenario = {
  ...getScenarioById("workshop-complete"),
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "never",
  // Keep this route probe focused on milestone routing; class-independent
  // loot is intentionally allowed to change the combat build.
  hpBaseBonus: 1000
};

function run(scenario, targetDepth) {
  resetSimulationRandom(123);
  return simulateRun({
    className: "Thief",
    startFloor: 1,
    targetDepth,
    runIndex: 0,
    seriesId: "issue895-debug",
    scoringProfile: null,
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
}

const continueResult = run({
  ...baseScenario,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue"
}, 11);
const continueRepeat = run({
  ...baseScenario,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue"
}, 11);
assert.deepEqual(continueRepeat, continueResult, "milestone route probe is not deterministic");
assert.deepEqual(continueResult.unlockedMilestones, [5, 10]);
assert.equal(continueResult.milestoneMerchantVisits, 2);
assert.equal(continueResult.milestoneMerchantBlockedVisits, 0);
assert.equal(continueResult.milestonePortalVisits, 2);
assert.equal(continueResult.milestonePortalBlockedVisits, 0);
assert.equal(continueResult.milestonePortalRetreats, 0);
for (const floor of [5, 10]) {
  const route = continueResult.specialRouteFloors.find(entry => entry.floor === floor);
  assert.deepEqual(route.routeEventTypes, ["boss", "event_merchant", "return_portal"]);
  assert.deepEqual(route.routeEventDistances.length, 3);
  assert.ok(
    continueResult.milestoneEventTrace
      .filter(entry => entry.floor === floor && entry.type !== "boss")
      .every(entry => entry.gateOpen),
    `B${floor}F facility was visited before its boss gate opened`
  );
}

const retreatResult = run({
  ...baseScenario,
  merchantPolicy: "never",
  milestonePortalPolicy: "retreat"
}, 6);
assert.equal(retreatResult.outcome, "retreat");
assert.equal(retreatResult.terminationReason, "milestone_portal");
assert.deepEqual(retreatResult.unlockedMilestones, [5]);
assert.equal(retreatResult.milestoneMerchantVisits, 1);
assert.equal(retreatResult.milestonePortalRetreats, 1);
assert.equal(
  Object.values(retreatResult.merchantStock).reduce((sum, entry) => sum + entry.attempts, 0),
  0
);

console.log("[PASS] #895 milestone boss gate, merchant route, and portal policy verified.");
