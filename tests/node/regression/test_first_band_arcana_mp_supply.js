import assert from "node:assert/strict";
import { createStartingKitCharacter } from "../../../src/state.js";
import { ITEM_EFFECTS } from "../../../src/systems/item_effects.js";

import {
  ARCANA_MP_SUPPLY_MEASUREMENT_ID,
  ARCANA_MP_SUPPLY_MODE,
  buildSummary,
  runMeasurement
} from "../../../scratch/measurements/first_band_build_formation.js";

process.env.SIM_SKIP_PROVENANCE = "1";

const result = await runMeasurement({ runs: 1, seed: 1277, mode: ARCANA_MP_SUPPLY_MODE });

const manaProbe = createStartingKitCharacter("arcana");
manaProbe.mp = 0;
ITEM_EFFECTS.MANA_POTION({ char: manaProbe });
assert.equal(manaProbe.mp, 3);
manaProbe.mp = 2;
ITEM_EFFECTS.MANA_POTION({ char: manaProbe });
assert.equal(manaProbe.mp, 3, "MANA_POTION must respect maxMP cap");

assert.equal(result.configuration.measurementId, ARCANA_MP_SUPPLY_MEASUREMENT_ID);
assert.deepEqual(result.configuration.arms, ["W0", "W1", "W2", "R"]);
assert.deepEqual(result.configuration.startingKits, ["arcana"]);
assert.equal(result.baselineParity.pass, true);
assert.equal(result.determinism.pass, true);
assert.equal(result.observationInvariance.pass, true);

const expectedMana = { W0: 0, W1: 1, W2: 2, R: 0 };
for (const armId of result.configuration.arms) {
  const arm = result.arms[armId];
  const preparation = arm.byKit.arcana.preparation;
  const lifecycle = arm.overview.manaPotionLifecycle;
  assert.equal(arm.smoke.totalRuns, 1);
  assert.equal(preparation.additionalManaPotions, expectedMana[armId]);
  assert.equal(preparation.departureCraft.recipeIds.filter(id => id === "MANA_POTION").length, expectedMana[armId]);
  assert.equal(preparation.departureCraft.purchaseSource, "actual-meta-bank");
  assert.equal(lifecycle.departureRequested.total, expectedMana[armId]);
  assert.equal(lifecycle.departureCrafted.total, expectedMana[armId]);
  assert.equal(lifecycle.acquiredBySource.departureCraft.total, expectedMana[armId]);
  assert.equal(lifecycle.reconciliation, true);
  assert.equal(preparation.supplies.TOWN_PORTAL, 1);
  assert.equal(preparation.supplies.HEAL_POTION, 4);
  assert.equal(preparation.supplies.ANTIDOTE, 1);
  assert.equal(preparation.supplies.GUARD_POTION, 1);
  assert.equal(arm.overview.buildCheckpoints[2].weaponSwapCount.total, 0);
  assert.equal(arm.overview.buildCheckpoints[5].weaponSwapCount.total, 0);
  assert.ok(arm.overview.buildCheckpoints[2].nonWeaponSwapCount.total >= 0);
}

assert.equal(result.arms.W0.byKit.arcana.preparation.startingMp, 1);
assert.equal(result.arms.W0.byKit.arcana.preparation.maxMp, 3);
assert.equal(result.arms.W1.byKit.arcana.preparation.startingMp, 1);
assert.equal(result.arms.W1.byKit.arcana.preparation.maxMp, 3);
assert.equal(result.arms.W2.byKit.arcana.preparation.startingMp, 1);
assert.equal(result.arms.W2.byKit.arcana.preparation.maxMp, 3);
assert.equal(result.arms.R.byKit.arcana.preparation.startingMp, 1);
assert.equal(result.arms.R.byKit.arcana.preparation.maxMp, 1);
assert.equal(result.arms.W0.byKit.arcana.preparation.medium, "WAND");
assert.deepEqual(result.arms.W0.byKit.arcana.preparation.activeRunes, ["HALITO"]);
assert.equal(result.arms.R.byKit.arcana.preparation.medium, null);
assert.deepEqual(result.arms.R.byKit.arcana.preparation.activeRunes, []);

for (const comparison of result.primaryComparisons) {
  assert.ok(comparison.label);
}
const w0Spell = result.arms.W0.overview.combat[1].spellTelemetry;
assert.ok(w0Spell.spellOpportunityRounds.total > 0);
assert.ok(w0Spell.eligibleSpellSelected.total > 0);
assert.ok(w0Spell.halitoCasts.total > 0);
assert.ok(Object.hasOwn(w0Spell.mpStart, "p25"));
assert.ok(Object.hasOwn(w0Spell.mpStart, "p75"));
assert.ok(Object.hasOwn(w0Spell.mpEnd, "p25"));
assert.ok(Object.hasOwn(w0Spell.mpEnd, "p75"));
assert.ok(result.arms.W0.overview.combat[1].entryMp.p50 >= 0);

const summary = buildSummary(result);
for (const token of [
  "configured runs=1/arm",
  "successful completion=true",
  "W1 - W0",
  "W2 - W1",
  "W2 - W0",
  "R - W0",
  "departureCraft",
  "recovered/capWaste",
  "capWaste",
  "N=1 bridge"
]) {
  assert.match(summary, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(summary, /Heavy N=500\/arm not run|heavy N=.*not run/i);

console.log("first-band-arcana-mp-supply diagnostic smoke: PASS");
