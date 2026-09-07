/* global process */

import assert from "node:assert/strict";

const {
  STARTING_KIT_IDS,
  POLICY_IDS,
  createDiagnosticScenario,
  runDiagnostic
} = await import("../../measurements/issue1139_starting_kit_diagnostic.js");

assert.deepEqual(STARTING_KIT_IDS, ["vanguard", "scout", "devotion", "arcana"]);
assert.deepEqual(POLICY_IDS, ["fight", "flee-threshold"]);

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
  "maxMpBeforeEncounter", "mpRateBeforeEncounter", "outcome"
]) {
  assert.ok(Object.hasOwn(entry, field), `encounter row missing ${field}`);
}
for (const field of [
  "hpBeforeEncounter", "maxHpBeforeEncounter", "hpRateBeforeEncounter",
  "mpBeforeEncounter", "maxMpBeforeEncounter", "mpRateBeforeEncounter"
]) {
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
assert.equal(typeof report.runOutcome.b1DeathRate, "number");
assert.equal(typeof report.encounterExposure.enemyEncounterCount, "number");
assert.equal(typeof report.combatCost.splitOnDeath.triggers, "number");
assert.equal(typeof report.combatCost.guardAdjacent.guardedCount, "number");
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

const repeat = await runDiagnostic({
  startingKit: "vanguard",
  policy: "fight",
  fleeHpThreshold: 0.2,
  runs: 2,
  seed: 1139,
  allowSmallRunCount: true
});
assert.deepEqual(repeat, report);

console.log("[PASS] starting-kit diagnostic wiring and smoke");
