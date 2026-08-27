import assert from "node:assert/strict";
import { recordCharDeath, state } from "../src/state.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

let failures = 0;

function test(name, fn) {
  try {
    state.logs = [];
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function createState(combatState) {
  return {
    currentRun: { deathLogs: [] },
    combatState,
    floor: 3
  };
}

test("records the combat round number in the death log", () => {
  const stateObj = createState({ roundNumber: 4 });

  recordCharDeath(stateObj, { name: "アレス" }, "ゴブリンの攻撃");

  assert.deepEqual(stateObj.currentRun.deathLogs, [{
    charName: "アレス",
    cause: "ゴブリンの攻撃",
    floor: 3,
    turn: 4
  }]);
  assert.deepEqual(state.logs, []);
});

test("records null and omits the turn text outside combat", () => {
  const stateObj = createState(null);

  recordCharDeath(stateObj, { name: "ミア" }, "落とし穴");

  assert.deepEqual(stateObj.currentRun.deathLogs, [{
    charName: "ミア",
    cause: "落とし穴",
    floor: 3,
    turn: null
  }]);
  assert.deepEqual(state.logs, []);
});

function createCombatState({ character, monster }) {
  return {
    party: [character],
    combatState: {
      monsters: [monster],
      roundNumber: 4,
      phase: "choose_actions",
      retreatPosition: null
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 6,
    logs: [],
    x: 1,
    y: 1
  };
}

function runWithFixedRandom(combatState, action) {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return runCombatRoundCalculation(combatState, { actions: [action] });
  } finally {
    Math.random = originalRandom;
  }
}

test("queues lethal magic-reflect damage before the death log", () => {
  const combatState = createCombatState({
    character: {
      name: "魔術師",
      class: "Mage",
      level: 1,
      hp: 5,
      maxHp: 5,
      mp: 10,
      maxMp: 10,
      int: 15,
      pie: 8,
      str: 8,
      vit: 10,
      agi: 12,
      luk: 8,
      status: "ok",
      spells: ["HALITO"],
      equipment: {}
    },
    monster: {
      name: "呪いの小鏡",
      hp: 30,
      maxHp: 30,
      atk: 5,
      def: 1,
      traits: ["reflectMagic"],
      magicReflect: { chance: 1 },
      buffs: []
    }
  });

  const result = runWithFixedRandom(combatState, {
    type: "spell",
    actorIdx: 0,
    targetIdx: 0,
    spellName: "HALITO"
  });
  const messages = result.logQueue.map(entry => entry.msg);
  const damageIndex = messages.findIndex(message => message.includes("反射ダメージ"));
  const deathIndex = messages.findIndex(message => message.startsWith("☠️ [!] 魔術師は"));

  assert.ok(damageIndex >= 0);
  assert.equal(deathIndex, damageIndex + 1);
  assert.deepEqual(result.state.currentRun.deathLogs[0], {
    charName: "魔術師",
    cause: "呪いの小鏡の魔法反射",
    floor: 6,
    turn: 4,
    type: "combat",
    source: "呪いの小鏡"
  });
});

test("queues lethal normal-attack damage before the death log", () => {
  const combatState = createCombatState({
    character: {
      name: "戦士",
      class: "Fighter",
      level: 1,
      hp: 1,
      maxHp: 1,
      mp: 0,
      maxMp: 0,
      int: 8,
      pie: 8,
      str: 8,
      vit: 10,
      agi: 1,
      luk: 8,
      status: "ok",
      spells: [],
      equipment: {}
    },
    monster: {
      name: "ゴブリン A",
      hp: 30,
      maxHp: 30,
      atk: 10,
      def: 1,
      row: "front",
      traits: [],
      buffs: []
    }
  });

  const result = runWithFixedRandom(combatState, {
    type: "defend",
    actorIdx: 0
  });
  const messages = result.logQueue.map(entry => entry.msg);
  const damageIndex = messages.findIndex(message => message.includes("ゴブリン Aの攻撃！"));
  const deathIndex = messages.findIndex(message => message.startsWith("☠️ [!] 戦士は"));

  assert.ok(damageIndex >= 0);
  assert.equal(deathIndex, damageIndex + 1);
  assert.equal(result.state.currentRun.deathLogs[0].cause, "ゴブリン Aの攻撃");
});

if (failures > 0) {
  process.exit(1);
}
