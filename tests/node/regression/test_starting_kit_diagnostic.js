/* global process */

import assert from "node:assert/strict";

const {
  STARTING_KIT_IDS,
  POLICY_IDS,
  RECOVERY_POLICY_IDS,
  RECOVERY_RESOURCE_IDS,
  createDiagnosticScenario,
  getDiagnosticWorldSeed,
  runMatchedRecoveryPolicies,
  runDiagnostic
} = await import("../../../scratch/measurements/starting_kit_diagnostic.js");

assert.deepEqual(STARTING_KIT_IDS, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(POLICY_IDS, ["fight", "flee-threshold", "visible-multi-enemy-flee"]);
assert.deepEqual(RECOVERY_POLICY_IDS, ["production", "early-use"]);
assert.deepEqual(RECOVERY_RESOURCE_IDS, [
  "HEAL_POTION", "GREATER_HEAL", "HOLY_WATER", "MANA_POTION", "ETHER"
]);
assert.equal(getDiagnosticWorldSeed(1139, 2), "issue-1176:1139:2");

const fight = createDiagnosticScenario({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2
});
assert.equal(fight.startingKit, "vanguard");
assert.equal(fight.fleePolicy, "never");
assert.equal(fight.fleeHpThreshold, null);
assert.equal(fight.startingHealPotions, 0);
assert.deepEqual(fight.departureCraft, []);

const threshold = createDiagnosticScenario({
  startingKit: "scout",
  policy: "flee-threshold",
  fleeHpThreshold: 0.25
});
assert.equal(threshold.fleePolicy, "threshold");
assert.equal(threshold.fleeHpThreshold, 0.25);

const visibleMulti = createDiagnosticScenario({
  startingKit: "vanguard",
  policy: "visible-multi-enemy-flee",
  fleeHpThreshold: 0.25
});
assert.equal(visibleMulti.fleePolicy, "visible-multi-enemy-flee");
assert.equal(visibleMulti.fleeHpThreshold, null);

const flee = await runDiagnostic({
  startingKit: "vanguard",
  policy: "flee-threshold",
  fleeHpThreshold: 1,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
const fleeOutcome = flee.runOutcome;
assert.ok(fleeOutcome.fleeSelected > 0);
assert.equal(
  fleeOutcome.fleeSelected,
  fleeOutcome.fleeExecuted + fleeOutcome.fleeSelectedButNotExecuted
);
assert.equal(fleeOutcome.fleeExecuted, fleeOutcome.fleePartingAttackCount);
assert.equal(
  fleeOutcome.fleeExecuted,
  fleeOutcome.fleeSurvived + fleeOutcome.fleeDiedFromPartingAttack
);
assert.ok(flee.encounterExposure.encounterRows.length > 0);
const entry = flee.encounterExposure.encounterRows[0];
for (const field of [
  "runIndex", "encounterOrdinal", "initialCompositionKey", "hpBeforeEncounter",
  "maxHpBeforeEncounter", "hpRateBeforeEncounter", "mpBeforeEncounter",
  "maxMpBeforeEncounter", "mpRateBeforeEncounter", "hpAfterEncounter",
  "mpAfterEncounter", "combatRounds", "enemyActionCount", "normalDamage", "outcome",
  "startStep", "endStep", "startRecoveryInventory", "endRecoveryInventory"
]) {
  assert.ok(Object.hasOwn(entry, field), `encounter row missing ${field}`);
}
assert.equal(typeof entry.initialVisibleEnemyCount, "number");
assert.ok(entry.initialVisibleEnemyCount >= 1);
for (const field of [
  "hpBeforeEncounter", "maxHpBeforeEncounter", "hpRateBeforeEncounter",
  "mpBeforeEncounter", "maxMpBeforeEncounter", "mpRateBeforeEncounter"
]) {
  assert.equal(typeof entry[field], "number", `encounter row ${field} is numeric`);
  assert.ok(Number.isFinite(entry[field]), `encounter row ${field} is finite`);
}
for (const field of ["hpAfterEncounter", "mpAfterEncounter", "combatRounds", "enemyActionCount", "normalDamage"]) {
  assert.equal(typeof entry[field], "number", `encounter row ${field} is numeric`);
  assert.ok(Number.isFinite(entry[field]), `encounter row ${field} is finite`);
}

assert.throws(
  () => createDiagnosticScenario({ startingKit: "Fighter", policy: "fight", fleeHpThreshold: 0.2 }),
  /startingKit must be/
);
assert.throws(
  () => createDiagnosticScenario({ startingKit: "vanguard", policy: "fight", fleeHpThreshold: 2 }),
  /fleeHpThreshold must be/
);

const report = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});

assert.equal(report.runs, 2);
assert.equal(report.configuration.startingKit, "vanguard");
assert.equal(report.configuration.consumablesAtDeparture, "none");
assert.equal(report.configuration.enemyPool, "production");
assert.equal(report.configuration.combatActionPolicy, "production-auto");
assert.equal(report.configuration.targetPolicy, "production-auto");
assert.equal(report.configuration.seed, 1139);
assert.equal(report.configuration.worldSeedTemplate, "issue-1176:{seed}:{runIndex}");
assert.equal(typeof report.runOutcome.b1DeathRate, "number");
assert.equal(typeof report.earlyProgression.survival[1].survivedRate, "number");
assert.equal(typeof report.earlyProgression.survival[2].conditionalSurvivalRate, "number");
assert.ok(report.earlyProgression.deathEncounterOrdinal);
for (const type of ["meaningfulReward", "objectLoot", "buildChangeOpportunity", "buildChange"]) {
  assert.equal(typeof report.rewardOpportunity.byType[type].opportunityRate, "number");
  assert.ok(
    report.rewardOpportunity.byType[type].deathBeforeOpportunityRate === null
      || typeof report.rewardOpportunity.byType[type].deathBeforeOpportunityRate === "number"
  );
}
assert.equal(typeof report.encounterExposure.enemyEncounterCount, "number");
assert.ok(report.encounterExposure.byInitialVisibleEnemyCount);
assert.equal(typeof report.combatCost.splitOnDeath.triggers, "number");
assert.equal(typeof report.combatCost.guardAdjacent.guardedCount, "number");
assert.equal(typeof report.combatCost.nonCombat.trapDamageHp, "number");
assert.equal(typeof report.combatCost.nonCombat.poisonApplications, "number");
assert.ok(report.encounterExposure.byComposition);
assert.ok(report.deathContribution.byComposition);
const firstComposition = Object.values(report.encounterExposure.byComposition)[0];
assert.ok(firstComposition.entryHpRate);
assert.ok(firstComposition.entryMpRate);
assert.ok(firstComposition.encounterOrdinal);
const totalCauseCounts = Object.values(report.deathContribution.causeDistribution)
  .reduce((sum, cause) => sum + cause.count, 0);
assert.equal(totalCauseCounts, report.runOutcome.outcomes.death || 0);
assert.ok(firstComposition);
assert.equal(typeof firstComposition.conditionalDeathRate, "number");
assert.equal(typeof firstComposition.encounterLethalityRate, "number");
assert.equal(typeof report.runOutcome.averageCombatRounds, "number");
assert.equal(typeof report.runOutcome.trapDamageHp, "number");
assert.equal(typeof report.runOutcome.poisonApplications, "number");
assert.ok(report.rewardOpportunity.rewardEventCount >= 0);
assert.equal(report.rewardOpportunity.rows.length, report.runs);
assert.ok(report.continuationResource["2"]);
for (const itemId of RECOVERY_RESOURCE_IDS) {
  assert.ok(report.continuationResource["2"].byItem[itemId]);
}
assert.ok(report.linkedTrajectory.byTransition);
assert.ok(report.naturalEntryHpBands);
assert.ok(report.naturalEntryHpBandResource);

const matchedVanguard = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  runs: 2,
  seed: 1176,
  allowSmallRunCount: true
});
const matchedScout = await runDiagnostic({
  startingKit: "scout",
  policy: "fight",
  runs: 2,
  seed: 1176,
  allowSmallRunCount: true
});
assert.equal(
  matchedVanguard.encounterExposure.encounterRows[0].initialCompositionKey,
  matchedScout.encounterExposure.encounterRows[0].initialCompositionKey,
  "matched kits must start from the same first production encounter"
);

