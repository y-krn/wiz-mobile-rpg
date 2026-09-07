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
const totalCauseCounts = Object.values(report.deathContribution.causeDistribution)
  .reduce((sum, cause) => sum + cause.count, 0);
assert.equal(totalCauseCounts, report.runOutcome.outcomes.death || 0);
const firstComposition = Object.values(report.encounterExposure.byComposition)[0];
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
