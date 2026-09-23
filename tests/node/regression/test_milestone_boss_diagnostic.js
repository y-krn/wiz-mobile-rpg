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
const productionB30First = await runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-hp-wall", allowSmallRunCount: true
});
const productionB30Second = await runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-hp-wall", allowSmallRunCount: true
});
const productionAtkB30First = await runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-atk-pressure", allowSmallRunCount: true
});
const productionAtkB30Second = await runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-atk-pressure", allowSmallRunCount: true
});
const fullB30 = first.cells.find(cell => cell.floor === 30);

function assertSameObservedSpecialDamage(cell, profile) {
  for (const special of ["breath", "MADALTO", "TILTOWAIT"]) {
    for (const defense of ["defendedDamagePerHit", "undefendedDamagePerHit"]) {
      const baseline = cell.arms.baseline.specialDamageByDefense[special][defense];
      const candidate = cell.arms.candidate.specialDamageByDefense[special][defense];
      assert.equal(baseline.count, candidate.count, `${profile} ${special} ${defense} observation counts must match`);
      if (baseline.count > 0) {
        assert.notEqual(baseline.average, null, `${profile} ${special} ${defense} baseline must have an observed average`);
        assert.notEqual(candidate.average, null, `${profile} ${special} ${defense} candidate must have an observed average`);
        assert.equal(baseline.average, candidate.average, `${profile} ${special} ${defense} damage must stay unchanged`);
      }
    }
  }
  assert.ok(cell.arms.baseline.specialDamageByDefense.MADALTO.undefendedDamagePerHit.count > 0,
    `${profile} must observe MADALTO damage`);
  assert.ok(cell.arms.baseline.specialDamageByDefense.TILTOWAIT.defendedDamagePerHit.count > 0,
    `${profile} must observe defended TILTOWAIT damage`);
}

assert.deepEqual(first, second, "milestone boss smoke must be deterministic");
assert.deepEqual(b30First, b30Second, "B30 diagnostic smoke must be deterministic");
assert.deepEqual(productionB30First, productionB30Second, "production B30 HP wall smoke must be deterministic");
assert.deepEqual(productionAtkB30First, productionAtkB30Second, "production B30 ATK pressure smoke must be deterministic");
assert.equal(RUNNER_VERSION, "issue1668-b30-production-atk-pressure-v1");
assert.equal(SCHEMA_VERSION, 12);
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
assert.equal(fullB30.arms.baseline.endBossMaxHp.average, 1280);
assert.equal(fullB30.arms.baseline.bossAtk.average, 39);
assert.equal(fullB30.arms.candidate.endBossMaxHp.average, 640);
assert.equal(fullB30.arms.candidate.bossAtk.average, 39);
for (const armName of ["baseline", "candidate"]) {
  assert.ok(fullB30.arms[armName].executedFightRounds.average > 0,
    `milestone-boss-diagnostic ${armName} must exercise opening Fight`);
  assert.equal(fullB30.arms[armName].recoveryActivations.average, 1);
}
assert.equal(fullB30.pairedComparison.pairing.includes("same worldSeed"), true);
assertSameObservedSpecialDamage(fullB30, "milestone-boss-diagnostic");
assert.deepEqual(b30First.configuration.depths, [30]);
assert.equal(b30First.measurementId, "b30-atk-pressure-diagnostic");
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
  assert.ok(arm.executedFightRounds.average > 0, `${armName} must exercise opening Fight`);
}
assert.equal(b30First.cells[0].arms.baseline.deaths, 1, "seed 1613 B30 smoke exercises death remaining HP summary");
assert.equal(b30First.cells[0].arms.baseline.endBossHp.average, 330);
assert.equal(b30First.cells[0].arms.baseline.endBossMaxHp.average, 640);
assert.equal(b30First.cells[0].arms.baseline.bossAtk.average, 39);
assert.equal(b30First.cells[0].arms.candidate.bossAtk.average, 26);
assert.equal(b30First.cells[0].arms.candidate.endBossMaxHp.average, 640);
assert.equal(productionB30First.measurementId, "b30-production-hp-wall-diagnostic");
assert.equal(productionB30First.configuration.fixedEncounterScaling, "production scaleEnemyForDepth(..., { boss: true })");
assert.deepEqual(productionB30First.configuration.b30ExpectedStats, {
  baseline: { hp: 1842, atk: 52, def: 25 },
  candidate: { hp: 640, atk: 52, def: 25 }
});
for (const [armName, expectedStats] of Object.entries(productionB30First.configuration.b30ExpectedStats)) {
  const arm = productionB30First.cells[0].arms[armName];
  assert.equal(arm.endBossMaxHp.average, expectedStats.hp, `${armName} production B30 HP`);
  assert.equal(arm.bossAtk.average, expectedStats.atk, `${armName} production B30 ATK`);
  assert.equal(arm.bossDef.average, expectedStats.def, `${armName} production B30 DEF`);
  assert.equal(arm.recoveryActivations.average, 1, `${armName} recovery opening`);
  assert.ok(arm.executedFightRounds.average > 0, `${armName} opening Fight`);
}
assert.match(productionB30First.cells[0].pairedComparison.pairing, /same worldSeed/);
assertSameObservedSpecialDamage(productionB30First.cells[0], "production B30 HP wall");
const productionSummary = buildSummary({
  ...productionB30First,
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
});
assert.equal(productionSummary.split("\n")[0], "# B30 production scaling HP wall diagnostic (#1666)");
assert.match(productionSummary, /baseline HP=1842 \/ ATK=52 \/ DEF=25; candidate HP=640 \/ ATK=52 \/ DEF=25/);
assert.equal(productionAtkB30First.measurementId, "b30-production-atk-pressure-diagnostic");
assert.equal(productionAtkB30First.configuration.fixedEncounterScaling, "production scaleEnemyForDepth(..., { boss: true })");
assert.deepEqual(productionAtkB30First.configuration.b30ExpectedStats, {
  baseline: { hp: 640, atk: 52, def: 25 },
  candidate: { hp: 640, atk: 26, def: 25 }
});
const productionAtkB30Cell = productionAtkB30First.cells[0];
for (const [armName, expectedStats] of Object.entries(productionAtkB30First.configuration.b30ExpectedStats)) {
  const arm = productionAtkB30Cell.arms[armName];
  assert.equal(arm.endBossMaxHp.average, expectedStats.hp, `${armName} production B30 HP`);
  assert.equal(arm.bossAtk.average, expectedStats.atk, `${armName} production B30 ATK`);
  assert.equal(arm.bossDef.average, expectedStats.def, `${armName} production B30 DEF`);
  assert.equal(arm.recoveryActivations.average, 1, `${armName} recovery opening`);
  assert.ok(arm.executedFightRounds.average > 0, `${armName} opening Fight`);
}
assert.equal(productionAtkB30Cell.pairedComparison.recoveryActivationsDelta.average, 0);
assert.match(productionAtkB30Cell.pairedComparison.pairing, /same worldSeed/);
assertSameObservedSpecialDamage(productionAtkB30Cell, "production B30 ATK pressure");
assert.deepEqual(
  productionAtkB30Cell.arms.candidate.queuedSpecialCorrespondence,
  productionAtkB30Cell.arms.baseline.queuedSpecialCorrespondence,
  "production B30 special cycle must stay paired"
);
for (const armName of ["baseline", "candidate"]) {
  const arm = productionAtkB30Cell.arms[armName];
  for (const [special, observations] of Object.entries(arm.queuedSpecialCorrespondence)) {
    assert.equal(observations.queuedTurns, observations.resolvedTurns,
      `${armName} ${special} cycle resolves every queued special`);
  }
}
const productionAtkSummary = buildSummary({
  ...productionAtkB30First,
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
});
assert.equal(productionAtkSummary.split("\n")[0], "# B30 production scaling ATK pressure diagnostic (#1668)");
assert.match(productionAtkSummary, /baseline HP=640 \/ ATK=52 \/ DEF=25; candidate HP=640 \/ ATK=26 \/ DEF=25/);
assert.equal(b30First.cells[0].arms.baseline.endBossHpRate.average,
  330 / 640);
