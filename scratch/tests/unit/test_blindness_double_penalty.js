import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ characterStatus = "ok", monsterStatus = "ok", agi = 1 } = {}) {
  return {
    party: [{
      name: "Tester",
      class: "Fighter",
      level: 1,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      str: 15,
      int: 8,
      pie: 8,
      vit: 10,
      agi,
      luk: 10,
      status: characterStatus,
      spells: [],
      equipment: {
        weapon: null,
        shield: null,
        armor: null,
        accessory: null
      }
    }],
    combatState: {
      monsters: [{
        name: "Target",
        hp: 100,
        maxHp: 100,
        atk: 10,
        def: 0,
        row: "front",
        status: monsterStatus
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
    floor: 1,
    combatFormulaTelemetry: {
      physicalPlayerHits: [],
      physicalPlayerMisses: [],
      physicalMonsterHits: [],
      targetedBonuses: [],
      mitigations: [],
      mitigationCalls: []
    }
  };
}

function runRound(state, randomValues, action) {
  const originalRandom = Math.random;
  Math.random = () => randomValues.shift() ?? 0;
  try {
    return runCombatRoundCalculation(state, { actions: [action] });
  } finally {
    Math.random = originalRandom;
  }
}

function playerAttack(characterStatus, randomValues) {
  return runRound(
    createState({ characterStatus, agi: 100 }),
    randomValues,
    { type: "fight", actorIdx: 0, targetIdx: 0 }
  );
}

const clearPlayerHit = playerAttack("ok", [0, 0, 0]);
const blindPlayerHit = playerAttack("blind", [0, 0, 0.5, 0]);
const clearPlayerDamage = 100 - clearPlayerHit.state.combatState.monsters[0].hp;
const blindPlayerDamage = 100 - blindPlayerHit.state.combatState.monsters[0].hp;
assert.equal(blindPlayerHit.state.combatFormulaTelemetry.physicalPlayerHits.length, 1);
assert.equal(blindPlayerDamage, clearPlayerDamage, "blind player hit must not halve damage");
assert.equal(
  blindPlayerHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isBlindApplied,
  true
);

const blindPlayerMiss = playerAttack("blind", [0, 0, 0.49]);
assert.equal(blindPlayerMiss.state.combatFormulaTelemetry.physicalPlayerHits.length, 0);
assert.equal(blindPlayerMiss.state.combatFormulaTelemetry.physicalPlayerMisses.length, 0);
assert.match(
  blindPlayerMiss.logQueue.map(entry => entry.msg).join("\n"),
  /目がくらんで空振りした/
);
assert.equal(blindPlayerMiss.state.combatState.monsters[0].hp, 100);

function enemyAttack(characterStatus) {
  const result = runRound(
    createState({ characterStatus }),
    [0, 0, 0],
    { type: "defend", actorIdx: 0 }
  );
  return {
    damage: 100 - result.state.party[0].hp,
    telemetry: result.state.combatFormulaTelemetry.physicalMonsterHits.at(-1)
  };
}

const clearEnemyHit = enemyAttack("ok");
const blindEnemyHit = enemyAttack("blind");
assert.equal(blindEnemyHit.damage, clearEnemyHit.damage, "blind target must not take 1.5x physical damage");
assert.equal(blindEnemyHit.telemetry.isBlindTargetApplied, true);

console.log(
  `[PASS] Blindness physical treatment is miss-only: player=${clearPlayerDamage}, enemy=${clearEnemyHit.damage}`
);
