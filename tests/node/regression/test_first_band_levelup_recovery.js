import assert from "node:assert/strict";
import fs from "node:fs";

import {
  KIT_IDS,
  LEVEL_UP_ARM_IDS,
  LEVEL_UP_MEASUREMENT_ID,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const result = await runMeasurement({
  runs: 1,
  seed: 1277,
  mode: "levelup-recovery"
});

assert.equal(result.configuration.measurementId, LEVEL_UP_MEASUREMENT_ID);
assert.deepEqual(result.configuration.arms, ["F0A", "P20A", "H5A", "H5F"]);
assert.deepEqual(result.configuration.transitionRecoveryRates, {
  F0A: 0.25,
  P20A: 0.25,
  H5A: 0.25,
  H5F: 0.25
});
assert.deepEqual(result.configuration.levelUpRecoveryRates, {
  F0A: 0,
  P20A: 0.2,
  H5A: 0,
  H5F: 0
});
assert.deepEqual(result.configuration.levelUpRecoveryFlatHp, {
  F0A: 0,
  P20A: 0,
  H5A: 5,
  H5F: 5
});
assert.equal(result.configuration.preparation.name, "Standard Preparation");
assert.equal(result.configuration.preparation.healPotions, 4);
assert.equal(result.baselineParity.pass, true);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

let extraObserved = false;
let potionReplacementObserved = false;
for (const armId of LEVEL_UP_ARM_IDS) {
  const arm = result.arms[armId];
  assert.equal(arm.smoke.totalRuns, KIT_IDS.length);
  assert.equal(arm.preparation.supplies.TOWN_PORTAL, 1);
  assert.equal(arm.preparation.supplies.HEAL_POTION, 4);
  assert.equal(arm.preparation.supplies.ANTIDOTE, 1);
  assert.equal(arm.preparation.supplies.GUARD_POTION, 1);
  for (const kitId of KIT_IDS) {
    const row = arm.samples.runs.runs.find(item => item.startingKitId === kitId);
    assert.ok(row);
    assert.ok(row.buildCheckpoints.B2Entry);
    assert.ok(row.buildCheckpoints.B3Entry);
    assert.ok(row.buildCheckpoints.B4Entry);
    assert.ok(row.buildCheckpoints.B5Entry);
    assert.ok(arm.byKit[kitId].aggregate.levelProgression[1]);
    assert.ok(arm.byKit[kitId].aggregate.recovery[1]);
    assert.ok(arm.byKit[kitId].aggregate.b5);
    if (armId === "H5F") {
      assert.equal(arm.byKit[kitId].aggregate.buildCheckpoints[5].equipmentSwapCount.total, 0);
    }
    if (armId !== "H5F") {
      assert.ok(arm.byKit[kitId].aggregate.buildCheckpoints[5]);
    }
    for (const floor of Object.values(row.floors).filter(Boolean)) {
      for (const sample of floor.progression.levelUpRecoverySamples) {
        const percentageExpected = sample.rate > 0
          ? Math.max(1, Math.floor(sample.newMaxHp * sample.rate))
          : 0;
        const flatExpected = sample.flatHp > 0 ? sample.flatHp : 0;
        const expected = percentageExpected + flatExpected;
        assert.equal(sample.percentageRequestedHp, percentageExpected);
        assert.equal(sample.flatRequestedHp, flatExpected);
        assert.equal(sample.requestedHp, expected);
        assert.equal(sample.actualHp, Math.min(expected, sample.newMaxHp - sample.hpBefore));
        assert.equal(sample.hpAfter, sample.hpBefore + sample.actualHp);
        assert.ok(sample.hpAfter <= sample.newMaxHp);
        assert.equal(sample.maxHpOverage, 0);
        assert.equal(sample.percentageActualHp + sample.flatActualHp, sample.actualHp);
        if (sample.actualHp > 0) extraObserved = true;
      }
      if ((floor.recovery?.percentageExtraLevelUpRecoveryHp || 0) +
          (floor.recovery?.flatExtraLevelUpRecoveryHp || 0) > 0) {
        extraObserved = true;
        if ((floor.recovery?.potionUsed || 0) === 0) potionReplacementObserved = true;
      }
    }
  }
}
assert.equal(extraObserved, true, "smoke must observe at least one extra level-up heal");
assert.equal(potionReplacementObserved, true, "smoke must show extra heal with no Potion use on a floor");

assert.equal(result.arms.F0A.overview.recovery[1].percentageExtraLevelUpRecoveryHp.total, 0);
assert.ok(
  result.arms.F0A.overview.recovery[1].productionExtraLevelUpRecoveryHp.total > 0,
  "production fixed +5 extra recovery must be observed by the simulator"
);
assert.equal(result.arms.F0A.overview.recovery[1].flatExtraLevelUpRecoveryHp.total, 0);
assert.equal(result.arms.P20A.overview.recovery[1].flatExtraLevelUpRecoveryHp.total, 0);
assert.equal(result.arms.H5A.overview.recovery[1].percentageExtraLevelUpRecoveryHp.total, 0);
assert.equal(result.arms.H5F.overview.recovery[1].percentageExtraLevelUpRecoveryHp.total, 0);

for (const kitId of KIT_IDS) {
  assert.equal(result.baselineParity.byKit[kitId].f0aVsL0a.pass, true);
  assert.equal(result.baselineParity.byKit[kitId].p20aVsL20a.pass, true);
  assert.equal(result.baselineParity.byKit[kitId].r25aVsF0a.pass, true);
  assert.equal(result.baselineParity.byKit[kitId].omittedVsZero.pass, true);
}

for (const comparison of result.primaryComparisons) {
  assert.match(comparison.label, /H5A - F0A|P20A - F0A|H5A - P20A|H5A - H5F/);
}
for (const armId of LEVEL_UP_ARM_IDS) {
  const b5 = result.arms[armId].overview.b5;
  for (const field of [
    "flameTrap",
    "boss",
    "townPortalReturnBeforeBoss",
    "townPortalReturnAfterBossAttemptBeforeB6",
    "milestonePortalReturnAfterGuardian",
    "b6Transition"
  ]) assert.ok(field in b5, `${armId}: missing B5 decomposition ${field}`);
}

const simulatorSource = fs.readFileSync("scratch/simulations/sim_depth_material_ev.js", "utf8");
const levelingSource = fs.readFileSync("src/systems/leveling.ts", "utf8");
assert.doesNotMatch(simulatorSource, /checkCharLevelUp\s*\(/);
assert.match(levelingSource, /UNIVERSAL_HP_GROWTH = 5/);
assert.match(levelingSource, /UNIVERSAL_LEVEL_UP_EXTRA_HEAL = 5/);
assert.match(levelingSource, /char\.maxHp \+= UNIVERSAL_HP_GROWTH/);
assert.match(levelingSource, /char\.hp \+= \(newMaxHp - oldMaxHp\)/);
assert.match(levelingSource, /Math\.min\(UNIVERSAL_LEVEL_UP_EXTRA_HEAL, newMaxHp - char\.hp\)/);
assert.ok(
  simulatorSource.indexOf("applySimulationLevelUpRecovery(state, metrics, floor") <
    simulatorSource.indexOf("applyPostCombatRecovery(state, metrics)")
);
assert.match(simulatorSource, /parseOptionalChance\(scenario\.levelUpRecoveryRate, "levelUpRecoveryRate"\)/);
assert.match(simulatorSource, /parseOptionalFlatHp\(scenario\.levelUpRecoveryFlatHp\)/);
assert.match(simulatorSource, /levelUpRecoveryRate > 0 && levelUpRecoveryFlatHp > 0/);
assert.doesNotMatch(simulatorSource, /extraLevelUpRecoveryActualHp/);
assert.match(simulatorSource, /productionExtraLevelUpRecoveryHp/);

const { getScenarioById, simulateRun } = await import("../../../scratch/simulations/sim_depth_material_ev.js");
const rejectScenario = {
  ...getScenarioById("workshop-complete"),
  levelUpRecoveryRate: 0.2,
  levelUpRecoveryFlatHp: 5
};
assert.throws(
  () => simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 1,
    runIndex: 0,
    seriesId: "levelup-recovery-reject",
    scenario: rejectScenario,
    workshop: rejectScenario.workshop,
    worldSeed: "levelup-recovery-reject"
  }),
  /levelUpRecoveryRate and levelUpRecoveryFlatHp cannot both be positive/
);

const summary = buildSummary({
  ...result,
  measurement: {
    measurementId: LEVEL_UP_MEASUREMENT_ID,
    purpose: "smoke",
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
  "H5A - F0A",
  "P20A - F0A",
  "H5A - P20A",
  "H5A - H5F",
  "natural HP",
  "production fixed +5 extra HP",
  "percentage requested/actual",
  "flat requested/actual",
  "Potion used",
  "B5 guardian decomposition",
  "farming incentive is not proven"
]) assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

console.log("first-band-levelup-recovery diagnostic smoke: PASS");
