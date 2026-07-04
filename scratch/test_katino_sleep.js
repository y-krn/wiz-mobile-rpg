global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

import assert from "assert";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";

function createState(monsterOverrides = {}, partyOverrides = {}) {
  return {
    party: [
      {
        name: "MageChar",
        class: "Mage",
        level: 5,
        hp: 30,
        maxHp: 30,
        mp: 10,
        maxMp: 10,
        status: "ok",
        str: 10,
        int: 10,
        pie: 10,
        vit: 10,
        agi: 50,
        luk: 10,
        equipment: { weapon: "WAND", shield: null, armor: null },
        spells: ["KATINO"],
        ...partyOverrides
      }
    ],
    combatState: {
      monsters: [
        {
          name: "SleepTarget",
          hp: 30,
          maxHp: 30,
          atk: 1,
          def: 0,
          exp: 1,
          gold: 1,
          level: 1,
          row: "front",
          color: "#fff",
          ...monsterOverrides
        }
      ],
      isBoss: false,
      isMidboss: false,
      allParalyzedTurns: 0,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 1
  };
}

function withRandom(values, fn) {
  const originalRandom = Math.random;
  let idx = 0;
  Math.random = () => values[idx++] ?? values[values.length - 1] ?? 0;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

console.log("Starting KATINO sleep tests...");

{
  console.log("- Test 1: KATINO sleep naturally expires");
  const state = createState();
  const selection = {
    actions: [{ type: "spell", actorIdx: 0, targetIdx: -1, spellName: "KATINO" }]
  };

  const result1 = withRandom([0, 0, 0], () => runCombatRoundCalculation(state, selection));
  const slept = result1.state.combatState.monsters[0];
  assert.strictEqual(slept.status, "sleep", "KATINO should set sleep status.");
  assert.strictEqual(slept.sleepTurns, 1, "sleepTurns should tick from 2 to 1 at round end.");
  assert.ok(result1.logQueue.some(log => log.msg?.includes("動けない")), "Sleeping monster should skip action.");

  const result2 = withRandom([0, 0], () => runCombatRoundCalculation(result1.state, {
    actions: [{ type: "defend", actorIdx: 0 }]
  }));
  const awake = result2.state.combatState.monsters[0];
  assert.strictEqual(awake.status, undefined, "Sleep should expire after the next skipped enemy turn.");
  assert.strictEqual(awake.sleepTurns, undefined, "Expired sleep should clear sleepTurns.");
}

{
  console.log("- Test 2: damage can wake a sleeping monster");
  const state = createState({ status: "sleep", sleepTurns: 2 });
  const result = withRandom([0, 0, 0, 0], () => runCombatRoundCalculation(state, {
    actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
  }));
  const monster = result.state.combatState.monsters[0];
  assert.strictEqual(monster.status, undefined, "Damage wake roll should clear sleep.");
  assert.strictEqual(monster.sleepTurns, undefined, "Damage wake should clear sleepTurns.");
  assert.ok(result.logQueue.some(log => log.msg?.includes("目を覚ました")), "Wake log should be emitted.");
}

{
  console.log("- Test 3: boss sleep chance is reduced");
  const normal = { name: "Normal", hp: 30 };
  const boss = { name: "Boss", hp: 30, isBoss: true };
  const caster = { name: "MageChar", int: 10 };

  SPELL_EFFECTS.KATINO({ caster, target: [normal], rng: () => 0.25 });
  SPELL_EFFECTS.KATINO({ caster, target: [boss], rng: () => 0.25 });

  assert.strictEqual(normal.status, "sleep", "Normal monster should sleep at 0.25 roll.");
  assert.strictEqual(normal.sleepTurns, 2, "Successful KATINO should set sleepTurns.");
  assert.strictEqual(boss.status, undefined, "Boss should resist the same 0.25 roll after chance reduction.");
}

console.log("KATINO sleep tests passed.");
