import assert from "node:assert/strict";
import {
  createMonsterCodexRecord,
  recordMonsterAction,
  recordMonsterCondition,
  recordMonsterEncounter,
  recordMonsterLoot
} from "../../../src/state/codex_state.js";
import { createSoloCharacter } from "../../../src/state/initial_state.js";
import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";

const monster = { name: "ワーウルフ A" };
const stateLike = {
  floor: 7,
  codex: { monsters: {} }
};

recordMonsterEncounter(monster, stateLike);
stateLike.floor = 9;
recordMonsterEncounter(monster, stateLike);
recordMonsterAction(monster, "通常攻撃", stateLike);
recordMonsterAction(monster, "通常攻撃", stateLike);
recordMonsterCondition(monster, "麻痺を受けた", stateLike);
recordMonsterLoot(monster, "獣の牙", stateLike);

const record = stateLike.codex.monsters["ワーウルフ"];
assert.equal(record.encountered, 2);
assert.deepEqual(record.encounterFloors, { "7": 1, "9": 1 });
assert.equal(record.firstEncounterFloor, 7);
assert.equal(record.lastEncounterFloor, 9);
assert.deepEqual(record.observedActions, ["通常攻撃"]);
assert.deepEqual(record.observedConditions, ["麻痺を受けた"]);
assert.deepEqual(record.observedLoot, ["獣の牙"]);
assert.deepEqual(createMonsterCodexRecord().observedActions, []);

const telegraphState = {
  floor: 1,
  party: [createSoloCharacter("Fighter")],
  inventory: [],
  firstKills: [],
  codex: { monsters: {} },
  currentRun: null,
  metaMaterials: {},
  roamingMonsters: [],
  floorChestsTotal: [],
  combatState: {
    monsters: [{
      name: "観測用魔術師",
      hp: 1000,
      maxHp: 1000,
      atk: 1,
      def: 0,
      exp: 1,
      spell: "LAHALITO",
      spellChance: 1,
      buffs: []
    }],
    phase: "choose_actions",
    roundNumber: 1,
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    allParalyzedTurns: 0,
    loggedCoreActivations: []
  }
};
const originalRandom = Math.random;
try {
  Math.random = () => 0;
  const result = runCombatRoundCalculation(telegraphState, {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  });
  assert.deepEqual(result.state.codex.monsters["観測用魔術師"].observedActions, []);
  assert.ok(result.logQueue.some(log => log.msg.includes("予兆")));
} finally {
  Math.random = originalRandom;
}

console.log("[PASS] Monster codex observations deduplicate actions and retain encounter history.");
