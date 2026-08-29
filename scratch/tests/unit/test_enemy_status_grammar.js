import assert from "node:assert/strict";
import test from "node:test";
import { runCombatRoundCalculation } from "../../../src/combat_logic/round.js";
import { hasStatusEffect, STATUS_EFFECT_IDS } from "../../../src/combat_logic/status_effects.js";

function createCharacter(overrides = {}) {
  return {
    name: "冒険者",
    class: "Fighter",
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    status: "ok",
    str: 10,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 20,
    luk: 10,
    equipment: {},
    spells: [],
    buffs: [],
    ...overrides
  };
}

function createState(monster, character = createCharacter(), telemetry = true) {
  return {
    floor: 4,
    party: [character],
    inventory: [],
    codex: null,
    firstKills: [],
    currentRun: null,
    metaMaterials: {},
    roamingMonsters: [],
    floorChestsTotal: [],
    combatFormulaTelemetry: null,
    simTelemetry: telemetry ? {
      enemyStatusGrammar: {
        attemptsByEnemyFloor: {},
        successesByEnemyFloor: {},
        resistedByEnemyFloor: {},
        payoffAttempts: 0,
        payoffs: 0,
        payoffDamage: 0,
        payoffDamageByEnemy: {},
        payoffLatencyTotal: 0,
        payoffLatencyCount: 0,
        cureBeforePayoff: 0,
        defendBeforePayoff: 0,
        fleeBeforePayoff: 0,
        killBeforePayoff: 0,
        statusLostBeforePayoff: 0,
        bossEvents: 0,
        midbossEvents: 0,
        responses: {},
        responsesByFloor: {},
        targets: {}
      }
    } : undefined,
    combatState: {
      monsters: [monster],
      phase: "resolving",
      roundNumber: 1,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false
    }
  };
}

function runWithRandom(state, actions) {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    return runCombatRoundCalculation(state, { actions });
  } finally {
    Math.random = originalRandom;
  }
}

test("poison setup queues a readable payoff and defend reduces it", () => {
  const state = createState({
    name: "ポイズンジャイアント",
    hp: 500,
    maxHp: 500,
    atk: 19,
    def: 7,
    status: "ok",
    isPoisonous: true,
    statusAttackPattern: "poison_payoff",
    traits: []
  });
  const setup = runWithRandom(state, [{ actorIdx: 0, type: "defend" }]);
  const queued = setup.state.combatState.monsters[0].statusPayoffQueued;
  assert.equal(queued.pattern, "poison_payoff");
  assert.equal(hasStatusEffect(setup.state.party[0], STATUS_EFFECT_IDS.POISONED), true);
  assert.equal(setup.state.party[0].hp, 98, "setup does not deal direct damage; only poison tick applies");
  assert.match(setup.logQueue.map(entry => entry.msg).join("\n"), /毒喰らい/);

  const payoff = runWithRandom(setup.state, [{ actorIdx: 0, type: "defend" }]);
  const grammar = payoff.state.simTelemetry.enemyStatusGrammar;
  assert.equal(grammar.payoffs, 1);
  assert.equal(grammar.defendBeforePayoff, 1);
  assert.equal(grammar.payoffLatencyTotal, 1);
  assert.equal(grammar.payoffLatencyCount, 1);
  assert.equal(payoff.state.combatState.monsters[0].statusPayoffQueued, undefined);
  assert.match(payoff.logQueue.map(entry => entry.msg).join("\n"), /毒喰らい/);

  const repeated = runWithRandom(payoff.state, [{ actorIdx: 0, type: "defend" }]);
  assert.equal(repeated.logQueue.some(entry => entry.msg.includes("毒喰らい")), false);
  assert.equal(repeated.state.party[0].status, "poisoned");
});

test("cure before payoff is recorded and falls back to a normal attack", () => {
  const state = createState({
    name: "ポイズンジャイアント",
    hp: 500,
    maxHp: 500,
    atk: 19,
    def: 7,
    status: "ok",
    statusAttackPattern: "poison_payoff",
    traits: []
  });
  state.inventory = ["ANTIDOTE"];
  const setup = runWithRandom(state, [{ actorIdx: 0, type: "defend" }]);
  const cured = runWithRandom(setup.state, [{ actorIdx: 0, type: "item", itemKey: "ANTIDOTE", targetIdx: 0 }]);
  const grammar = cured.state.simTelemetry.enemyStatusGrammar;
  assert.equal(grammar.cureBeforePayoff, 1);
  assert.equal(grammar.payoffs, 0);
  assert.equal(cured.state.combatState.monsters[0].statusPayoffQueued, undefined);
  assert.equal(cured.state.party[0].status, "ok");
  assert.ok(cured.logQueue.some(entry => entry.msg.includes("解毒薬")));
});

