import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { clearCharIncapacitationOnDamage } from "../src/combat_logic/status_effects.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ status = "ok", isBoss = false, retreatPosition = null, charOverrides = {}, monsterOverrides = {} } = {}) {
  return {
    party: [{
      name: "Solo",
      class: "Fighter",
      level: 5,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      str: 15,
      int: 8,
      pie: 8,
      vit: 10,
      agi: 100,
      luk: 10,
      status,
      spells: [],
      equipment: { weapon: "SHORT_SWORD", shield: null, armor: null, accessory: null },
      ...charOverrides
    }],
    combatState: {
      monsters: [{
        name: "Pursuer",
        hp: 100,
        maxHp: 100,
        atk: 10,
        def: 0,
        row: "front",
        ...monsterOverrides
      }],
      isBoss,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      roundNumber: 1,
      retreatPosition,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    openedGates: [],
    gold: 0,
    floor: 3,
    x: 5,
    y: 5
  };
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

test("sleep and paralysis always clear when a surviving character takes damage", () => {
  for (const status of ["sleep", "paralyze", "paralyzed"]) {
    const char = { hp: 1, status, sleepTurns: 2, paralyzeTurns: 2 };
    assert.equal(clearCharIncapacitationOnDamage(char), true);
    assert.equal(char.status, "ok");
    assert.equal(char.sleepTurns, undefined);
    assert.equal(char.paralyzeTurns, undefined);
  }
  const poisoned = { hp: 1, status: "poisoned" };
  assert.equal(clearCharIncapacitationOnDamage(poisoned), false);
  assert.equal(poisoned.status, "poisoned");
});

test("sleep costs exactly one action opportunity and then naturally clears", () => {
  const state = createState({ status: "sleep", monsterOverrides: { status: "sleep", sleepTurns: 2 } });
  const result = runCombatRoundCalculation(state, { actions: [] });
  assert.equal(result.state.party[0].status, "ok");
  assert.equal(result.state.combatState.monsters[0].hp, 100);
  assert.ok(result.logQueue.some(log => log.msg?.includes("眠りから目を覚ました")));
});

test("paralysis costs exactly one action opportunity without defeat countdown", () => {
  const state = createState({ status: "paralyzed", monsterOverrides: { status: "sleep", sleepTurns: 2 } });
  const result = runCombatRoundCalculation(state, { actions: [] });
  assert.equal(result.state.party[0].status, "ok");
  assert.equal(result.state.party[0].hp, 100);
  assert.equal(result.state.combatState.allParalyzedTurns, 0);
});

test("flee always succeeds against a boss, takes one parting hit, and retreats", () => {
  const state = createState({ isBoss: true, retreatPosition: { x: 4, y: 5 } });
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const result = runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] });
    assert.ok(result.logQueue.some(log => log.runEscape));
    assert.equal(result.state.party[0].hp, 92);
    assert.deepEqual({ x: result.state.x, y: result.state.y }, { x: 4, y: 5 });
    assert.ok(result.logQueue.some(log => log.msg?.includes("追撃")));
  } finally {
    Math.random = originalRandom;
  }
});

test("flee succeeds in place when no retreat tile was captured", () => {
  const state = createState();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const result = runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] });
    assert.ok(result.logQueue.some(log => log.runEscape));
    assert.deepEqual({ x: result.state.x, y: result.state.y }, { x: 5, y: 5 });
    assert.ok(result.logQueue.some(log => log.msg?.includes("その場に留まった")));
  } finally {
    Math.random = originalRandom;
  }
});

test("Ninja critical is heavy resisted damage, never forced instant death", () => {
  const state = createState({
    charOverrides: { class: "Ninja", level: 10 },
    monsterOverrides: { hp: 1000, maxHp: 1000, def: 20, physResist: 0.5, status: "sleep", sleepTurns: 2 }
  });
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const result = runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }] });
    assert.ok(result.state.combatState.monsters[0].hp > 0);
    assert.ok(result.state.combatState.monsters[0].hp < 1000);
    assert.ok(result.logQueue.some(log => log.msg?.includes("大ダメージ")));
    assert.ok(!result.logQueue.some(log => log.msg?.includes("即死") || log.floatText === "即死"));
  } finally {
    Math.random = originalRandom;
  }
});

if (failures > 0) {
  console.error(`${failures} status/flee test(s) failed.`);
  process.exit(1);
}

console.log("All status/flee tests passed.");
