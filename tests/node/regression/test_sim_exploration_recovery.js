import assert from "node:assert/strict";

process.env.SIM_SEED = "2028";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_RUNS = "1";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SCENARIOS = "workshop-empty";

const { simulateRun, applyFloorTransitionHeal } =
  await import("../../../scratch/simulations/sim_depth_material_ev.js");

// #2028: the depth simulation follows production exploration recovery (#1993).
// Recovery comes from the production rule on each newly entered cell; a floor
// transition restores nothing unless a measurement asks for the counterfactual.
function run(runIndex, scenario = {}) {
  return simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 4,
    runIndex,
    seriesId: "issue-2028-exploration-recovery",
    scoringProfile: null,
    scenario: { startingKit: "vanguard", ...scenario }
  });
}

const { EXPLORATION_RECOVERY_RATE: RATE, EXPLORATION_RECOVERY_FLOOR_CAP: FLOOR_CAP } =
  await import("../../../src/systems/exploration_recovery.js");
const results = [0, 1, 2, 3, 4, 5].map(index => run(index));
let fullHpFloors = 0;

for (const result of results) {
  const recovery = result.explorationRecovery;
  const floors = Object.entries(recovery.byFloor);
  assert.ok(recovery.newCells > 0, "the route enters new cells");
  assert.equal(recovery.newCells, floors.reduce((sum, [, floor]) => sum + floor.newCells, 0));
  assert.equal(recovery.hp, floors.reduce((sum, [, floor]) => sum + floor.hp, 0));
  assert.equal(recovery.mp, floors.reduce((sum, [, floor]) => sum + floor.mp, 0));
  // Each new cell is worth RATE of max HP. Max HP moves with levels and gear,
  // so bound the rate by the largest max HP the run reports.
  const largestMaxHp = Math.max(result.finalMaxHp, ...result.floorTransitionRecovery.map(event => event.maxHp));
  for (const [floor, observed] of floors) {
    assert.ok(
      observed.hp <= Math.ceil(observed.newCells * RATE * largestMaxHp),
      `B${floor}: ${observed.hp} HP from ${observed.newCells} cells exceeds the per-cell rate`
    );
  }
  // No heal on stairs or pitfalls: every transition is recorded with nothing
  // requested and nothing restored.
  for (const event of result.floorTransitionRecovery) {
    assert.equal(event.requestedHp, 0);
    assert.equal(event.actualHealedHp, 0);
    assert.equal(event.hpAfter, event.hpBefore);
    // The floor just left gave back at most the production per-floor cap.
    const observed = recovery.byFloor[String(event.fromFloor)];
    const cap = Math.floor(event.maxHp * FLOOR_CAP);
    assert.ok(observed.hp <= cap, `B${event.fromFloor}: ${observed.hp} HP exceeds the floor cap ${cap}`);
    // Walking at full HP recovers nothing.
    fullHpFloors += Number(observed.hp === 0 && observed.newCells > 0 && event.hpBefore === event.maxHp);
  }
}
// Since #1803 the per-floor cap is a whole HP bar, so the simulator's routes
// rarely spend all of it; the unit test owns the cap branch, and here the cap
// only bounds what a floor gave back. A floor walked at full HP still happens.
assert.ok(fullHpFloors > 0, "a seeded run walks a floor at full HP");
assert.deepEqual(run(0).explorationRecovery, results[0].explorationRecovery, "recovery is deterministic");

// The measurement-only counterfactual heals only when a rate is given.
const hurt = { hp: 1, maxHp: 100, mp: 0, maxMp: 0, level: 1, status: "ok", equipment: {} };
assert.equal(applyFloorTransitionHeal(hurt), 0, "the default restores nothing");
assert.equal(hurt.hp, 1);
assert.equal(applyFloorTransitionHeal(hurt, 0.25), 25);
assert.equal(hurt.hp, 26);
const counterfactual = run(0, { floorTransitionRecoveryRate: 0.25 });
assert.ok(counterfactual.floorTransitionRecovery.length > 0);
for (const event of counterfactual.floorTransitionRecovery) {
  assert.equal(event.requestedHp, Math.max(1, Math.floor(event.maxHp * 0.25)));
  assert.equal(event.hpAfter, event.hpBefore + event.actualHealedHp);
}
assert.ok(
  counterfactual.explorationRecovery.newCells > 0,
  "the counterfactual adds to exploration recovery; it does not replace it"
);

console.log("[PASS] the depth simulation recovers through production exploration recovery");
