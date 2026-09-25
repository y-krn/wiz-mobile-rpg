import assert from "node:assert/strict";

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { runSpecialExpSettlementFixtures } = await import(
  "../../../scratch/measurements/progression_exp_award_special_settlement.js"
);
const { classifyAwardKind } = await import(
  "../../../scratch/measurements/progression_exp_award_paired_inventory.js"
);
const report = runSpecialExpSettlementFixtures();

assert.equal(report.evidence, "controlled-production-context-N=1");
assert.ok(report.bandFloors.includes(1), "controlled fixtures cover B1");
assert.ok(report.bandFloors.includes(20), "controlled fixtures cover B20");
assert.deepEqual(report.fixtures.map(fixture => fixture.kind), ["rare", "elite", "midboss", "boss"]);
assert.equal(classifyAwardKind({ boss: true, elite: true, midboss: true, rare: true }), "boss");
assert.equal(classifyAwardKind({ elite: true, midboss: true, rare: true }), "elite");
assert.equal(classifyAwardKind({ midboss: true, rare: true }), "midboss");
assert.equal(classifyAwardKind({ rare: true }), "rare");
assert.equal(classifyAwardKind(), "ordinary");
assert.deepEqual(report.coverageGaps, [], "only actual victory settlements count as valid E5 evidence");
assert.deepEqual(report.uncoveredLifecyclePaths, [
  "actual-flee-reward-ownership",
  "split-descendant-reward-ownership",
  "summon-descendant-reward-ownership",
  "monster-count-change-reward-ownership",
  "non-victory-reward-ownership"
]);

for (const fixture of report.fixtures) {
  assert.equal(fixture.controlled, true);
  assert.equal(fixture.nonExpFieldsUnchanged, true,
    `${fixture.kind} candidate mutates only the generated enemy instance EXP`);
  assert.equal(fixture.identity.name.length > 0, true);
  assert.equal(fixture.identity.templateName.length > 0, true);
  assert.equal(classifyAwardKind({
    boss: fixture.context.isBoss,
    elite: fixture.context.isRoamingFlack,
    midboss: fixture.context.isMidboss,
    rare: fixture.context.isRare
  }), fixture.kind, `${fixture.kind} classification follows the generated encounter context`);
  assert.equal(fixture.candidateTotal > 0, true);
  assert.equal(fixture.candidate.victory, true, `${fixture.kind} candidate arm reaches victory settlement`);
  assert.equal(fixture.production.victory, true, `${fixture.kind} control arm reaches victory settlement`);
  assert.equal(fixture.candidate.rounds > 0, true);
  assert.equal(fixture.production.rounds > 0, true);
  assert.equal(fixture.candidate.combatLedgerDelta, fixture.candidateTotal);
  assert.equal(fixture.candidate.characterExpDelta, fixture.candidateTotal);
  assert.equal(fixture.production.combatLedgerDelta, fixture.productionExp);
  assert.equal(fixture.production.characterExpDelta, fixture.productionExp);
  assert.equal(fixture.candidate[fixture.counter], 1,
    `${fixture.kind} candidate retains existing production counter classification`);
  assert.equal(fixture.production[fixture.counter], 1,
    `${fixture.kind} control retains existing production counter classification`);
  assert.equal(fixture.candidate.enemyFled, false);
  assert.equal(fixture.production.enemyFled, false);
  for (const arm of [fixture.candidate, fixture.production]) {
    assert.equal(arm.maxHpAfter - arm.maxHpBefore, (arm.levelAfter - arm.levelBefore) * 5,
      `${fixture.kind} Level settlement preserves production maxHP growth`);
  }
}

const rare = report.fixtures.find(fixture => fixture.kind === "rare");
assert.ok(rare.rareFleeChance > 0, "Rare remains included despite production fleeChance");
assert.equal(rare.candidate.enemyFled, false, "Rare valid evidence requires an actual victory without flee");
assert.equal(report.fixtures.find(fixture => fixture.kind === "elite").identity.templateFlags.isRare, true,
  "Roaming Elite template rare flag does not override elite encounter context");
assert.equal(report.fixtures.find(fixture => fixture.kind === "midboss").identity.templateFlags.isBoss, true,
  "Midboss template Boss flag does not override midboss encounter context");
assert.equal(report.fixtures.find(fixture => fixture.kind === "boss").context.isBoss, true,
  "Boss classification follows Boss encounter context even without a template Boss flag");

console.log("[PASS] Phase 4j-E5 controlled rare/elite/midboss/boss candidate and production settlement");
