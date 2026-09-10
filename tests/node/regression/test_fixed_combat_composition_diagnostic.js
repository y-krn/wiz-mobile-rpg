/* global process */

import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

const diagnostic = await import("../../../scratch/measurements/fixed_combat_composition_diagnostic.js");
const { derivePlayerActionExecutionTiming } = await import("../../../scratch/simulations/sim_depth_material_ev.js");

assert.equal(diagnostic.STARTING_KIT, "vanguard");
assert.deepEqual(diagnostic.STARTING_KIT_IDS, ["vanguard", "scout", "devotion", "arcana"]);
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
assert.equal(report.contrasts.length, 4);
assert.ok(report.cases.every(testCase => testCase.monsterNames.length === 2));
assert.ok(report.cases.every(testCase => testCase.entryMpRatio === 1));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.clearRate)));
assert.ok(report.cases.every(testCase => Number.isFinite(testCase.deathRate)));
assert.ok(report.cases.every(testCase => Object.hasOwn(testCase, "enemyActionCount")));
assert.ok(report.cases.every(testCase => Object.hasOwn(testCase, "productionTraitFiring")));
assert.ok(report.cases.every(testCase =>
  Object.hasOwn(testCase.productionTraitFiring, "evasive")
));
assert.ok(report.cases.filter(testCase => testCase.compositionId.includes("kobold-scout")).every(testCase =>
  testCase.productionTraitFiring.evasive.attempts >= testCase.productionTraitFiring.evasive.misses
));

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
  testCase.fleeSelectionToSurvivalRate >= 0 &&
  testCase.fleeSelectionToSurvivalRate <= 1 &&
  testCase.fleePreemptedRate >= 0 &&
  testCase.fleePreemptedRate <= 1
));
assert.ok(report.contrasts.every(contrast =>
  Object.hasOwn(contrast, "highRiskFightClearRate") &&
  Object.hasOwn(contrast, "highRiskImmediateFleeSelectionToSurvivalRate") &&
  Object.hasOwn(contrast, "highRiskImmediateFleePreemptedRate") &&
  !Object.hasOwn(contrast, "policy")
));
assert.ok(report.cases.every(testCase =>
  Object.keys(testCase.firstPlayerActionExecutionTiming).every(timing => [
    "player-before-any-enemy",
    "after-enemy-action",
    "not-executed-before-end",
    "unobserved"
  ].includes(timing))
));
assert.ok(report.cases.every(testCase => {
  const timing = testCase.firstPlayerActionExecutionTiming;
  const observedExecutionCount = (timing["player-before-any-enemy"] || 0) +
    (timing["after-enemy-action"] || 0);
  return observedExecutionCount === testCase.firstPlayerActionExecuted &&
    testCase.firstPlayerActionExecuted <= 1;
}));

const scoutReport = await diagnostic.runFixedCombatDiagnostic({
  runs: 1,
  seed: 1151,
  startingKit: "scout",
  allowSmallRunCount: true
});
assert.equal(scoutReport.configuration.startingKit, "scout");
assert.equal(scoutReport.cases.length, report.cases.length);
assert.ok(scoutReport.cases.every(testCase => Number.isFinite(testCase.clearRate)));

const enemyFirstExecuted = [
  { actor: "monster", actionType: "enemy", order: 0, executed: true },
  { actor: "char", actionType: "fight", order: 1, executed: true }
];
const enemyFirstPreempted = [
  { actor: "monster", actionType: "enemy", order: 0, executed: true },
  { actor: "char", actionType: "fight", order: 1, executed: false }
];
assert.equal(
  derivePlayerActionExecutionTiming(enemyFirstExecuted, "fight"),
  "after-enemy-action"
);
assert.equal(
  derivePlayerActionExecutionTiming(enemyFirstPreempted, "fight"),
  "not-executed-before-end"
);
assert.equal(
  derivePlayerActionExecutionTiming([
    { actor: "char", actionType: "fight", order: 0, executed: true },
    { actor: "monster", actionType: "enemy", order: 1, executed: true }
  ], "fight"),
  "player-before-any-enemy"
);

function timingFixture(playerHp, monsterAtk) {
  return {
    party: [{
      name: "Tester",
      level: 1,
      hp: playerHp,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      status: "ok",
      buffs: [],
      spells: [],
      equipment: { weapon: null, shield: null, armor: null, accessory: null }
    }],
    combatState: {
      monsters: [{
        name: "Target",
        hp: 100,
        maxHp: 100,
        atk: monsterAtk,
        def: 0,
        row: "front",
        status: "ok"
      }],
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1
  };
}

const originalRandom = Math.random;
let randomValues = [];
Math.random = () => randomValues.shift() ?? 0;
try {
  randomValues = [0, 0.99];
  const afterEnemy = runCombatRoundCalculation(timingFixture(100, 1), {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  });
  assert.deepEqual(afterEnemy.actionObservations, [
    { actor: "monster", actionType: "enemy", order: 0, executed: true },
    { actor: "char", actionType: "fight", order: 1, executed: true }
  ]);

  randomValues = [0, 0.99];
  const preempted = runCombatRoundCalculation(timingFixture(1, 10), {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  });
  assert.deepEqual(preempted.actionObservations, [
    { actor: "monster", actionType: "enemy", order: 0, executed: true },
    { actor: "char", actionType: "fight", order: 1, executed: false }
  ]);
} finally {
  Math.random = originalRandom;
}

const repeated = await diagnostic.runFixedCombatDiagnostic({
  runs: 1,
  seed: 1151,
  allowSmallRunCount: true
});
assert.deepEqual(repeated, report);

console.log("[PASS] fixed combat composition diagnostic wiring, metrics, and repeatability");
