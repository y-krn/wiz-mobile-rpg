import assert from "node:assert/strict";

const {
  candidateSettlementBudget, createCandidateExpLifecycle, reconcileCandidateExpLifecycle
} = await import("../../../scratch/measurements/progression_exp_award_lifecycle.js");
const { runLifecycleSettlementFixtures } = await import(
  "../../../scratch/measurements/progression_exp_award_lifecycle_settlement.js"
);

const report = runLifecycleSettlementFixtures();
assert.equal(report.evidence, "controlled-production-context-N=1");
assert.equal(report.naturalRunEvidence, false);
assert.deepEqual(report.bandFloors, [1, 20], "fixture set covers B1 and B20");
assert.deepEqual(report.multiBudgetAccounting, { budgets: [8, 28], settled: 8 },
  "an actual fled initial index forfeits only its own allocation");
assert.deepEqual(report.coverageGaps, [
  "natural-encounter-distribution", "full-run-candidate-integration", "non-victory-settlement"
]);

const [flee, split, summon] = report.fixtures;
assert.deepEqual(report.fixtures.map(fixture => fixture.kind), ["flee", "split", "summon"]);
for (const fixture of report.fixtures) {
  assert.equal(fixture.controlled, true);
  assert.ok(fixture.candidate.rounds > 0 && fixture.production.rounds > 0);
  for (const arm of [fixture.candidate, fixture.production]) {
    assert.equal(arm.settled, true, `${fixture.kind}/${arm.candidate ? "candidate" : "control"} reaches settlement`);
    assert.equal(arm.initialCount, fixture.productionIdentity.length);
    assert.equal(arm.initialNonExpFieldsUnchanged, true);
    assert.equal(arm.characterExpDelta, arm.combatLedgerDelta);
  }
  assert.equal(fixture.candidate.reconcileMutatesOnlyExp, true,
    `${fixture.kind} reconciliation changes no non-EXP enemy fields`);
}

assert.equal(flee.generatedRare, true);
assert.equal(flee.productionIdentity[0].isRare, true);
assert.ok(flee.productionIdentity[0].fleeChance > 0, "flee fixture uses a production-generated fleeing Rare");
for (const arm of [flee.candidate, flee.production]) {
  assert.equal(arm.fledLog, true, "flee is observed through an actual production monster turn");
  assert.equal(arm.allFled, true);
  assert.equal(arm.combatLedgerDelta, 0);
  assert.equal(arm.characterExpDelta, 0);
  assert.equal(arm.levelAfter, arm.levelBefore);
}
assert.equal(flee.candidate.settlementBudget, 0, "actual flee forfeits its full initial Rare budget");

for (const arm of [split.candidate, split.production]) {
  assert.equal(arm.splitGenerated, true, "production processMonsterDefeat appends split descendants");
  assert.equal(arm.dynamicDescendantCount, 2);
  assert.equal(arm.allDefeated, true);
  assert.equal(arm.victory, true);
}
assert.ok(split.candidate.initialCandidateBudgets.reduce((sum, value) => sum + value, 0) > 0);
assert.deepEqual(split.candidate.descendantExp, [0, 0]);
assert.equal(split.candidate.settlementBudget,
  split.candidate.initialCandidateBudgets.reduce((sum, value) => sum + value, 0));
assert.equal(split.candidate.combatLedgerDelta, split.candidate.settlementBudget);
assert.equal(split.production.descendantExp.every(exp => exp > 0), true,
  "production control retains split child EXP");
assert.equal(split.production.combatLedgerDelta,
  split.production.initialExp.reduce((sum, value) => sum + value, 0) +
  split.production.descendantExp.reduce((sum, value) => sum + value, 0));

for (const arm of [summon.candidate, summon.production]) {
  assert.equal(arm.summonGenerated, true, "production summon action appends descendants");
  assert.ok(arm.dynamicDescendantCount > 0);
  assert.equal(arm.allDefeated, true);
  assert.equal(arm.victory, true);
}
assert.deepEqual(summon.candidate.descendantExp, Array(summon.candidate.dynamicDescendantCount).fill(0));
assert.equal(summon.candidate.settlementBudget,
  summon.candidate.initialCandidateBudgets.reduce((sum, value) => sum + value, 0));
assert.equal(summon.candidate.combatLedgerDelta, summon.candidate.settlementBudget);
assert.equal(summon.production.descendantExp.every(exp => exp > 0), true,
  "production control retains summoned template EXP");
assert.equal(summon.production.combatLedgerDelta,
  summon.production.initialExp.reduce((sum, value) => sum + value, 0) +
  summon.production.descendantExp.reduce((sum, value) => sum + value, 0));

for (const fixture of [split, summon]) {
  assert.equal(fixture.candidate.levelAfter, 1, "candidate budget remains below the production Level threshold");
  assert.equal(fixture.candidate.maxHpAfter, fixture.candidate.maxHpBefore);
  assert.equal(fixture.production.maxHpAfter - fixture.production.maxHpBefore,
    (fixture.production.levelAfter - fixture.production.levelBefore) * 5);
}

const roster = [{ name: "initial-A" }, { name: "initial-B" }];
const lifecycle = createCandidateExpLifecycle(roster, [8, 28]);
assert.equal(candidateSettlementBudget([{ ...roster[0] }, { ...roster[1], fled: true }], lifecycle), 8);
assert.throws(() => reconcileCandidateExpLifecycle([{ ...roster[1] }, { ...roster[0] }], lifecycle),
  /identity\/order drift/);
assert.throws(() => reconcileCandidateExpLifecycle([{ ...roster[0], name: "drift" }, { ...roster[1] }], lifecycle),
  /identity\/order drift/);
assert.throws(() => createCandidateExpLifecycle([{ name: "same" }, { name: "same" }], [1, 1]),
  /distinguishable initial monster identities/);

console.log("[PASS] Phase 4j-E6 actual flee/split/summon ownership and fail-closed initial roster accounting");
