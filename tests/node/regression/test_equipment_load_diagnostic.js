import assert from "node:assert/strict";

const { runEquipmentLoadDiagnostic, LOADOUTS, COMPOSITIONS, MODEL_IDS, ACTION_POLICIES } =
  await import("../../../scratch/measurements/equipment_load_initiative_diagnostic.js");

const report = runEquipmentLoadDiagnostic({ runs: 1, seed: 1161, allowSmallRunCount: true });
assert.deepEqual(report.configuration.models, [...MODEL_IDS]);
assert.deepEqual(report.configuration.actionPolicies, [...ACTION_POLICIES]);
assert.equal(report.configuration.loadouts.length, LOADOUTS.length);
assert.equal(report.configuration.compositions.length, COMPOSITIONS.length);
assert.equal(report.cases.length, MODEL_IDS.length * LOADOUTS.length * 3 * COMPOSITIONS.length * ACTION_POLICIES.length);
assert.ok(report.cases.every(testCase => testCase.runs === 1));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.clearRate)));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.deathRate)));
assert.ok(report.cases.every(testCase => ["player-before-any-enemy", "after-enemy-action", "not-executed-before-end"].includes(
  Object.keys(testCase.firstActionTiming)[0]
)));
assert.ok(report.cases.every(testCase => testCase.enemyCount >= 1 && testCase.enemyCount <= 3));
assert.ok(report.cases.every(testCase => testCase.fleeSelected === (testCase.policy === "flee" ? 1 : 0)));
assert.ok(report.configuration.loadouts.every(loadout =>
  Number.isFinite(loadout.defense) && Object.hasOwn(loadout, "guardProfile")
));
assert.equal(report.configuration.bagWeight, "not modeled; inventory is empty and load modifier comes only from equipped loadout");
assert.equal(report.configuration.startingKitOrClassIdentity, "not used; universal character baseline is stripped of startingKit after construction");

const repeated = runEquipmentLoadDiagnostic({ runs: 1, seed: 1161, allowSmallRunCount: true });
assert.deepEqual(repeated, report);

console.log("[PASS] equipment-load diagnostic wiring, production fixtures, and repeatability");
