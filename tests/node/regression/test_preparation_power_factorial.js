import assert from "node:assert/strict";

import {
  CONDITION_IDS,
  INITIAL_MATERIAL_BANK,
  STARTING_KIT_IDS,
  runMeasurement
} from "../../../scratch/measurements/preparation_power_factorial.js";

const result = await runMeasurement({ runs: 1, seed: 1328 });
const byId = Object.fromEntries(result.conditions.map(condition => [condition.id, condition]));

assert.deepEqual(Object.keys(byId), CONDITION_IDS);
assert.equal(result.configuration.totalRuns, 16);
assert.deepEqual(result.configuration.initialMaterialBank, INITIAL_MATERIAL_BANK);
assert.equal(result.configuration.inventoryContract.capacity, 20);
assert.equal(result.determinism.status, "PASS");
assert.equal(result.observationInvariance.status, "PASS");

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
