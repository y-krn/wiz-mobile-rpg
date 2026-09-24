import assert from "node:assert/strict";
import {
  PROGRESSION_ENEMY_GUARD_POLICY_ARMS as arms,
  PROGRESSION_ENEMY_GUARD_POLICY_CANDIDATE as candidate,
  PROGRESSION_ENEMY_DIAGNOSTIC_CONTEXTS as contexts,
  deriveProgressionEnemyRunSeed
} from "../../../scratch/measurements/progression_enemy_guard_policy_contract.js";
import { resolveProgressionEnemyDiagnosticContext } from "../../../scratch/measurements/progression_enemy_candidate_contract.js";
import { runProgressionEnemyGuardPolicyDiagnostic } from "../../../scratch/measurements/progression_enemy_guard_policy_diagnostic.js";

assert.deepEqual(arms.map(arm => arm.id), ["attack-defend", "attack-only"]);
assert.deepEqual(arms.map(arm => arm.measurementCombatPlan), ["attack-defend", "attack-only"]);
assert.equal(candidate.playerPhysicalMultiplier(5), 1.8);
assert.equal(candidate.playerSpellMultiplier(5), 1.8);
assert.equal(candidate.playerLevel1MaxHp(5), 30);
assert.equal(candidate.enemyHpMultiplier(5), 2);
assert.equal(candidate.enemyAttackMultiplier(5), 1.5);
assert.equal(candidate.enemyDefenseMultiplier, 1);

assert.deepEqual(contexts.map(context => [context.floor, context.baseline, context.enemyBand]), [
  [1, 0, 0],
  [5, 0, 1], [5, 1, 1], [6, 1, 1],
  [10, 1, 2], [10, 2, 2], [11, 2, 2],
  [20, 3, 4], [20, 4, 4], [21, 4, 4],
  [30, 5, 5]
]);
for (const [milestoneFloor, preBaseline, selectedBaseline, postFloor] of [[15, 2, 3, 16], [25, 4, 5, 26]]) {
  assert.equal(resolveProgressionEnemyDiagnosticContext({
    kind: "pre-milestone", milestoneFloor, highestEarlierDefeatedMilestone: milestoneFloor - 5
  }).baseline, preBaseline);
  assert.equal(resolveProgressionEnemyDiagnosticContext({
    kind: "selected-deep-start", milestoneFloor, selectedStartFloor: milestoneFloor
  }).baseline, selectedBaseline);
  const post = resolveProgressionEnemyDiagnosticContext({
    kind: "post-milestone", milestoneFloor, selectedStartFloor: 1
  });
  assert.equal(post.floor, postFloor);
  assert.equal(post.baseline, selectedBaseline);
  assert.equal(contexts.some(context => context.floor === milestoneFloor), false, "B15/B25 are timing regressions only");
}

const seedContext = contexts[7];
const pairedSeed = deriveProgressionEnemyRunSeed({
  rootSeed: 1698, context: seedContext, fixtureId: "defensive-guard", runIndex: 0
});
assert.equal(pairedSeed, deriveProgressionEnemyRunSeed({
  rootSeed: 1698, context: seedContext, fixtureId: "defensive-guard", runIndex: 0
}));
assert.notEqual(pairedSeed, deriveProgressionEnemyRunSeed({
  rootSeed: 1698, context: seedContext, fixtureId: "defensive-guard", runIndex: 1
}));

const report = await runProgressionEnemyGuardPolicyDiagnostic({ runs: 1, seed: 1698 });
const repeatedReport = await runProgressionEnemyGuardPolicyDiagnostic({ runs: 1, seed: 1698 });
assert.deepEqual(repeatedReport, report, "N=1 smoke is deterministic across repeated runs");
assert.equal(report.status, "diagnostic-only");
assert.equal(report.observations.length, 44);
assert.equal(report.summary.length, 44);
assert.equal(report.configuration.pairedArmsShareSeed, true);
assert.equal(report.configuration.phase4cV1.hpBuffer, 0);
assert.equal(report.configuration.phase4cV1.rawDefenseBonus, 0);
assert.deepEqual(report.configuration.arms.map(arm => arm.id), ["attack-defend", "attack-only"]);
assert.equal(report.configuration.guardedEnemyActionDefinition, "executed enemy action during an executed defend round");

for (const context of contexts) for (const level of [1, 2]) {
  const paired = report.observations.filter(row => row.contextId === `${context.kind}-B${context.floor}` && row.level === level);
  assert.equal(paired.length, 2);
  assert.equal(paired[0].seed, paired[1].seed, "both arms share a paired seed");
  for (const row of paired) {
    assert.equal(row.rawDefense > 0, true);
    assert.equal(row.maxHp, candidate.playerLevel1MaxHp(context.baseline) + (level === 2 ? 5 : 0));
    assert.equal(row.selectedActions.attack + row.selectedActions.defend + row.selectedActions.other, row.rounds);
    assert.equal(row.executedActions.attack + row.executedActions.defend + row.executedActions.other <= row.rounds, true);
    assert.equal(row.guardOpportunities >= row.guardedEnemyActions, true);
    assert.equal(row.damagePerEnemyAction, row.enemyActions > 0 ? row.damageTaken / row.enemyActions : 0);
    assert.equal(row.damagePerRound, row.rounds > 0 ? row.damageTaken / row.rounds : 0);
  }
  const attackDefend = paired.find(row => row.arm === "attack-defend");
  const attackOnly = paired.find(row => row.arm === "attack-only");
  assert.equal(attackOnly.selectedActions.defend, 0);
  assert.equal(attackOnly.executedActions.defend, 0);
  assert.equal(attackOnly.selectedActions.other, 0, "every live attack-only decision explicitly selects Fight");
  assert.equal(attackOnly.selectedActions.attack + attackOnly.selectedActions.other, attackOnly.rounds);
  assert.equal(attackDefend.selectedActions.attack + attackDefend.selectedActions.defend + attackDefend.selectedActions.other, attackDefend.rounds);
  assert.equal(attackDefend.selectedActions.attack >= attackDefend.selectedActions.defend, true);
  assert.equal(Math.abs(attackDefend.selectedActions.attack - attackDefend.selectedActions.defend) <= 1, true);
  assert.equal(attackDefend.executedActions.attack <= attackDefend.selectedActions.attack, true);
  assert.equal(attackDefend.executedActions.defend <= attackDefend.selectedActions.defend, true);
}

console.log("progression enemy Guard policy diagnostic unit tests passed");
