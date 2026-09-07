/* global process */

import assert from "node:assert/strict";

const diagnostic = await import("../../../scratch/measurements/fixed_combat_composition_diagnostic.js");

assert.equal(diagnostic.STARTING_KIT, "vanguard");
assert.deepEqual(diagnostic.POLICIES, ["fight", "immediate-flee"]);
assert.deepEqual(diagnostic.HP_BANDS.map(band => band.id), ["100", "75", "50", "25"]);
assert.equal(diagnostic.COMPOSITIONS.length, 6);
assert.equal(new Set(diagnostic.COMPOSITIONS.flatMap(composition => composition.names)).size, 8);

const report = await diagnostic.runFixedCombatDiagnostic({
  runs: 1,
  seed: 1151,
  allowSmallRunCount: true
});

assert.equal(report.configuration.startingKit, "vanguard");
assert.equal(report.configuration.initialMpRatio, 1);
assert.equal(report.configuration.runs, 1);
assert.equal(report.cases.length, 48);
assert.equal(report.contrasts.length, 8);
assert.ok(report.cases.every(testCase => testCase.monsterNames.length === 2));
assert.ok(report.cases.every(testCase => testCase.entryMpRatio === 1));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.clearRate)));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.deathRate)));
assert.ok(report.cases.every(testCase => Object.hasOwn(testCase, "enemyActionCount")));
assert.ok(report.cases.every(testCase => Object.hasOwn(testCase, "productionTraitFiring")));

const fleeCases = report.cases.filter(testCase => testCase.policy === "immediate-flee");
assert.equal(fleeCases.length, 24);
assert.ok(fleeCases.every(testCase => testCase.fleeSelected === 1));
assert.ok(fleeCases.every(testCase =>
  testCase.fleeExecuted + testCase.fleeSelectedButNotExecuted === testCase.fleeSelected
));
assert.ok(fleeCases.every(testCase =>
  testCase.fleeSurvived + testCase.fleeDiedFromPartingAttack === testCase.fleeExecuted
));
assert.ok(fleeCases.every(testCase =>
  testCase.firstPlayerActionExecutionTiming["player-before-enemy"] >= 0 ||
  testCase.firstPlayerActionExecutionTiming["enemy-before-player"] >= 0
));

const repeated = await diagnostic.runFixedCombatDiagnostic({
  runs: 1,
  seed: 1151,
  allowSmallRunCount: true
});
assert.deepEqual(repeated, report);

console.log("[PASS] fixed combat composition diagnostic wiring, metrics, and repeatability");
