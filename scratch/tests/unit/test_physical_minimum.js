import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import {
  applyTargetedDamageBonus,
  reduceIncomingDamage
} from "../../../src/combat_logic/damage.js";
import {
  applyPhysicalResistance,
  getPhysicalDefenseResistance,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING
} from "../../../src/rules/character_stats.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({
  characterStatus = "ok",
  className = "Fighter",
  highPlayerDef = false,
  highMonsterDef = false,
  followUp = false
} = {}) {
  return {
    party: [{
      name: "Tester",
      class: className,
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
      status: characterStatus,
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

// Every resolved physical hit keeps the minimum-one rule, including the
// targeted affix stage, guard, critical output, and follow-up output.
const normalHit = run(
  createState({ highMonsterDef: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.equal(normalHit.state.combatState.monsters[0].hp, 999);
assert.equal(normalHit.state.combatFormulaTelemetry.physicalPlayerHits[0].damage, 1);

const targetedMinimum = applyTargetedDamageBonus(
  { class: "Fighter", hp: 10, maxHp: 10, equipment: {} },
  { name: "Target", hp: 10, maxHp: 10, status: "ok" },
  0
);
assert.equal(targetedMinimum, 1, "targeted physical affix stage keeps a hit at one damage");

const criticalHit = run(
  createState({ className: "Ninja", highMonsterDef: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.equal(criticalHit.state.combatState.monsters[0].hp, 997);
assert.equal(criticalHit.state.combatFormulaTelemetry.physicalPlayerHits[0].isCritical, true);
assert.equal(criticalHit.state.combatFormulaTelemetry.physicalPlayerHits[0].damage, 3);

const followUpHit = run(
  createState({ highMonsterDef: true, followUp: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 }
);
assert.equal(followUpHit.state.combatState.monsters[0].hp, 998);
assert.match(
  followUpHit.logQueue.map(entry => entry.msg).join("\n"),
  /追撃.*1のダメージ/
);

// Incoming physical mitigation and flee parting attacks also preserve the
// minimum after very high player defense and defend reduction.
const enemyNormalHit = run(
  createState({ highPlayerDef: true }),
  { type: "defend", actorIdx: 0 }
);
assert.equal(enemyNormalHit.state.party[0].hp, 99);
assert.equal(enemyNormalHit.state.combatFormulaTelemetry.physicalMonsterHits.at(-1).finalDmg, 1);

const enemyFleeHit = run(
  createState({ highPlayerDef: true }),
  { type: "run", actorIdx: 0 }
);
assert.equal(enemyFleeHit.state.party[0].hp, 99);
assert.equal(enemyFleeHit.state.combatFormulaTelemetry.physicalMonsterHits.at(-1).finalDmg, 1);

// Misses exit before physical damage resolution and still deal zero.
const blindMiss = run(
  createState({ characterStatus: "blind", highMonsterDef: true }),
  { type: "fight", actorIdx: 0, targetIdx: 0 },
  [0, 0, 0.49]
);
assert.equal(blindMiss.state.combatState.monsters[0].hp, 1000);
assert.equal(blindMiss.state.combatFormulaTelemetry.physicalPlayerHits.length, 0);
assert.match(blindMiss.logQueue.map(entry => entry.msg).join("\n"), /空振りした/);

// Physical formula and mitigation outputs cannot turn a negative input into
// healing; the resolved physical path remains non-negative and hit-minimum-1.
assert.equal(
  reduceIncomingDamage({ class: "Fighter", hp: 100, maxHp: 100 }, -5),
  1,
  "negative incoming physical damage cannot heal HP"
);
assert.equal(
  applyPhysicalResistance(0, getPhysicalDefenseResistance(100000, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING)),
  1,
  "resolved physical resistance keeps a hit at one damage"
);

console.log("[PASS] Physical hits resolve to at least one damage and misses remain zero.");
