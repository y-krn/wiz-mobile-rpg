import assert from "node:assert/strict";

import {
  KIT_IDS,
  TRANSITION_ARM_IDS,
  TRANSITION_MEASUREMENT_ID,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";
import {
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} from "../../../scratch/simulations/sim_depth_material_ev.js";

const result = await runMeasurement({
  runs: 1,
  seed: 1277,
  mode: "transition-recovery"
});

assert.equal(result.configuration.measurementId, TRANSITION_MEASUREMENT_ID);
assert.deepEqual(result.configuration.arms, ["R15A", "R25A", "R35A", "R35F"]);
assert.deepEqual(result.configuration.transitionRecoveryRates, {
  R15A: 0.15,
  R25A: 0.25,
  R35A: 0.35,
  R35F: 0.35
});
assert.deepEqual(result.configuration.preparation, {
  name: "Standard Preparation",
  startingWeaponMode: "kit-default",
  healPotions: 4
});
assert.equal(result.baselineParity.pass, true);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

const pitfallScenario = getScenarioById("workshop-complete");
resetSimulationRandom(16);
const pitfallResult = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 6,
  runIndex: 16,
  seriesId: "issue1336-pitfall-smoke",
  scenario: {
    ...pitfallScenario,
    startingKit: "vanguard",
    startingHealPotions: 4,
    startingAntidotes: 1,
    startingGuardPotions: 1,
    startingTownPortals: 1,
    trapPolicy: "legacy",
    floorTrapDetection: "source",
    equipmentUpdatePolicy: "fixed",
    collectStage15Diagnostics: true
  },
  workshop: pitfallScenario.workshop,
  worldSeed: "pitfall:legacy:source:16",
  collectDiagnostics: true
});
const pitfallEvents = (pitfallResult.floorTransitionRecovery || [])
  .filter(event => event.source === "pitfall");
assert.ok(pitfallEvents.length > 0, "pitfall transition must be observable");
for (const event of pitfallEvents) {
  assert.equal(event.hpAfter, event.hpBefore + event.actualHealedHp);
  assert.ok(event.hpAfter <= event.maxHp);
}

for (const armId of TRANSITION_ARM_IDS) {
  const arm = result.arms[armId];
  assert.equal(arm.smoke.totalRuns, KIT_IDS.length);
  assert.equal(arm.preparation.supplies.TOWN_PORTAL, 1);
  assert.equal(arm.preparation.supplies.HEAL_POTION, 4);
  assert.equal(arm.preparation.supplies.ANTIDOTE, 1);
  assert.equal(arm.preparation.supplies.GUARD_POTION, 1);
  assert.equal(arm.build.requestedPolicy, armId === "R35F" ? "fixed" : "deterministic_greedy");
  if (armId !== "R35F") assert.ok(arm.build.effectivePolicyIds.includes("deterministic_greedy"));
  for (const kitId of KIT_IDS) {
    const row = arm.samples.runs.runs.find(item => item.startingKitId === kitId);
    const kitRow = arm.byKit[kitId];
    assert.equal(kitRow.preparation.startingWeapon, kitRow.preparation.expectedStartingWeapon);
    assert.ok(kitRow.aggregate.buildCheckpoints[2]);
    assert.ok(kitRow.aggregate.buildCheckpoints[5]);
    assert.ok(kitRow.aggregate.recovery[1]);
    assert.ok(kitRow.aggregate.transitionRecovery[2]);
    assert.ok(kitRow.aggregate.recovery[1].potionRecoveryHp.meanPerEntrant >= 0);
    assert.ok(kitRow.aggregate.recovery[1].floorTransitionRecoveryHp.meanPerEntrant >= 0);
    if (armId === "R35F") {
      assert.equal(kitRow.aggregate.buildCheckpoints[5].equipmentSwapCount.total, 0);
    }
    for (const event of (row?.transitionRecovery || []).filter(item => item.toFloor >= 2)) {
      const rate = result.configuration.transitionRecoveryRates[armId];
      assert.equal(event.requestedHp, Math.max(1, Math.floor(event.maxHp * rate)));
      assert.equal(event.hpAfter, event.hpBefore + event.actualHealedHp);
      assert.ok(event.actualHealedHp <= event.requestedHp);
      assert.ok(event.hpAfter <= event.maxHp);
      assert.equal(event.maxHpOverage, 0);
      assert.ok(["stairs", "pitfall"].includes(event.source));
    }
  }
}

const summary = buildSummary({
  ...result,
  measurement: {
    measurementId: TRANSITION_MEASUREMENT_ID,
    purpose: "smoke",
    requestedRef: "issue-1336",
    sourceCommit: "a".repeat(40),
    gameplaySourceCommit: "b".repeat(40),
    measurementRunnerCommit: "c".repeat(40),
    measurementRunnerPaths: [],
    baseRef: "origin/main",
    baseCommit: "b".repeat(40),
    originMainAncestor: true,
    staleTreeAllowed: false,
    workingTreeClean: false,
    environmentSignature: {},
    productionBalanceChange: false
  }
});
for (const token of [
  "R25A - R15A",
  "R35A - R15A",
  "R35A - R25A",
  "R35A - R35F",
  "B1→B2",
  "potion HP",
  "transition HP",
  "B5 guardian decomposition",
  "R15 parity"
]) {
  assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log("first-band-transition-recovery diagnostic smoke: PASS");
