import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

const { runEquipmentLoadDiagnostic, CONTROL_LOADOUTS, ALL_LOADOUTS, COMPOSITIONS, MODEL_IDS, ACTION_POLICIES, buildCaseSeed } =
  await import("../../../scratch/measurements/equipment_load_initiative_diagnostic.js");

const report = runEquipmentLoadDiagnostic({ runs: 1, seed: 1161, allowSmallRunCount: true });
assert.deepEqual(report.configuration.models, [...MODEL_IDS]);
assert.deepEqual(report.configuration.actionPolicies, [...ACTION_POLICIES]);
assert.equal(report.configuration.loadouts.length, ALL_LOADOUTS.length);
assert.equal(report.configuration.loadouts.filter(loadout => loadout.controlledDefense).length, CONTROL_LOADOUTS.length);
assert.equal(report.configuration.compositions.length, COMPOSITIONS.length);
assert.equal(report.cases.length, MODEL_IDS.length * ALL_LOADOUTS.length * 3 * COMPOSITIONS.length * ACTION_POLICIES.length);
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
assert.equal(report.configuration.seedPolicy, "matched deterministic stream per composition/runIndex; shared across model/loadout/firstStrike/policy");
assert.equal(buildCaseSeed(1161, "high-kobold-scout-rusted-shield", 0), "issue-1161:1161:high-kobold-scout-rusted-shield:0");
assert.notEqual(buildCaseSeed(1161, "high-kobold-scout-rusted-shield", 0), buildCaseSeed(1161, "high-kobold-scout-rusted-shield", 1));

function timingFixture(playerHp, monsterAtk, monsterHp = 100) {
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
        hp: monsterHp,
        maxHp: Math.max(100, monsterHp),
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

const invalidFight = runCombatRoundCalculation(timingFixture(100, 0, 0), {
  actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
});
assert.deepEqual(invalidFight.actionObservations, [{
  actor: "char", actionType: "fight", order: 0, executed: false
}]);
assert.equal(invalidFight.actionObservations[0].hpBeforeExecution, null);

const validDefend = runCombatRoundCalculation(timingFixture(100, 0), {
  actions: [{ type: "defend", actorIdx: 0 }]
});
assert.equal(validDefend.actionObservations.find(item => item.actor === "char").executed, true);
assert.equal(validDefend.actionObservations.find(item => item.actor === "char").hpBeforeExecution, 99);

const repeated = runEquipmentLoadDiagnostic({ runs: 1, seed: 1161, allowSmallRunCount: true });
assert.deepEqual(repeated, report);

console.log("[PASS] equipment-load diagnostic wiring, production fixtures, and repeatability");
