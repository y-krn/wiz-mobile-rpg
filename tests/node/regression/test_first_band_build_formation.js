import assert from "node:assert/strict";

import {
  ARM_IDS,
  CANONICAL_ADAPTIVE_POLICY_ID,
  KIT_IDS,
  MEASUREMENT_ID,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

const result = await runMeasurement({ runs: 1, seed: 1277 });
assert.equal(result.configuration.measurementId, MEASUREMENT_ID);
assert.deepEqual(result.configuration.startingKits, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(result.configuration.arms, ["P0B1", "P0B0", "P1B1", "P1B0"]);
assert.equal(result.configuration.workshop, "workshop-complete");
assert.equal(result.configuration.adaptivePolicy, CANONICAL_ADAPTIVE_POLICY_ID);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

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
    }
    if (row.aggregate.combat[1].rounds.total > 0 && row.aggregate.combat[1].combatHpDamage.total > 0) {
      assert.ok(row.aggregate.combat[1].enemyActions.total > 0);
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

assert.equal(result.primaryComparisons.length, 4);
assert.match(result.primaryComparisons[0].label, /P0B1 - P0B0/);
assert.match(result.primaryComparisons[1].label, /P1B1 - P1B0/);
assert.match(result.primaryComparisons[2].label, /P1B1 - P0B1/);
assert.match(result.primaryComparisons[3].label, /P1B0 - P0B0/);
assert.ok(!JSON.stringify(result).includes("encounterIdentityLog"));

console.log("first-band-build-formation diagnostic smoke: PASS");