const repeat = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
assert.deepEqual(repeat, report);

const matchedRecovery = await runMatchedRecoveryPolicies({
  startingKit: "vanguard",
  policy: "fight",
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
assert.equal(matchedRecovery.production.configuration.recoveryPolicy, "production");
assert.equal(matchedRecovery.earlyUse.configuration.recoveryPolicy, "early-use");
assert.equal(
  matchedRecovery.production.encounterExposure.encounterRows[0].initialCompositionKey,
  matchedRecovery.earlyUse.encounterExposure.encounterRows[0].initialCompositionKey,
  "recovery policy comparison must use the matched production encounter"
);

const visibleReport = await runDiagnostic({
  startingKit: "vanguard",
  policy: "visible-multi-enemy-flee",
  runs: 20,
  seed: 1139,
  allowSmallRunCount: true
});
const visibleRows = visibleReport.encounterExposure.encounterRows;
assert.ok(
  visibleRows.some(row => row.initialVisibleEnemyCount >= 2 && row.fleeSelected > 0),
  "visible-multi-enemy-flee smoke needs a multi-enemy encounter with a player action"
);
for (const row of visibleReport.encounterExposure.encounterRows) {
  if (row.initialVisibleEnemyCount < 2) {
    assert.equal(row.fleeSelected, 0, "single-enemy encounter delegates to production-auto");
  }
  if (row.fleeSelected > 0) {
    assert.ok(row.initialVisibleEnemyCount >= 2, "only multi-enemy encounters select run");
    assert.equal(row.fleeSelected, 1, "multi-enemy diagnostic selects run once");
  }
}

console.log("[PASS] starting-kit diagnostic wiring and smoke");
