import { FLEE_BASE_CHANCE, FLEE_MIN_CHANCE, getFleeChance } from "../../../src/rules/flee_rules.js";
import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import { clearCharIncapacitationOnDamage } from "../../../src/combat_logic/status_effects.js";
import {
  getPhysicalDefenseResistance,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
} from "../../../src/rules/character_stats.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ status = "ok", isBoss = false, retreatPosition = null, charOverrides = {}, monsterOverrides = {} } = {}) {
  return {
    party: [{
      name: "Solo",
      level: 5,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      status,
      buffs: [{ type: "firstStrike", value: 100 }],
      spells: [],
      equipment: { weapon: "SHORT_SWORD", shield: null, armor: "PLATE_MAIL", accessory: null },
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

test("blind clears when a surviving party ends combat", () => {
  const state = createState({
    status: "blind",
    monsterOverrides: { hp: 1, maxHp: 1 }
  });
  {
    const result = runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    }, { rng: () => 0.9 });
    assert.equal(result.state.party[0].status, "ok");
    assert.ok(result.logQueue.some(log => log.msg?.includes("盲目が戦闘終了で解けた")));
  }
});

test("blind clears when combat ends by fleeing", () => {
  const state = createState({ status: "blind" });
  {
    const result = runCombatRoundCalculation(state, {
      actions: [{ type: "run", actorIdx: 0 }]
    }, { rng: () => 0 });
    assert.equal(result.state.party[0].status, "ok");
    assert.ok(result.logQueue.some(log => log.msg?.includes("盲目が戦闘終了で解けた")));
  }
});

test("flee always succeeds against a boss, takes one parting hit, and retreats", () => {
  const state = createState({ isBoss: true, retreatPosition: { x: 4, y: 5 } });
  {
    const result = runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
    assert.ok(result.logQueue.some(log => log.runEscape));
    const expectedPartingDamage = Math.max(
      1,
      Math.floor(10 * (1 - getPhysicalDefenseResistance(16, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING)))
    );
    assert.equal(result.state.party[0].hp, 100 - expectedPartingDamage);
    assert.deepEqual({ x: result.state.x, y: result.state.y }, { x: 4, y: 5 });
    assert.ok(result.logQueue.some(log => log.msg?.includes("追撃")));
  }
});

test("fleeing the round-trip hunter costs its parting blow but never the last HP (#2062)", () => {
  const hunterState = () => {
    const state = createState({ charOverrides: { hp: 3 }, monsterOverrides: { atk: 40 } });
    state.combatState.isRoamingFlack = true;
    state.combatState.roamingMonsterId = "hunter:3";
    state.roamingMonsters = [{ id: "hunter:3", floor: 3, x: 6, y: 5, homeX: 6, homeY: 5, hunter: true, kind: "elite" }];
    state.maps = [];
    return state;
  };
  const hunted = runCombatRoundCalculation(hunterState(), { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
  assert.ok(hunted.logQueue.some(log => log.runEscape));
  assert.equal(hunted.state.party[0].hp, 1);
  assert.notEqual(hunted.state.party[0].status, "dead");
  // Already at 1 HP, the blow takes nothing.
  const atOne = hunterState();
  atOne.party[0].hp = 1;
  const last = runCombatRoundCalculation(atOne, { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
  assert.equal(last.state.party[0].hp, 1);
  // Any other elite's parting blow can still finish the run.
  const other = hunterState();
  other.roamingMonsters[0].hunter = false;
  const fled = runCombatRoundCalculation(other, { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
  assert.equal(fled.state.party[0].hp, 0);
});

test("an ordinary flee is a chance: it can fail, and a clean escape takes no parting hit (#2101)", () => {
  const state = createState({ retreatPosition: { x: 4, y: 5 } });
  const chance = getFleeChance(state.party[0], state.combatState);
  assert.equal(chance, FLEE_BASE_CHANCE);
  // A roll at or above the chance fails and spends the turn.
  const failed = runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0.99 });
  assert.equal(failed.logQueue.some(log => log.runEscape), false);
  assert.ok(failed.logQueue.some(log => log.msg?.includes("回り込まれた")));
  // A roll below it escapes with no parting hit.
  const escaped = runCombatRoundCalculation(createState({ retreatPosition: { x: 4, y: 5 } }), { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
  assert.ok(escaped.logQueue.some(log => log.runEscape));
  assert.equal(escaped.state.party[0].hp, 100);
  assert.deepEqual({ x: escaped.state.x, y: escaped.state.y }, { x: 4, y: 5 });
  assert.equal(escaped.logQueue.some(log => log.msg?.includes("追撃")), false);
});

test("more enemies lower the flee chance, escape support raises it, within bounds (#2101)", () => {
  const combat = count => ({ monsters: Array.from({ length: count }, () => ({ hp: 10 })) });
  const hero = { equipment: {} };
  assert.equal(getFleeChance(hero, combat(1)), 0.7);
  assert.ok(Math.abs(getFleeChance(hero, combat(3)) - 0.5) < 1e-9);
  assert.equal(getFleeChance(hero, combat(9)), FLEE_MIN_CHANCE);
  assert.equal(getFleeChance(hero, { ...combat(3), isRoamingFlack: true }), 1);
  assert.equal(getFleeChance(hero, { ...combat(1), isBoss: true }), 1);
});

test("flee succeeds in place when no retreat tile was captured", () => {
  const state = createState();
  {
    const result = runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] }, { rng: () => 0 });
    assert.ok(result.logQueue.some(log => log.runEscape));
    assert.deepEqual({ x: result.state.x, y: result.state.y }, { x: 5, y: 5 });
    assert.ok(result.logQueue.some(log => log.msg?.includes("その場に留まった")));
  }
});

if (failures > 0) {
  console.error(`${failures} status/flee test(s) failed.`);
  process.exit(1);
}

console.log("All status/flee tests passed.");
