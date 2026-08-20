import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import { reduceIncomingDamage } from "../src/combat_logic/damage.js";
import {
  applyPhysicalResistance,
  getPhysicalDefenseResistance,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
} from "../src/rules/character_stats.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ highPlayerDef = false, highMonsterDef = false, followUp = false, boss = false } = {}) {
  return {
    party: [{
      name: "Tester",
      class: "Fighter",
      level: 5,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      str: 15,
      int: 8,
      pie: 8,
      vit: highPlayerDef ? 400000 : 10,
      agi: 100,
      luk: 10,
      status: "ok",
      spells: [],
      equipment: {
        weapon: null,
        shield: null,
        armor: null,
        accessory: followUp
          ? { baseId: "SWIFT_BAND", identified: true, affixes: [{ type: "followUp", value: 50 }] }
          : null
      }
    }],
    combatState: {
      monsters: [{
        name: "Target",
        hp: 1000,
        maxHp: 1000,
        atk: 1,
        def: highMonsterDef ? 100000 : 0,
        row: "front",
        status: highMonsterDef ? "paralyzed" : "ok",
        paralyzeTurns: 2
      }],
      isBoss: boss,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      roundNumber: 1,
      retreatPosition: null,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1,
    x: 5,
    y: 5,
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

function run(state, action, randomValues = [0, 0, 0, 0]) {
  const originalRandom = Math.random;
  Math.random = () => randomValues.shift() ?? 0;
  try {
    return runCombatRoundCalculation(state, { actions: [action] });
  } finally {
    Math.random = originalRandom;
  }
}

// Player normal attack and follow-up may resolve to zero against very high DEF,
// and zero must leave the target HP unchanged rather than healing it.
const normalZero = run(
  createState({ highMonsterDef: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.equal(normalZero.state.combatState.monsters[0].hp, 1000);
assert.equal(normalZero.state.combatFormulaTelemetry.physicalPlayerHits[0].damage, 0);

const followUpZero = run(
  createState({ highMonsterDef: true, followUp: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.equal(followUpZero.state.combatState.monsters[0].hp, 1000);
assert.match(
  followUpZero.logQueue.map(entry => entry.msg).join("\n"),
  /追撃.*0のダメージ/
);

// Enemy normal attack and flee parting attack use the same non-negative floor.
const enemyNormalZeroState = run(
  createState({ highPlayerDef: true }),
  { type: "defend", actorIdx: 0 }
);
assert.equal(enemyNormalZeroState.state.party[0].hp, 100);
assert.equal(enemyNormalZeroState.state.combatFormulaTelemetry.physicalMonsterHits.at(-1).finalDmg, 0);

const enemyFleeZeroState = run(
  createState({ highPlayerDef: true, boss: true }),
  { type: "run", actorIdx: 0 }
);
assert.equal(enemyFleeZeroState.state.party[0].hp, 100);
assert.equal(enemyFleeZeroState.state.combatFormulaTelemetry.physicalMonsterHits.at(-1).finalDmg, 0);

// Ordinary positive physical damage remains positive, and the incoming pool is
// still the calibrated k_in curve for nonzero damage.
const positive = run(
  createState(),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.ok(1000 - positive.state.combatState.monsters[0].hp > 0);
assert.ok(applyPhysicalResistance(10, getPhysicalDefenseResistance(10, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING)) > 0);
assert.equal(
  reduceIncomingDamage({ class: "Fighter", hp: 100, maxHp: 100 }, -5, { allowZeroDamage: true }),
  0,
  "negative physical output must clamp to zero rather than heal"
);

console.log("[PASS] Physical minimum-one removal allows zero without HP healing and preserves positive damage.");
