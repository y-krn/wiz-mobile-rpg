import assert from "node:assert/strict";

import {
  BOSS_FIXTURES,
  REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
  SCHEMA_VERSION,
  RUNNER_VERSION,
  resolveBossInventory,
  runMilestoneBossDiagnostic,
  buildSummary,
  resolveGuardianPressureMechanisms,
  resolveGuardianPressureSources,
  isGuardianPressureStatusDamage,
  observeRoundEndStatusDamage,
  summarizeSpecialDamageByDefense
} from "../../../scratch/measurements/milestone_boss_diagnostic.js";
import { getAppliedBossPressureMetadata } from "../../../scratch/simulations/sim_depth_material_ev.js";
import { PLAYER_FIXTURE } from "../../../scratch/measurements/composition_trait_diagnostic.js";
import {
  MEASUREMENT_IDS,
  resolveRunnerInvocation
} from "../../../scratch/measurements/run_balance_measurement.js";

const first = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });
const second = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, allowSmallRunCount: true });
const b30First = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, floor: 30, allowSmallRunCount: true });
const b30Second = await runMilestoneBossDiagnostic({ runs: 1, seed: 1613, floor: 30, allowSmallRunCount: true });

assert.deepEqual(first, second, "milestone boss smoke must be deterministic");
assert.deepEqual(b30First, b30Second, "B30 diagnostic smoke must be deterministic");
assert.equal(RUNNER_VERSION, "issue1662-b30-hp-hard-wall-diagnostic-v1");
assert.equal(SCHEMA_VERSION, 9);
assert.equal(first.runnerVersion, RUNNER_VERSION);
assert.equal(first.measurementId, "milestone-boss-diagnostic");
assert.deepEqual(first.configuration.depths, [5, 10, 15, 20, 25, 30]);
assert.deepEqual(first.configuration.playerFixture, {
  ...PLAYER_FIXTURE,
  weaponProfile: PLAYER_FIXTURE.weapon,
  armorProfile: PLAYER_FIXTURE.armor,
  shieldProfile: PLAYER_FIXTURE.shield
});
assert.equal(first.configuration.reflectPhysicalDiagnosticFreeze, REFLECT_PHYSICAL_DIAGNOSTIC_RATE);
assert.equal(first.configuration.scaling, "HP = 1 + 0.20 × Tier; ATK = 1 + 0.10 × Tier; DEF = 1.0");
assert.equal(first.cells.length, BOSS_FIXTURES.length);
assert.deepEqual(b30First.configuration.depths, [30]);
assert.equal(b30First.measurementId, "b30-hard-wall-diagnostic");
assert.equal(b30First.cells.length, 1);
assert.equal(b30First.cells[0].runs, 1);
assert.equal(b30First.cells[0].confidence, "runner-correctness-only");
assert.ok(b30First.cells[0].specialDamageByDefense.TILTOWAIT.defendedHitCount > 0);
assert.equal(b30First.cells[0].arms.baseline.deaths, b30First.cells[0].deaths);
assert.equal(b30First.cells[0].arms.candidate.runs, 1);
for (const armName of ["baseline", "candidate"]) {
  const arm = b30First.cells[0].arms[armName];
  assert.ok(Number.isFinite(arm.endBossMaxHp.average));
  assert.equal(arm.endBossMaxHp.count, arm.runs);
  assert.ok(Number.isFinite(arm.endBossHp.average));
  assert.ok(Number.isFinite(arm.endBossHpRate.average));
  assert.equal(arm.deathEndBossHp.count, arm.deaths);
  assert.equal(arm.deathEndBossHpRate.count, arm.deaths);
  assert.ok(Number.isFinite(arm.executedFightRounds.average));
}
assert.equal(b30First.cells[0].arms.baseline.deaths, 1, "seed 1613 B30 smoke exercises death remaining HP summary");
assert.equal(b30First.cells[0].arms.baseline.endBossHp.average, 970);
assert.equal(b30First.cells[0].arms.baseline.endBossMaxHp.average, 1280);
assert.equal(b30First.cells[0].arms.baseline.endBossHpRate.average, 970 / 1280);
assert.ok(b30First.cells[0].arms.baseline.deathEndBossHp.average > 0);
assert.ok(b30First.cells[0].arms.baseline.deathEndBossHpRate.average > 0);
assert.equal(b30First.cells[0].arms.baseline.recoveryActivations.average, 1);
assert.ok(b30First.cells[0].arms.candidate.recoveryActivations.average > 0);
assert.equal(b30First.cells[0].arms.candidate.recoveryActivations.average, 1);
assert.equal(b30First.cells[0].arms.candidate.endBossMaxHp.average, 640);
assert.equal(b30First.cells[0].arms.candidate.endBossHp.average, 330);
assert.equal(b30First.cells[0].arms.candidate.endBossHpRate.average, 330 / 640);
for (const key of [
  "roundsDelta",
  "executedFightRoundsDelta",
  "damageTakenDelta",
  "normalActionCountDelta",
  "recoveryActivationsDelta",
  "guardianPressureDamageDelta"
]) {
  assert.equal(b30First.cells[0].pairedComparison[key].average, 0, `${key} must stay frozen in the seed 1613 smoke`);
}
assert.equal(b30First.cells[0].pairedComparison.endBossHpDelta.average, -640);
assert.equal(
  b30First.cells[0].arms.baseline.queuedSpecialCorrespondence.TILTOWAIT.guardedTurns,
  b30First.cells[0].arms.baseline.queuedSpecialCorrespondence.TILTOWAIT.queuedTurns
);
assert.ok(Number.isFinite(b30First.cells[0].pairedComparison.normalActionCountDelta.average));
assert.ok(Number.isFinite(b30First.cells[0].pairedComparison.recoveryActivationsDelta.average));
for (const key of ["endBossHpDelta", "endBossHpRateDelta", "executedFightRoundsDelta"]) {
  assert.equal(b30First.cells[0].pairedComparison[key].count, 1);
}
assert.equal(
  b30First.cells[0].pairedComparison.executedFightRoundsDelta.average,
  b30First.cells[0].arms.candidate.executedFightRounds.average - b30First.cells[0].arms.baseline.executedFightRounds.average
);
assert.equal(b30First.cells[0].pairedComparison.pairing.includes("same worldSeed"), true);
assert.ok(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.queuedTurns > 0);
assert.equal(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.guardedTurns,
  b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.queuedTurns);
