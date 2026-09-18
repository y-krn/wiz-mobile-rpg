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
assert.deepEqual(result.configuration.arms, ["L0A", "L10A", "L20A", "L20F"]);
assert.deepEqual(result.configuration.transitionRecoveryRates, {
  L0A: 0.25,
  L10A: 0.25,
  L20A: 0.25,
  L20F: 0.25
});
assert.deepEqual(result.configuration.levelUpRecoveryRates, {
  L0A: 0,
  L10A: 0.1,
  L20A: 0.2,
  L20F: 0.2
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
    if (armId === "L20F") {
      assert.equal(arm.byKit[kitId].aggregate.buildCheckpoints[5].equipmentSwapCount.total, 0);
    }
    if (armId !== "L20F") {
      assert.ok(arm.byKit[kitId].aggregate.buildCheckpoints[5]);
    }
    for (const floor of Object.values(row.floors).filter(Boolean)) {
      for (const sample of floor.progression.levelUpRecoverySamples) {
        const expected = sample.rate > 0
          ? Math.max(1, Math.floor(sample.newMaxHp * sample.rate))
          : 0;
        assert.equal(sample.requestedHp, expected);
        assert.equal(sample.actualHp, Math.min(expected, sample.newMaxHp - sample.hpBefore));
        assert.equal(sample.hpAfter, sample.hpBefore + sample.actualHp);
        assert.ok(sample.hpAfter <= sample.newMaxHp);
        assert.equal(sample.maxHpOverage, 0);
        if (sample.actualHp > 0) extraObserved = true;
      }
      if ((floor.recovery?.extraLevelUpRecoveryHp || 0) > 0) {
        extraObserved = true;
        if ((floor.recovery?.potionUsed || 0) === 0) potionReplacementObserved = true;
      }
    }
  }
}
assert.equal(extraObserved, true, "smoke must observe at least one extra level-up heal");
assert.equal(potionReplacementObserved, true, "smoke must show extra heal with no Potion use on a floor");

for (const kitId of KIT_IDS) {
  assert.equal(result.baselineParity.byKit[kitId].r25aVsL0a.pass, true);
  assert.equal(result.baselineParity.byKit[kitId].omittedVsZero.pass, true);
}

for (const comparison of result.primaryComparisons) {
  assert.match(comparison.label, /L10A - L0A|L20A - L0A|L20A - L10A|L20A - L20F/);
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
const levelingSource = fs.readFileSync("src/systems/leveling.js", "utf8");
assert.doesNotMatch(simulatorSource, /checkCharLevelUp\s*\(/);
assert.match(levelingSource, /UNIVERSAL_HP_GROWTH = 5/);
assert.match(levelingSource, /char\.maxHp \+= UNIVERSAL_HP_GROWTH/);
assert.match(levelingSource, /char\.hp \+= \(newMaxHp - oldMaxHp\)/);
assert.ok(
  simulatorSource.indexOf("applySimulationLevelUpRecovery(state, metrics, floor") <
    simulatorSource.indexOf("applyPostCombatRecovery(state, metrics)")
);
assert.match(simulatorSource, /parseOptionalChance\(scenario\.levelUpRecoveryRate, "levelUpRecoveryRate"\)/);

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
  "L10A - L0A",
  "L20A - L0A",
  "L20A - L10A",
  "L20A - L20F",
  "natural HP",
  "extra requested/actual",
  "Potion used",
  "B5 guardian decomposition",
  "farming incentive is not proven"
]) assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

console.log("first-band-levelup-recovery diagnostic smoke: PASS");
