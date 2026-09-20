import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

const { runEquipmentLoadMeasurement } = await import(
  "../../../scratch/measurements/equipment_load_measurement.js"
);

const report = await runEquipmentLoadMeasurement({ runs: 1, seed: 1170, allowSmallRunCount: true });
assert.equal(report.schemaVersion, 2);
assert.equal(report.configuration.runs, 1);
assert.deepEqual(report.configuration.enemyCounts, [1, 2, 3]);
assert.ok(report.initiativeMatrix.length > 0);
assert.ok(report.initiativeMatrix.every(row => row.runs === 1));
assert.ok(Object.keys(report.fixedCombat).length > 0);
assert.ok(report.productionB1F);
assert.ok(report.controlledB1F);
assert.ok(report.productionB1FFlee);

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
assert.equal(invalidFight.actionObservations.find(item => item.actor === "char").executed, false);
assert.equal(invalidFight.actionObservations.find(item => item.actor === "char").hpBeforeExecution, null);

const validDefend = runCombatRoundCalculation(timingFixture(100, 0, 0), {
  actions: [{ type: "defend", actorIdx: 0 }]
});
const playerObservation = validDefend.actionObservations.find(item => item.actor === "char");
assert.equal(playerObservation.executed, true);
assert.equal(playerObservation.hpBeforeExecution, 100);

const repeated = await runEquipmentLoadMeasurement({ runs: 1, seed: 1170, allowSmallRunCount: true });
assert.deepEqual(repeated, report);

console.log("[PASS] current equipment-load N=1 smoke and combat action observations");
