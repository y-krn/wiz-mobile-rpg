import assert from "node:assert/strict";

const diagnostic = await import(
  "../../../scratch/measurements/first_kill_window_diagnostic.js"
);

assert.equal(diagnostic.RUNNER_VERSION, "issue1210-first-kill-window-v1");

const report = await diagnostic.runFirstKillWindowDiagnostic({
  runs: 20,
  fixedRuns: 1,
  seed: 1205,
  fixedSeed: 1151,
  allowSmallRunCount: true
});

const ordinalOne = report.natural.byEncounterOrdinal["1"];
assert.ok(ordinalOne.single.encounters > 0);
assert.ok(ordinalOne.pair.encounters > 0);
assert.ok(ordinalOne.pair.firstKillWindow.observedFirstKills > 0);
assert.ok(ordinalOne.pair.firstKillWindow.killTransitions["2->1"] > 0);
assert.ok(Object.hasOwn(ordinalOne.pair.firstKillWindow, "extraActionSources"));
assert.ok(Object.hasOwn(ordinalOne.pair.firstKillWindow, "extraActionOwners"));
assert.ok(ordinalOne.pair.firstKillWindow.enemyActionsBeforeFirstKill.p50 >= 0);
assert.ok(ordinalOne.pair.firstKillWindow.enemyActionsAfterFirstKill.p50 >= 0);
assert.ok(ordinalOne.pair.firstKillWindow.playerActionsBeforeFirstKill.p50 >= 0);
assert.ok(ordinalOne.pair.firstKillWindow.playerActionsAfterFirstKill.p50 >= 0);
assert.equal(report.fixedHpConnection["100"].length, 6);
assert.equal(report.fixedHpConnection["50"].length, 6);
assert.ok(report.fixedHpConnection["100"].every(testCase =>
  Object.hasOwn(testCase.firstKillWindow, "noFirstKill")
));
assert.ok(report.fixedHpConnection["50"].every(testCase =>
  Object.hasOwn(testCase.firstKillWindow, "deathTruncation") === false
));
assert.match(report.diagnosis.primary, /^[A-E]-/);
assert.ok(report.diagnosis.nextProductionAxis);

const repeated = await diagnostic.runFirstKillWindowDiagnostic({
  runs: 20,
  fixedRuns: 1,
  seed: 1205,
  fixedSeed: 1151,
  allowSmallRunCount: true
});
assert.deepEqual(repeated, report);

console.log("[PASS] first-kill / kill-window decomposition wiring and repeatability");
