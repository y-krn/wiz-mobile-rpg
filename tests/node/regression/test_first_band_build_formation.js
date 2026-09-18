import assert from "node:assert/strict";

import {
  ARM_IDS,
  CANONICAL_ADAPTIVE_POLICY_ID,
  KIT_IDS,
  MEASUREMENT_ID,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const { getScenarioById, resetSimulationRandom, simulateRun } =
  await import("../../../scratch/simulations/sim_depth_material_ev.js");

const result = await runMeasurement({ runs: 1, seed: 1277 });
assert.equal(result.configuration.measurementId, MEASUREMENT_ID);
assert.deepEqual(result.configuration.startingKits, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(result.configuration.arms, ["P0B1", "P0B0", "P1B1", "P1B0"]);
assert.equal(result.configuration.workshop, "workshop-complete");
assert.equal(result.configuration.adaptivePolicy, CANONICAL_ADAPTIVE_POLICY_ID);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);
let enemyActionRegressionObserved = false;
const expectedP1Weapons = Object.fromEntries(KIT_IDS.map(kitId => [kitId, "RAPIER"]));

for (const armId of ARM_IDS) {
  const arm = result.arms[armId];
  assert.equal(arm.smoke.totalRuns, KIT_IDS.length);
  assert.equal(arm.byKit.vanguard.preparation.departureCraft.purchaseSource, "actual-meta-bank");
  assert.equal(arm.byKit.vanguard.preparation.startingBagUsed,
    arm.preparation.id === "P0" ? 7 : 15);
  for (const kitId of KIT_IDS) {
    const row = arm.byKit[kitId];
    if (arm.preparation.id === "P0") {
      assert.equal(row.preparation.startingWeapon, {
        vanguard: "SHORT_SWORD",
        scout: "DAGGER",
        devotion: "MACE",
        arcana: "WAND"
      }[kitId]);
    } else {
      assert.equal(row.preparation.expectedStartingWeapon, expectedP1Weapons[kitId]);
      assert.equal(row.preparation.startingWeapon, expectedP1Weapons[kitId]);
    }
    assert.equal(row.preparation.startingWeapon, row.preparation.expectedStartingWeapon);
    for (const field of ["weaponAtk", "weaponHands", "equipmentLoad", "medium", "runeSlots", "activeRunes", "startingMp", "maxMp"]) {
      assert.ok(field in row.preparation, `${armId}/${kitId}: missing preparation provenance ${field}`);
    }
    if (row.aggregate.combat[1].rounds.total > 0 && row.aggregate.combat[1].combatHpDamage.total > 0) {
      assert.ok(row.aggregate.combat[1].enemyActions.total > 0);
      enemyActionRegressionObserved = true;
    }
    assert.ok(row.aggregate.buildCheckpoints[2]);
    assert.ok(row.aggregate.buildCheckpoints[5]);
    assert.equal(row.preparation.supplies.TOWN_PORTAL, 1);
    assert.equal(row.preparation.supplies.ANTIDOTE, 1);
    assert.equal(row.preparation.supplies.GUARD_POTION, 1);
    assert.equal(row.preparation.departureCraft.purchaseSource, "actual-meta-bank");
    assert.ok(arm.samples.runs.retainedCount <= 8);
    assert.ok(arm.samples.candidates.retainedCount <= 128);
    assert.ok(arm.overview.buildIdentitySample.length <= 32);
    if (arm.build.id === "B0") {
      assert.equal(row.aggregate.buildCheckpoints[5].equipmentSwapCount.total, 0);
    }
    if (arm.build.id === "B1") {
      assert.ok(arm.build.effectivePolicyIds.includes(CANONICAL_ADAPTIVE_POLICY_ID));
    }
  }
}
assert.equal(enemyActionRegressionObserved, true);
const b5SmokeArm = ARM_IDS.find(armId => result.arms[armId].overview.b5.entrantN > 0);
assert.ok(b5SmokeArm);
assert.ok(result.arms[b5SmokeArm].overview.b5.flameTrap.eligibleSteps.total > 0);
assert.equal(result.arms[b5SmokeArm].overviewReconciliation.runs, true);
const routeOnlyArm = ARM_IDS.find(armId => {
  const boss = result.arms[armId].overview.b5.boss;
  return boss.routeBossDetected.total > 0 && boss.actualBossEventArrival.total === 0;
});
assert.ok(routeOnlyArm, "route detection must not imply actual boss arrival");

const focusedScenario = {
  ...getScenarioById("workshop-complete"),
  startingKit: "vanguard",
  startingHealPotions: 20,
  startingGreaterHeals: 5,
  trapPolicy: "disabled",
  useTownPortal: false,
  fleePolicy: "never",
  hpBaseBonus: 1000,
  merchantPolicy: "supply-missing",
  milestonePortalPolicy: "continue"
};
resetSimulationRandom(123);
const focusedBoss = simulateRun({
  className: "Thief",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 0,
  seriesId: "issue1332-focused-b5-boss",
  scenario: focusedScenario,
  workshop: focusedScenario.workshop,
  collectDiagnostics: true,
  collectBuildSnapshots: true,
  collectEquipmentTelemetry: true
});
const focusedTrace = focusedBoss.milestoneEventTrace.filter(event => event.floor === 5 && event.type === "boss");
const focusedBattle = focusedBoss.specialBattles.find(battle => battle.floor === 5 && battle.type === "boss");
assert.equal(focusedBoss.specialRouteFloors.find(route => route.floor === 5).detectedBosses, 1);
assert.ok(focusedTrace.some(event => event.encounterAllowed === true), "focused probe did not execute boss event");
assert.ok(focusedBattle);
assert.ok(focusedBattle.attempts.length > 0, "focused probe did not start boss combat");
assert.equal(focusedBattle.finalResult, "victory");
assert.ok(focusedTrace.some(event => event.result === "victory"));

const summary = buildSummary(result);
for (const token of ["B2", "B3", "B4", "B5", "P0B1 - P0B0", "P1B1 - P1B0", "P1B1 - P0B1", "P1B0 - P0B0", "actual arrival", "boss arrival/start/victory"]) {
  assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
const arcanaP0 = result.arms.P0B1.byKit.arcana.preparation;
const arcanaP1 = result.arms.P1B1.byKit.arcana.preparation;
assert.deepEqual(
  { weapon: arcanaP0.startingWeapon, atk: arcanaP0.weaponAtk, medium: arcanaP0.medium, runeSlots: arcanaP0.runeSlots, activeRunes: arcanaP0.activeRunes, maxMp: arcanaP0.maxMp },
  { weapon: "WAND", atk: 1.5, medium: "WAND", runeSlots: 1, activeRunes: ["HALITO"], maxMp: 3 }
);
assert.deepEqual(
  { weapon: arcanaP1.startingWeapon, atk: arcanaP1.weaponAtk, medium: arcanaP1.medium, runeSlots: arcanaP1.runeSlots, activeRunes: arcanaP1.activeRunes, maxMp: arcanaP1.maxMp },
  { weapon: "RAPIER", atk: 12, medium: null, runeSlots: 0, activeRunes: [], maxMp: 1 }
);

assert.equal(result.primaryComparisons.length, 4);
assert.match(result.primaryComparisons[0].label, /P0B1 - P0B0/);
assert.match(result.primaryComparisons[1].label, /P1B1 - P1B0/);
assert.match(result.primaryComparisons[2].label, /P1B1 - P0B1/);
assert.match(result.primaryComparisons[3].label, /P1B0 - P0B0/);
assert.ok(!JSON.stringify(result).includes("encounterIdentityLog"));

console.log("first-band-build-formation diagnostic smoke: PASS");
