import assert from "node:assert/strict";
import {
  ARMS,
  CONTEXTS,
  DEFAULT_SEED,
  RUNNER_PATH,
  RUNNER_VERSION,
  comparePreDeathProgress,
  runProgressionExpBFullRunDiagnostic
} from "../../../scratch/measurements/progression_exp_b_full_run_diagnostic.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";
import {
  applyFloorTransitionHeal,
  applyPhase4cV1EnemyBaseline,
  applyPhase4cV1MilestoneEntitlement,
  applyPhase4cV1SummonedEnemyBaseline,
  resetSimulationRandom,
  simulateRun,
  getScenarioById
} from "../../../scratch/simulations/sim_depth_material_ev.js";
import { MONSTERS } from "../../../src/data/monsters.js";
import { processMonsterDefeat } from "../../../src/combat_logic/monster_traits.js";

assert.equal(RUNNER_VERSION, "progression-exp-b-full-run-diagnostic-v2");
assert.equal(DEFAULT_SEED, 1735);
await assert.rejects(runProgressionExpBFullRunDiagnostic({ runs: 31, seed: DEFAULT_SEED }), /exactly 1 .*30 .*200/);
await assert.rejects(runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED + 1 }), /seed is frozen/);
assert.deepEqual(CONTEXTS.map(({ id, startFloor, targetDepth }) => [id, startFloor, targetDepth]), [
  ["continuous-B1", 1, 21],
  ["selected-B10", 10, 11],
  ["selected-B20", 20, 21]
]);
assert.deepEqual(ARMS, ["production", "phase4j-b"]);
assert.ok(MEASUREMENT_IDS.includes("progression-exp-b-full-run-diagnostic"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.deepEqual(classifySimulationRunner(RUNNER_PATH), {
  pattern: RUNNER_PATH,
  lifecycle: "reusable",
  scope: "run"
});
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-b-full-run-diagnostic",
  purpose: "N=1 deterministic smoke",
  output_dir: "/tmp/progression-exp-b-full-run-diagnostic-test"
}).runner, RUNNER_PATH);

const report = await runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED });
const repeated = await runProgressionExpBFullRunDiagnostic({ runs: 1, seed: DEFAULT_SEED });
assert.deepEqual(report, repeated);
assert.equal(report.rows.length, CONTEXTS.length * ARMS.length);
assert.equal(report.validity.valid, true);
assert.deepEqual(report.validity.candidatePrefundedLevelViolations, []);
assert.deepEqual(report.validity.invalidCandidateSettlements, []);
assert.deepEqual(report.validity.sourceAccountingMismatches, []);
assert.equal(report.validity.firstCombatPreRewardStateAndOutcomeMatch, true);
assert.equal(report.validity.combatObservationMismatches.length, 0);
for (const row of report.rows) {
  assert.equal(row.combatExpCandidateId, row.arm);
  assert.ok(row.settlements.length > 0, `${row.context}/${row.arm} has an eligible generated combat`);
  for (const settlement of row.settlements) {
    assert.equal(settlement.settlement.sourceAccounted, true);
    if (row.arm === "phase4j-b" && settlement.settlement.valid) {
      assert.equal(settlement.prefundedLevels, 0);
    }
  }
  const expectedBaseline = row.context === "selected-B10" ? 2 : row.context === "selected-B20" ? 4 : 0;
  assert.equal(row.settlements[0].baseline, expectedBaseline);
  assert.equal(row.firstCombat.preRewardState.baseline, expectedBaseline);
  assert.equal(row.firstCombat.preRewardState.rawMaxHp, 20 + 2 * expectedBaseline);
  assert.equal(row.firstCombat.preRewardState.hp, row.firstCombat.preRewardState.rawMaxHp);
  if (row.context === "selected-B10") assert.equal(row.firstCombat.preRewardState.rawMaxHp, 24);
  if (row.context === "selected-B20") assert.equal(row.firstCombat.preRewardState.rawMaxHp, 28);
  for (const enemy of row.firstCombat.preRewardState.enemies.filter(entry => !entry.isBoss)) {
    const template = MONSTERS.find(entry =>
      entry.name === enemy.name.replace(/\s[A-Z]$/, "")
    );
    assert.ok(template, `generated enemy template exists for ${enemy.name}`);
    const band = row.firstCombat.preRewardState.enemyBand;
    assert.equal(enemy.maxHp, Math.max(1, Math.round(template.hp * (1 + 0.20 * band))));
    assert.equal(enemy.atk, Math.max(1, Math.round(template.atk * (1 + 0.10 * band))));
    assert.equal(enemy.def, Math.max(0, Math.round(template.def)));
  }
}

