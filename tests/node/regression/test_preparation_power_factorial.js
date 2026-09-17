import assert from "node:assert/strict";

import {
  CONDITION_IDS,
  DEFAULT_SEED,
  INITIAL_MATERIAL_BANK,
  STARTING_KIT_IDS,
  aggregateFloor,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/preparation_power_factorial.js";
import { resolveMeasurementOptions } from "../../../scratch/measurements/run_balance_measurement.js";

assert.equal(DEFAULT_SEED, 1277);
assert.equal(resolveMeasurementOptions({ measurement: "preparation-power-factorial", purpose: "test" }).seed, 1277);

const result = await runMeasurement({ runs: 1, seed: DEFAULT_SEED });
const byId = Object.fromEntries(result.conditions.map(condition => [condition.id, condition]));

assert.deepEqual(Object.keys(byId), CONDITION_IDS);
assert.equal(result.configuration.totalRuns, 16);
assert.deepEqual(result.configuration.initialMaterialBank, INITIAL_MATERIAL_BANK);
assert.equal(result.configuration.inventoryContract.capacity, 20);
assert.equal(result.determinism.status, "PASS");
assert.equal(result.observationInvariance.status, "PASS");

for (const condition of result.conditions) {
  assert.equal(condition.runs, STARTING_KIT_IDS.length);
  assert.deepEqual(Object.keys(condition.byStartingKit), STARTING_KIT_IDS);
  assert.equal(condition.overviewReconciliation.status, "PASS");
  for (const kitId of STARTING_KIT_IDS) {
    const kitAggregate = condition.byStartingKit[kitId];
    assert.equal(kitAggregate.runs, 1);
    for (const floor of [2, 3, 4, 5, 6]) {
      assert.ok("count" in kitAggregate.reach[floor]);
      assert.ok("rate" in kitAggregate.reach[floor]);
    }
    assert.equal(typeof kitAggregate.outcome.death, "number");
    assert.equal(typeof kitAggregate.outcome.voluntaryReturn, "number");
    assert.equal(typeof kitAggregate.outcome.b6Cutoff, "number");
    for (const floor of [1, 2, 3, 4, 5]) {
      const floorAggregate = kitAggregate.recovery.byFloor[floor];
      assert.equal(floorAggregate.observedEntrantN, kitAggregate.recovery.byFloor[floor].observedEntrantN);
      for (const metric of ["potionUsed", "hpRecovered", "combatCount", "rounds", "enemyActions", "combatHpDamage", "equipmentOpportunities", "equipmentSwaps"]) {
        assert.ok("total" in floorAggregate[metric]);
        assert.ok("meanPerEntrant" in floorAggregate[metric]);
        assert.ok("p50" in floorAggregate[metric]);
        if (floorAggregate.observedEntrantN > 0) {
          assert.equal(floorAggregate[metric].meanPerEntrant, floorAggregate[metric].total / floorAggregate.observedEntrantN);
        }
      }
    }
  }
}

const syntheticFloor = aggregateFloor([
  { recovery: { floors: { "3": { entryHpRatio: 0.8, exitHpRatio: 0.5, entryRecoveryRemaining: 2, exitRecoveryRemaining: 1, healPotionUses: 1, hpRecovered: 5, combatCount: 2, rounds: 4, enemyActions: 3, combatHpDamage: 6, equipmentOpportunities: 2, equipmentSwaps: 1 } } } },
  { recovery: { floors: { "3": { entryHpRatio: 0.7, exitHpRatio: 0.4, entryRecoveryRemaining: 1, exitRecoveryRemaining: 0, healPotionUses: 3, hpRecovered: 7, combatCount: 4, rounds: 6, enemyActions: 5, combatHpDamage: 10, equipmentOpportunities: 0, equipmentSwaps: 0 } } } }
], 3);
assert.equal(syntheticFloor.observedEntrantN, 2);
assert.deepEqual(syntheticFloor.combatCount, { total: 6, meanPerEntrant: 3, p50: 3 });
assert.deepEqual(syntheticFloor.potionUsed, { total: 4, meanPerEntrant: 2, p50: 2 });

const summary = buildSummary({
  measurement: { sourceCommit: "test", environmentHash: "test" },
  result
});
assert.match(summary, /Kit × condition decision view/);
assert.match(summary, /Run-level combat values are overview only/);
assert.match(summary, /floor-local entrant metrics: B1 N=/);
assert.match(summary, /; B2 N=/);
assert.match(summary, /; B3 N=/);
const summaryFloor = byId.W0R0.byStartingKit.vanguard.recovery.byFloor[1];
const summaryMetricValue = value => value == null ? "unobserved" : Number(value).toFixed(3);
assert.match(summary, new RegExp(
  `B1 N=${summaryFloor.observedEntrantN} actions ${summaryMetricValue(summaryFloor.enemyActions.meanPerEntrant)}/${summaryMetricValue(summaryFloor.enemyActions.p50)}, rounds ${summaryMetricValue(summaryFloor.rounds.meanPerEntrant)}/${summaryMetricValue(summaryFloor.rounds.p50)}, dmg ${summaryMetricValue(summaryFloor.combatHpDamage.meanPerEntrant)}/${summaryMetricValue(summaryFloor.combatHpDamage.p50)}`
));
for (const kitId of STARTING_KIT_IDS) {
  assert.match(summary, new RegExp(`### ${kitId}`));
  for (const conditionId of CONDITION_IDS) assert.match(summary, new RegExp(`- ${conditionId}:`));
}

const defaultWeapons = {
  vanguard: ["SHORT_SWORD", 9],
  scout: ["DAGGER", 3],
  devotion: ["MACE", 7.5],
  arcana: ["WAND", 1.5]
};
for (const kitId of STARTING_KIT_IDS) {
  const w0 = byId.W0R0.preparationByKit[kitId];
  const w1 = byId.W1R0.preparationByKit[kitId];
  assert.deepEqual([w0.startingWeapon, w0.weaponAtk], defaultWeapons[kitId]);
  assert.equal(w1.startingWeapon, "RAPIER");
  assert.equal(w1.weaponAtk, 12);
  assert.deepEqual(w0.workshopAffixIds, w1.workshopAffixIds);
  assert.deepEqual(w0.workshopSpellIds, w1.workshopSpellIds);
}

assert.deepEqual(
  [byId.W0R0, byId.W1R0].map(condition => condition.preparationByKit.vanguard.startingPotionCount),
  [0, 0]
);
assert.deepEqual(
  [byId.W0R12, byId.W1R12].map(condition => condition.preparationByKit.vanguard.startingPotionCount),
  [12, 12]
);
for (const conditionId of ["W0R12", "W1R12"]) {
  const condition = byId[conditionId];
  assert.deepEqual(condition.materials.departureCraftPayment, Object.fromEntries(
    Object.keys(INITIAL_MATERIAL_BANK).map(material => [
      material,
      ["硬い皮", "獣の牙"].includes(material) ? 12 : 0
    ])
  ));
  assert.equal(condition.materials.departureCraftPurchaseSource, "actual-meta-bank");
  assert.equal(condition.materials.departureCraftRecipeCount, 12);
  assert.equal(condition.preparationByKit.vanguard.startingBagUsed, 12);
  assert.equal(condition.preparationByKit.vanguard.startingBagFree, 8);
}
assert.equal(byId.W0R12.preparationByKit.vanguard.workshopStartingGearApplied, null);
assert.equal(byId.W1R12.preparationByKit.vanguard.workshopStartingGearApplied, "RAPIER");
for (const conditionId of ["W0R0", "W1R0"]) {
  const condition = byId[conditionId];
  assert.equal(condition.materials.departureCraftPurchaseSource, "actual-meta-bank");
  assert.equal(condition.materials.departureCraftRecipeCount, 0);
  assert.equal(condition.preparationByKit.vanguard.startingBagUsed, 0);
  assert.equal(condition.preparationByKit.vanguard.startingBagFree, 20);
}

const arcanaW0 = byId.W0R0.preparationByKit.arcana;
const arcanaW1 = byId.W1R0.preparationByKit.arcana;
assert.deepEqual(
  { weapon: arcanaW0.startingWeapon, medium: arcanaW0.medium, runeSlots: arcanaW0.runeSlots, activeRunes: arcanaW0.activeRunes, maxMp: arcanaW0.startingMaxMp },
  { weapon: "WAND", medium: { present: true, id: "WAND" }, runeSlots: 1, activeRunes: ["HALITO"], maxMp: 3 }
);
assert.deepEqual(
  { weapon: arcanaW1.startingWeapon, medium: arcanaW1.medium, runeSlots: arcanaW1.runeSlots, activeRunes: arcanaW1.activeRunes, maxMp: arcanaW1.startingMaxMp },
  { weapon: "RAPIER", medium: { present: false, id: null }, runeSlots: 0, activeRunes: [], maxMp: 1 }
);

for (const condition of result.conditions) {
  assert.equal(condition.outcome.b6Cutoff, 0);
  assert.ok(condition.outcome.b6Cutoff + condition.outcome.voluntaryReturn <= condition.runs);
}
