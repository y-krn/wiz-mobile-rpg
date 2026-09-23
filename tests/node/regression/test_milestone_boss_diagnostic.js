import assert from "node:assert/strict";

import {
  BOSS_FIXTURES,
  REFLECT_PHYSICAL_DIAGNOSTIC_RATE,
  SCHEMA_VERSION,
  RUNNER_VERSION,
  resolveBossInventory,
  runBossArm,
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
const fullB30 = first.cells.find(cell => cell.floor === 30);
const b10Candidate = first.cells.find(cell => cell.floor === 10);
const b10Default = runBossArm({ fixture: BOSS_FIXTURES.find(fixture => fixture.floor === 10), runs: 1, seed: 1613 });

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
assert.equal(RUNNER_VERSION, "issue1674-b10-crush-strike-opening-v1");
assert.equal(SCHEMA_VERSION, 14);
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
assert.equal(b10Default.summary.crushStrike.queued, 0, "production default has no candidate telegraph");
assert.equal(b10Default.summary.crushStrike.resolved, 0, "production default has no candidate resolve");
for (const armName of ["unread", "read"]) {
  const arm = b10Candidate.arms[armName];
  assert.ok(arm.crushStrike.queued > 0, `B10 ${armName} queues 砕岩打ち`);
  assert.ok(arm.crushStrike.resolved > 0, `B10 ${armName} resolves 砕岩打ち`);
  assert.ok(arm.crushStrike.queued === arm.crushStrike.resolved ||
    arm.crushStrike.queued === arm.crushStrike.resolved + 1,
  `B10 ${armName} may end with one outstanding telegraph when combat ends`);
  const events = arm.crushStrike.events;
  const queued = events.filter(event => event.phase === "queued");
  const resolved = events.filter(event => event.phase === "resolved");
  assert.ok(resolved.every((event, index) => event.targetIdx === queued[index]?.targetIdx),
    `B10 ${armName} telegraph and resolve target match`);
  assert.equal(events[0].phase, "opening-delay",
    `B10 ${armName} begins with one normal action without telegraph`);
  assert.equal(events[0].round, 1);
  assert.equal(events[1].phase, "queued",
    `B10 ${armName} telegraphs after the second normal action`);
  assert.equal(events[1].round, 2);
  assert.equal(events[2].phase, "resolved",
    `B10 ${armName} resolves on round three`);
  assert.equal(events[2].round, 3);
  assert.ok(resolved.every((event, index) => event.round > queued[index].round),
    `B10 ${armName} resolves after telegraph`);
  assert.ok(resolved.every(event => event.rolledDamage >= 18 && event.rolledDamage <= 32));
}
assert.ok(b10Candidate.arms.read.crushStrike.events.some((event, index, events) =>
  event.phase === "cooldown" && events[index + 1]?.phase === "queued" &&
  events[index + 1].round === event.round + 1),
"B10 read preserves the existing one-normal-turn cooldown before retelegraph");
assert.ok(b10Candidate.arms.read.crushStrike.events.some(event =>
  event.phase === "resolved" && event.guarded && event.responseAction === "defend"));
const unreadFightResolve = b10Candidate.arms.unread.crushStrike.events.find(event =>
  event.phase === "resolved" && event.responseAction === "fight");
assert.ok(unreadFightResolve, "B10 unread retains existing Fight policy on a queued resolve turn");
const pairedReadResolve = b10Candidate.arms.read.crushStrike.events.find(event =>
  event.phase === "resolved" && event.round === unreadFightResolve.round &&
  event.guarded && event.responseAction === "defend");
assert.ok(pairedReadResolve,
"B10 read adds Guard on the same paired queued-resolve turn where unread Fights");
assert.equal(pairedReadResolve.targetIdx, unreadFightResolve.targetIdx,
  "B10 paired arms resolve against the same queued target");
const unreadOpeningQueue = b10Candidate.arms.unread.crushStrike.events.find(event =>
  event.phase === "queued" && event.round === 2);
const readOpeningQueue = b10Candidate.arms.read.crushStrike.events.find(event =>
  event.phase === "queued" && event.round === 2);
assert.equal(readOpeningQueue.targetIdx, unreadOpeningQueue.targetIdx,
  "B10 paired opening telegraphs target the same character");
assert.equal(readOpeningQueue.rolledDamage, unreadOpeningQueue.rolledDamage,
  "B10 paired opening telegraphs schedule the same damage roll");
assert.equal(pairedReadResolve.rolledDamage, unreadFightResolve.rolledDamage,
  "B10 paired arms use the same seed-rolled crush-strike damage");
assert.equal(unreadFightResolve.guarded, false);
assert.equal(unreadFightResolve.tempDefDownAfter,
  Math.min(6, unreadFightResolve.tempDefDownBefore + 2));
assert.equal(pairedReadResolve.tempDefDownAfter, pairedReadResolve.tempDefDownBefore);
assert.equal(b10Default.summary.crushStrike.queued, 0,
  "production default remains opt-out with no queue");
assert.equal(b10Default.summary.crushStrike.resolved, 0,
  "production default remains opt-out with no resolve");
assert.ok(b10Candidate.arms.read.crushStrike.events.some(event =>
  event.phase === "resolved" && event.guarded && event.tempDefDownBefore === event.tempDefDownAfter));
assert.ok(b10Candidate.arms.unread.crushStrike.events.some(event =>
  event.phase === "resolved" && !event.guarded &&
  event.tempDefDownAfter === Math.min(6, event.tempDefDownBefore + 2)));
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
assert.match(b30Summary, /schema: 14/);
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
const issue1674Summary = buildSummary({
  ...first,
  configuration: { ...first.configuration, depths: [10], runs: 1 },
  cells: [b10Candidate],
  measurement: { sourceCommit: "test", productionPaths: [], environmentHash: "test" }
});
assert.equal(issue1674Summary.split("\n")[0], "# B10 砕岩打ち opening diagnostic (#1674)");
assert.match(issue1674Summary, /B10 paired 砕岩打ち: same seed=1613/);
assert.match(issue1674Summary, /both arms enabled/);

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
assert.ok(!MEASUREMENT_IDS.includes("b30-production-hp-wall-diagnostic"));
assert.ok(!MEASUREMENT_IDS.includes("b30-production-atk-pressure-diagnostic"));
await assert.rejects(runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-hp-wall", allowSmallRunCount: true
}), /unsupported milestone boss profile/);
await assert.rejects(runMilestoneBossDiagnostic({
  runs: 1, seed: 1613, floor: 30, profile: "production-atk-pressure", allowSmallRunCount: true
}), /unsupported milestone boss profile/);
const invocation = resolveRunnerInvocation({
  measurement: "milestone-boss-diagnostic",
  purpose: "bounded smoke",
  output_dir: "/tmp/issue-1613-test"
});
assert.equal(invocation.runner, "scratch/measurements/milestone_boss_diagnostic.js");
assert.ok(invocation.args.includes("--purpose"));

console.log("[PASS] Phase 2a and milestone Boss diagnostics; retired production B30 profiles");