const selectedB20 = CONTEXTS.find(context => context.id === "selected-B20");
const precombatReproduction = await runProgressionExpBFullRunDiagnostic({
  runs: 1,
  seed: DEFAULT_SEED,
  contexts: [selectedB20],
  runIndices: [10]
});
assert.equal(precombatReproduction.rows.length, ARMS.length);
assert.deepEqual(precombatReproduction.rows.map(row => [row.arm, row.runIndex]), [
  ["production", 10],
  ["phase4j-b", 10]
]);
assert.equal(precombatReproduction.validity.valid, true);
assert.equal(precombatReproduction.validity.firstCombatPreRewardStateAndOutcomeMatch, true);
assert.deepEqual(precombatReproduction.validity.matchedArmMismatches, []);
assert.deepEqual(precombatReproduction.rows.map(row => [row.terminationReason, row.battles, row.battleObservationCount]), [
  ["death", 0, 0],
  ["death", 0, 0]
]);
assert.equal(precombatReproduction.rows[0].combatCoverage.precombatTermination, true);
assert.equal(precombatReproduction.rows[0].firstCombat, null);
assert.deepEqual(precombatReproduction.validity.coverage.map(({ arm, runs, runsWithCombatObservations, precombatTerminations, battles, observations }) => [
  arm, runs, runsWithCombatObservations, precombatTerminations, battles, observations
]), [
  ["production", 1, 0, 1, 0, 0],
  ["phase4j-b", 1, 0, 1, 0, 0]
]);

const milestoneState = {
  party: [{ maxHp: 20, hp: 10 }],
  currentRun: { startFloor: 1, defeatedMilestones: [] },
  simPolicy: {
    phase4cV1GeneratedRun: true,
    phase4cV1AppliedHpBonus: 0,
    phase4cV1DefeatedMilestones: []
  }
};
assert.equal(applyPhase4cV1MilestoneEntitlement(milestoneState, 5), 2);
assert.equal(milestoneState.party[0].maxHp, 22);
assert.equal(milestoneState.party[0].hp, 10, "baseline entitlement does not heal current HP");
assert.equal(applyFloorTransitionHeal(milestoneState.party[0], 0.5), 11);
assert.equal(milestoneState.party[0].hp, 21, "subsequent recovery uses updated baseline maxHP");

const splitTemplate = MONSTERS.find(monster => monster.traits?.includes("splitOnDeath"));
assert.ok(splitTemplate, "a generated generic enemy has split lifecycle");
const splitParent = structuredClone(splitTemplate);
applyPhase4cV1EnemyBaseline([splitParent], 10, false);
splitParent.hp = 0;
const splitEncounter = [splitParent];
processMonsterDefeat(splitEncounter, splitParent, []);
const splitChild = splitEncounter[1];
assert.ok(splitChild?.hasSplit, "split lifecycle creates a descendant");
assert.equal(splitChild.maxHp, Math.max(1, Math.floor(splitParent.maxHp * (splitParent.split?.hpRate ?? 0.5))));
assert.equal(splitChild.hp, splitChild.maxHp);
assert.equal(splitChild.atk, splitParent.atk);
assert.equal(splitChild.def, splitParent.def);

const summonTemplate = MONSTERS.find(monster => monster.name === "ゴブリンの呪術師");
assert.ok(summonTemplate, "the production default summon has a generic template");
const summonedEnemy = structuredClone(summonTemplate);
const phase4cEncounter = [...splitEncounter, summonedEnemy];
const generatedSummons = applyPhase4cV1SummonedEnemyBaseline({
  floor: 10,
  simPolicy: { phase4cV1GeneratedRun: true },
  combatState: { monsters: phase4cEncounter }
}, splitEncounter.length);
assert.deepEqual(generatedSummons, [summonedEnemy]);
assert.equal(summonedEnemy.maxHp, Math.max(1, Math.round(summonTemplate.hp * 1.4)));
assert.equal(summonedEnemy.hp, summonedEnemy.maxHp);
assert.equal(summonedEnemy.atk, Math.max(1, Math.round(summonTemplate.atk * 1.2)));
assert.equal(summonedEnemy.def, Math.max(0, Math.round(summonTemplate.def)));
assert.equal(summonedEnemy.phase4cV1Summoned, true);