assert.ok(b30First.cells[0].arms.baseline.deathEndBossHp.average > 0);
assert.ok(b30First.cells[0].arms.baseline.deathEndBossHpRate.average > 0);
assert.equal(b30First.cells[0].arms.baseline.recoveryActivations.average, 1);
assert.ok(b30First.cells[0].arms.candidate.recoveryActivations.average > 0);
assert.equal(b30First.cells[0].arms.candidate.recoveryActivations.average, 1);
assert.equal(b30First.cells[0].arms.candidate.endBossMaxHp.average, 640);
assertSameObservedSpecialDamage(b30First.cells[0], "b30-atk-pressure-diagnostic");
assert.equal(b30First.cells[0].pairedComparison.endBossHpDelta.count, 1);
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
assert.match(b30Summary, /schema: 12/);
assert.equal(b30Summary.split("\n")[0], "# B30 generic ATK scaling diagnostic (#1664)");
assert.match(b30Summary, /39→26/);
assert.match(b30Summary, /baseline boss remaining=/);
assert.match(b30Summary, /"maxHp":\{"count":1,"average":640/);
assert.match(b30Summary, /"endBossMaxHp":\{"count":1,"average":640/);
assert.match(b30Summary, /deathEndBossHp/);
assert.match(b30Summary, /executedFightRoundsDelta/);
const milestoneSummary = buildSummary({
  ...first,
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
});
assert.match(milestoneSummary, /baseline HP=1280 \/ ATK=39, candidate HP=640 \/ ATK=39/);
assert.equal(milestoneSummary.split("\n")[0], "# milestone Boss decision-pressure diagnostic (#1613)");

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
assert.ok(MEASUREMENT_IDS.includes("b30-production-hp-wall-diagnostic"));
assert.ok(MEASUREMENT_IDS.includes("b30-production-atk-pressure-diagnostic"));
const productionAtkInvocation = resolveRunnerInvocation({
  measurement: "b30-production-atk-pressure-diagnostic",
  runType: "diagnostic",
  purpose: "Issue 1668 production scaling ATK pressure smoke"
});
assert.ok(productionAtkInvocation.args.includes("--profile"));
assert.ok(productionAtkInvocation.args.includes("production-atk-pressure"));
const productionInvocation = resolveRunnerInvocation({
  measurement: "b30-production-hp-wall-diagnostic",
  runType: "diagnostic",
  purpose: "Issue 1666 production scaling HP wall smoke"
});
assert.ok(productionInvocation.args.includes("--floor"));
assert.ok(productionInvocation.args.includes("--profile"));
assert.ok(productionInvocation.args.includes("production-hp-wall"));
const invocation = resolveRunnerInvocation({
  measurement: "milestone-boss-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1613-test"
});
assert.equal(invocation.runner, "scratch/measurements/milestone_boss_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

console.log("[PASS] Issue #1668 production B30 ATK pressure; Issue #1666 HP wall; Issue #1664 ATK diagnostic");