test("blind setup uses the second, distinct status grammar", () => {
  const state = createState({
    name: "煙幕盗賊",
    hp: 300,
    maxHp: 300,
    atk: 7,
    def: 2,
    status: "ok",
    statusAttackPattern: "blind_snipe",
    traits: []
  });
  const setup = runWithRandom(state, [{ actorIdx: 0, type: "defend" }]);
  assert.equal(setup.state.party[0].status, "blind");
  assert.equal(setup.state.combatState.monsters[0].statusPayoffQueued.pattern, "blind_snipe");
  const payoff = runWithRandom(setup.state, [{ actorIdx: 0, type: "defend" }]);
  assert.equal(payoff.state.combatState.monsters[0].statusPayoffQueued, undefined);
  assert.equal(payoff.state.simTelemetry.enemyStatusGrammar.payoffs, 1);
  assert.ok(payoff.logQueue.some(entry => entry.msg.includes("目眩まし狙撃")));
});

test("status resistance and killing the setup enemy are separate outcomes", () => {
  const resistant = createState({
    name: "煙幕盗賊",
    hp: 300,
    maxHp: 300,
    atk: 7,
    def: 2,
    status: "ok",
    statusAttackPattern: "blind_snipe",
    traits: []
  }, createCharacter({
    equipment: { accessory: { affixes: [{ id: "statusResistance", type: "statusResistance", value: 100 }] } }
  }));
  const resisted = runWithRandom(resistant, [{ actorIdx: 0, type: "defend" }]);
  assert.equal(resisted.state.simTelemetry.enemyStatusGrammar.resistedByEnemyFloor["B4:煙幕盗賊"], 1);
  assert.equal(resisted.state.party[0].status, "ok");

  const killState = createState({
    name: "ポイズンジャイアント",
    hp: 1,
    maxHp: 1,
    atk: 19,
    def: 0,
    status: "ok",
    statusAttackPattern: "poison_payoff",
    traits: []
  });
  const setup = runWithRandom(killState, [{ actorIdx: 0, type: "defend" }]);
  const killed = runWithRandom(setup.state, [{ actorIdx: 0, type: "fight", targetIdx: 0 }]);
  assert.equal(killed.state.simTelemetry.enemyStatusGrammar.killBeforePayoff, 1);
  assert.equal(killed.state.combatState.monsters[0].statusPayoffQueued, undefined);
});

test("fleeing clears a queued payoff and records the response", () => {
  const state = createState({
    name: "煙幕盗賊",
    hp: 300,
    maxHp: 300,
    atk: 7,
    def: 2,
    status: "ok",
    statusAttackPattern: "blind_snipe",
    traits: []
  });
  state.combatState.retreatPosition = { x: 2, y: 3 };
  const setup = runWithRandom(state, [{ actorIdx: 0, type: "defend" }]);
  const fled = runWithRandom(setup.state, [{ actorIdx: 0, type: "run" }]);
  assert.deepEqual([fled.state.x, fled.state.y], [2, 3]);
  assert.ok(fled.logQueue.some(entry => entry.runEscape));
  assert.equal(fled.state.simTelemetry.enemyStatusGrammar.fleeBeforePayoff, 1);
  assert.equal(fled.state.combatState.monsters[0].statusPayoffQueued, undefined);
});

test("boss and midboss encounters keep their existing status policy", () => {
  const state = createState({
    name: "ポイズンジャイアント",
    hp: 500,
    maxHp: 500,
    atk: 19,
    def: 7,
    status: "ok",
    isPoisonous: true,
    statusAttackPattern: "poison_payoff",
    traits: []
  });
  state.combatState.isBoss = true;
  const result = runWithRandom(state, [{ actorIdx: 0, type: "defend" }]);
  assert.equal(result.state.party[0].status, "poisoned");
  assert.equal(result.state.combatState.monsters[0].statusPayoffQueued, undefined);
  assert.equal(result.state.simTelemetry.enemyStatusGrammar.payoffs, 0);
});