const progressRow = (settlements, { battles = 0, outcome = "return" } = {}) => ({ settlements, battles, outcome });
const progressSettlement = (combatNumber, levelBefore, levelAfter, recoveryHp = 0, result = "victory") => ({
  combatNumber,
  levelBefore,
  levelAfter,
  levelUpRecoveryHp: recoveryHp,
  result
});
const controlProgress = progressRow([
  progressSettlement(1, 1, 2, 0),
  progressSettlement(2, 2, 2, 8),
  progressSettlement(3, 2, 2, 0),
  progressSettlement(4, 2, 3, 20)
], { battles: 4 });
const candidateDeath = progressRow([
  progressSettlement(1, 1, 2, 0),
  progressSettlement(2, 2, 2, 0),
  progressSettlement(3, 2, 2, 0, "death")
], { battles: 3, outcome: "death" });
assert.deepEqual(comparePreDeathProgress(controlProgress, candidateDeath), {
  deathCombatNumber: 3,
  deathBoundary: "combat-exclusive",
  lastIncludedCombatNumber: 2,
  controlBeforeDeath: { levels: 1, recoveryHp: 8 },
  candidateBeforeDeath: { levels: 1, recoveryHp: 0 },
  controlOnlyProgress: true
});
const controlLevelAhead = progressRow([
  progressSettlement(1, 1, 2),
  progressSettlement(2, 2, 3),
  progressSettlement(3, 3, 3, 0),
  progressSettlement(4, 3, 3, 20)
], { battles: 4 });
const candidateWithEarlierLevel = progressRow([
  progressSettlement(1, 1, 2),
  progressSettlement(2, 2, 2),
  progressSettlement(3, 2, 2, 0, "death")
], { battles: 3, outcome: "death" });
assert.equal(comparePreDeathProgress(controlLevelAhead, candidateWithEarlierLevel).controlOnlyProgress, true);
const postDeathOnlyControlProgress = progressRow([
  progressSettlement(1, 1, 2, 0),
  progressSettlement(2, 2, 2, 0),
  progressSettlement(3, 2, 2, 0),
  progressSettlement(4, 2, 3, 20)
], { battles: 4 });
assert.equal(comparePreDeathProgress(postDeathOnlyControlProgress, candidateDeath).controlOnlyProgress, false);

const noncombatDeath = progressRow([
  progressSettlement(1, 1, 2),
  progressSettlement(2, 2, 2),
], { battles: 2, outcome: "death" });
const controlBeforeNoncombatDeath = progressRow([
  progressSettlement(1, 1, 2),
  progressSettlement(2, 2, 2, 8),
  progressSettlement(3, 2, 3, 24)
], { battles: 3 });
assert.deepEqual(comparePreDeathProgress(controlBeforeNoncombatDeath, noncombatDeath), {
  deathCombatNumber: null,
  deathBoundary: "noncombat-inclusive",
  lastIncludedCombatNumber: 2,
  controlBeforeDeath: { levels: 1, recoveryHp: 8 },
  candidateBeforeDeath: { levels: 1, recoveryHp: 0 },
  controlOnlyProgress: true
});
const controlProgressedAfterNoncombatDeath = progressRow([
  progressSettlement(1, 1, 2),
  progressSettlement(2, 2, 2),
  progressSettlement(3, 2, 3, 24)
], { battles: 3 });
assert.equal(comparePreDeathProgress(controlProgressedAfterNoncombatDeath, noncombatDeath).controlOnlyProgress, false);
const precombatDeath = progressRow([], { battles: 0, outcome: "death" });
assert.deepEqual(comparePreDeathProgress(controlBeforeNoncombatDeath, precombatDeath), {
  deathCombatNumber: null,
  deathBoundary: "noncombat-inclusive",
  lastIncludedCombatNumber: 0,
  controlBeforeDeath: { levels: 0, recoveryHp: 0 },
  candidateBeforeDeath: { levels: 0, recoveryHp: 0 },
  controlOnlyProgress: false
});

const noOptIn = { ...getScenarioById("legacy-no-portal") };
const explicitNoOp = { ...noOptIn, phase4cV1GeneratedRun: false };
const runDefaultPath = scenario => {
  resetSimulationRandom("phase4c-production-default-noop");
  return simulateRun({
    className: "Mage",
    startFloor: 10,
    targetDepth: 11,
    runIndex: 0,
    seriesId: "phase4c-production-default-noop",
    worldSeed: "phase4c-production-default-noop",
    scoringProfile: null,
    scenario
  });
};
assert.deepEqual(runDefaultPath(noOptIn), runDefaultPath(explicitNoOp));

console.log("[PASS] Phase 4c v1 / Phase 4j-B full-run N=1 deterministic smoke, first-combat equivalence, and validity gates");
