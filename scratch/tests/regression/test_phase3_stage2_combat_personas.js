import assert from "node:assert/strict";
import {
  FLOORS,
  POLICIES,
  runMeasurement,
  SCHEMA_VERSION,
  validatePolicyFixture
} from "../../measurements/issue990_phase3_stage2_combat_personas.js";
import { COMBAT_POLICY_IDS, selectSimulationCombatActionForPolicy } from "../../simulations/sim_depth_material_ev.js";

assert.deepEqual(POLICIES, ["balanced-combat", "mp-conserving", "burst-combat"]);
assert.deepEqual(COMBAT_POLICY_IDS, POLICIES);
assert.deepEqual(FLOORS.slice(0, 15), Array.from({ length: 15 }, (_, index) => index + 1));
assert.deepEqual(validatePolicyFixture().actions, {
  "balanced-combat": { type: "spell", targetIdx: 0, spellName: "HALITO" },
  "mp-conserving": { type: "fight", targetIdx: 0 },
  "burst-combat": { type: "spell", targetIdx: 0, spellName: "MAHALITO" }
});

const report = runMeasurement({ seed: "issue990-stage2-regression", runs: 1 });
assert.equal(report.schemaVersion, SCHEMA_VERSION);
assert.equal(report.measurement.configuration.startFloor, 1);
assert.equal(report.measurement.configuration.forcedPush, true);
assert.equal(report.measurement.configuration.retreatModeled, false);
assert.deepEqual(report.measurement.configuration.policies, [...POLICIES]);
assert.equal(report.measurement.worldSeedTemplate, "issue990-stage2-regression:world:{runIndex}");
assert.equal(report.audit.rawEncounterHistoryStored, false);
assert.equal(report.audit.productionBalanceChanged, false);
assert.equal(report.audit.productionCombatSelectorChanged, false);

for (const policy of POLICIES) {
  const summary = report.policies[policy];
  for (const floor of FLOORS) {
    const value = summary.floors[String(floor)];
    assert.equal(value.entered, value.reachedNextFloor + value.died + value.incomplete, `${policy} B${floor} floor partition`);
    assert.ok(value.incomplete >= 0);
    assert.equal(Object.values(value.incompleteReasons).reduce((total, count) => total + count, 0), value.incomplete, `${policy} B${floor} incomplete reasons`);
    assert.equal(Object.values(value.incompleteTerminationReasons).reduce((total, count) => total + count, 0), value.incomplete, `${policy} B${floor} termination reasons`);
    assert.ok(value.mpSpent >= 0);
    assert.ok(value.mpRecovered >= 0);
  }
  for (const category of ["pure_raw_damage", "mechanic_mediated_raw_lethal", "direct_mechanic_death", "unknown_or_mixed"]) {
    assert.ok(Object.hasOwn(summary.deathCategories, category));
  }
}

assert.equal(report.comparison.personaPairs.length, 3);
assert.equal(report.raw, undefined);
const repeat = runMeasurement({ seed: "issue990-stage2-regression", runs: 1 });
assert.deepEqual(repeat, report, "same seed and runIndex are deterministic");
assert.equal(selectSimulationCombatActionForPolicy({
  combatPolicy: "mp-conserving",
  character: { class: "Mage", spells: ["HALITO"], mp: 1, maxMp: 1 },
  enemies: [{ hp: 10, status: "ok" }],
  roundNumber: 1,
  canCastSpell: () => true
}).type, "fight");
console.log("[PASS] Phase 3 Stage 2 combat policies, current-info boundary, floor partitions, and determinism");
