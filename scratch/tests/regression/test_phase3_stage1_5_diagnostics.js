import assert from "node:assert/strict";
import {
  PERSONA_POLICIES,
  runMeasurement
} from "../../measurements/issue990_phase3_stage1.js";

const floors = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const report = runMeasurement({
  seed: "issue990-stage1.5-regression",
  runs: 2,
  personas: Object.keys(PERSONA_POLICIES),
  collectStage15Diagnostics: true,
  runnerVersion: "issue990-phase3-stage1.5-v1",
  schemaVersion: 2,
  runnerPath: "scratch/measurements/issue990_phase3_stage1_5.js"
});

assert.equal(report.schemaVersion, 2);
assert.equal(report.measurement.runnerVersion, "issue990-phase3-stage1.5-v1");
assert.equal(report.measurement.configuration.startFloor, 1);
assert.equal(report.measurement.configuration.forcedPush, true);
assert.equal(report.measurement.configuration.retreatModeled, false);
assert.deepEqual(report.measurement.configuration.stage15Floors, floors);
assert.equal(report.audit.hiddenStairsUsed, false);
assert.equal(report.audit.hiddenBossUsed, false);
assert.equal(report.audit.hiddenSecretDoorUsed, false);
assert.equal(report.audit.futureEncounterInfoUsed, false);
assert.equal(report.audit.futureLootUsed, false);
assert.equal(report.audit.unidentifiedHiddenAffixUsed, false);
assert.equal(report.audit.rawEncounterHistoryStored, false);

for (const persona of Object.keys(PERSONA_POLICIES)) {
  const diagnostic = report.stage15Diagnostics.byPersona[persona];
  assert.ok(diagnostic, `${persona} diagnostics exist`);
  assert.deepEqual(Object.keys(diagnostic.floors).map(Number), floors);
  for (const floor of floors) {
    const value = diagnostic.floors[String(floor)];
    assert.equal(value.entered, value.survived + value.died + value.incomplete);
    for (const field of ["mpSpent", "mpRecovered", "damageTaken", "rounds", "enemyActions", "normalHits", "normalDamage"]) {
      assert.ok(value[field] >= 0, `${persona} B${floor} ${field} is non-negative`);
    }
    for (const side of ["entry", "exit"]) {
      for (const field of ["hpRatio", "mpRatio"]) {
        assert.ok(value[side][field].n <= value.entered);
      }
    }
  }
  assert.deepEqual(Object.keys(diagnostic.mpBuckets), ["0%", "1-25%", "26-50%", "51-75%", "76-100%"]);
  for (const bucket of Object.values(diagnostic.mpBuckets)) {
    assert.ok(bucket.encounters >= bucket.clear + bucket.death);
    assert.ok(bucket.rounds >= 0);
  }
  for (const spell of Object.values(diagnostic.spellUsage)) {
    assert.ok(spell.castCount >= spell.successfulCasts);
    assert.ok(spell.totalMpSpent >= 0);
  }
  for (const bucket of Object.values(diagnostic.b5MpSurvival)) {
    assert.ok(["observed", "insufficient", "unobserved"].includes(bucket.status));
    if (bucket.status !== "observed") assert.equal(bucket.B6Rate, null);
  }
  assert.ok(diagnostic.representativeSamples);
  assert.ok(Object.values(diagnostic.representativeSamples).every(samples => samples.length <= 50));
}

const repeat = runMeasurement({
  seed: "issue990-stage1.5-regression",
  runs: 2,
  personas: Object.keys(PERSONA_POLICIES),
  collectStage15Diagnostics: true,
  runnerVersion: "issue990-phase3-stage1.5-v1",
  schemaVersion: 2,
  runnerPath: "scratch/measurements/issue990_phase3_stage1_5.js"
});
assert.deepEqual(repeat.stage15Diagnostics, report.stage15Diagnostics, "Stage 1.5 diagnostics are deterministic");
assert.equal(report.raw, undefined);
console.log("[PASS] Phase 3 Stage 1.5 floor, HP/MP, action, spell, bucket, survivor, and evidence contracts");