assert.ok(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.guardedAndResolvedTurns > 0);
assert.ok(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.addedGuardTurns > 0);
assert.equal(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.breath.addedGuardTurns, 0);
assert.ok(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.MADALTO.queuedTurns > 0);
assert.equal(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.MADALTO.addedGuardTurns, 0);
assert.equal(b30First.cells[0].arms.candidate.queuedSpecialCorrespondence.TILTOWAIT.guardedButUnresolvedTurns, 0);
assert.ok(b30First.cells[0].guardianPressureDamage.totalDamagePerRun.average > 0);
assert.ok(Object.keys(b30First.cells[0].guardianPressureDamage.bySource).some(source => source.startsWith("summonedAlly:")));
for (const action of ["normal", "breath", "MADALTO", "TILTOWAIT", "guardian-pressure"]) {
  assert.ok(Object.hasOwn(b30First.cells[0].damageByAction, action));
}
for (const action of ["breath", "MADALTO", "TILTOWAIT"]) {
  assert.ok(Object.hasOwn(b30First.cells[0].specialDamageByDefense, action));
}
const pressureFixture = [{
  additionalTraits: ["chargeAttack", "multiAction", "summonAlly"],
  additionalBehavior: { isSniper: true, isPoisonous: true }
}];
const pressureTraitAction = {
  monsterName: "いにしえの竜",
  traitSources: ["chargeAttack", "isSniper", "multiAction"],
  statusSources: ["poison"]
};
assert.deepEqual(resolveGuardianPressureMechanisms(pressureTraitAction, "いにしえの竜", pressureFixture), [
  "pressureTraitAction", "pressureStatusAction"
]);
assert.deepEqual(resolveGuardianPressureSources(pressureTraitAction, "いにしえの竜", pressureFixture), [
  "trait:chargeAttack", "trait:isSniper", "trait:multiAction", "status:poison"
]);
assert.deepEqual(resolveGuardianPressureMechanisms({ monsterName: "召喚敵" }, "いにしえの竜", pressureFixture), ["summonedAlly"]);
assert.equal(isGuardianPressureStatusDamage("poison", pressureFixture), true);
assert.equal(isGuardianPressureStatusDamage("poison", []), false);
assert.deepEqual(observeRoundEndStatusDamage({ statusSource: "poison", damage: 7, lethal: true }, pressureFixture, [], 4), {
  category: "round-end-status",
  actionName: "poison",
  sourceName: null,
  damage: 7,
  defended: false,
  lethal: true,
  roundIndex: 4,
  pressureMechanisms: ["roundEndStatusDamage"],
  pressureSources: ["status:poison"]
});
const guardDamage = summarizeSpecialDamageByDefense([
  { category: "breath", damage: 10, defended: true },
  { category: "breath", damage: 20, defended: false },
  { category: "breath", damage: 22, defended: false },
  { category: "MADALTO", damage: 15, defended: true }
]);
assert.equal(guardDamage.breath.defendedHitCount, 1);
assert.equal(guardDamage.breath.undefendedHitCount, 2);
assert.equal(guardDamage.breath.defendedDamagePerHit.average, 10);
assert.equal(guardDamage.breath.undefendedDamagePerHit.average, 21);
assert.equal(guardDamage.TILTOWAIT.defendedHitCount, 0);
assert.match(buildSummary({
  ...b30First,
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
}), /queue→Guard→special correspondence/i);
const b30Summary = buildSummary({
  ...b30First,
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
});
assert.match(b30Summary, /schema: 9/);
assert.match(b30Summary, /1280→640/);
assert.match(b30Summary, /baseline boss remaining=/);
assert.match(b30Summary, /"maxHp":\{"count":1,"average":1280/);
assert.match(b30Summary, /"endBossMaxHp":\{"count":1,"average":640/);
assert.match(b30Summary, /deathEndBossHp/);
assert.match(b30Summary, /executedFightRoundsDelta/);

assert.deepEqual(BOSS_FIXTURES.map(fixture => fixture.bossName), [
  "デーモンガード",
  "ストーンガード",
  "ポイズンジャイアント",
  "マスターデーモン",
  "レッドドラゴン",
  "いにしえの竜"
]);

const b5 = resolveBossInventory(BOSS_FIXTURES[0]);
assert.deepEqual(b5.rawStats, { hp: 180, atk: 18, def: 8 });
assert.equal(b5.spell, "LAHALITO");
assert.equal(b5.productionBossRule.breakHpRate, 0.80);
assert.equal(b5.productionBossRule.exposureTurns, 4);

const b10 = resolveBossInventory(BOSS_FIXTURES[1]);
assert.deepEqual(b10.traits, ["guardAdjacent"]);
assert.match(b10.guardInteraction.fixedSingleBossAdjacentGuard, /not exercised/);

const b15 = resolveBossInventory(BOSS_FIXTURES[2]);
assert.equal(b15.isPoisonous, true);
assert.equal(b15.statusPattern.id, "poison_payoff");
assert.equal(b15.statusPattern.active, false);
assert.match(b15.statusPattern.runtimeEligibility, /excluded/);
assert.equal(b15.legacyPoison.active, true);
assert.match(b15.legacyPoison.runtimeEligibility, /active/);
assert.equal(b15.legacyPoison.metric, "existing enemyActionEvents.statusSources");

const b30 = resolveBossInventory(BOSS_FIXTURES.at(-1));
assert.deepEqual(b30.customBossAction.actions, ["炎の息", "MADALTO", "TILTOWAIT"]);
assert.match(b30.guardInteraction.bossSpecific, /TILTOWAIT/);

for (const cell of first.cells) {
  assert.equal(cell.runs, 1);
  assert.deepEqual(cell.encounterTypes, ["boss"]);
  assert.ok(Number.isFinite(cell.rounds.average));
  assert.ok(Number.isFinite(cell.damageTaken.average));
  assert.ok(Number.isFinite(cell.bossActionCount.average));
  if (cell.floor === 30) assert.equal(cell.warningCount, null);
  else assert.ok(Number.isFinite(cell.warningCount.average));
  assert.ok(Number.isFinite(cell.spellActionCount.average));
  assert.ok(Number.isFinite(cell.statusActionCount.average));
  assert.ok(Number.isFinite(cell.guard.guardRounds.average));
  assert.equal(cell.confidence, "runner-correctness-only");
  assert.equal(cell.trialBands.length, 1);
  assert.deepEqual(Object.keys(cell.trialBands[0]).sort(), ["bandIndex", "count", "mainId", "subId"]);
  assert.equal(cell.guardianPressures.length, 2);
  for (const pressure of cell.guardianPressures) {
    assert.ok(["main", "sub"].includes(pressure.role));
    assert.ok(pressure.themeId);
    assert.ok(pressure.sourceName);
    assert.ok(Array.isArray(pressure.additionalTraits));
    assert.equal(typeof pressure.additionalBehavior, "object");
    assert.equal(pressure.count, 1);
  }
}

assert.deepEqual(first.cells[0].trialBands[0], {
  bandIndex: 0,
  mainId: "status",
  subId: "endurance",
  count: 1
});
assert.deepEqual(first.cells[0].guardianPressures, [
  {
    role: "main",
    themeId: "status",
    sourceName: "泥の呪い子",
    additionalTraits: ["debuffPhysicalDef"],
    additionalBehavior: { traitChance: 0.2, debuffValue: 2 },
    count: 1
  },
  {
    role: "sub",
    themeId: "endurance",
    sourceName: "石像兵",
    additionalTraits: ["guardAdjacent"],
    additionalBehavior: { guard: { chance: 0.5 } },
    count: 1
  }
]);

const overlapMetadata = getAppliedBossPressureMetadata(
  {
    traits: ["templateTrait"],
    sharedBehavior: "template",
    templateOnlyBehavior: true
  },
  [
    {
      role: "main",
      themeId: "main-theme",
      sourceName: "main-source",
      traits: ["templateTrait", "sharedTrait", "mainTrait"],
      behavior: { sharedBehavior: "main", mainBehavior: 1 }
    },
    {
      role: "sub",
      themeId: "sub-theme",
      sourceName: "sub-source",
      traits: ["sharedTrait", "subTrait"],
      behavior: { sharedBehavior: "sub", mainBehavior: 2, subBehavior: 3 }
    }
  ]
);
assert.deepEqual(overlapMetadata.map(pressure => ({
  additionalTraits: pressure.additionalTraits,
  additionalBehavior: pressure.additionalBehavior
})), [
  {
    additionalTraits: ["sharedTrait", "mainTrait"],
    additionalBehavior: { mainBehavior: 1 }
  },
  {
    additionalTraits: ["subTrait"],
    additionalBehavior: { subBehavior: 3 }
  }
]);

assert.ok(MEASUREMENT_IDS.includes("milestone-boss-diagnostic"));
const invocation = resolveRunnerInvocation({
  measurement: "milestone-boss-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1613-test"
});
assert.equal(invocation.runner, "scratch/measurements/milestone_boss_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

console.log("[PASS] Issue #1662 B30 HP-scaling diagnostic and paired deltas");
