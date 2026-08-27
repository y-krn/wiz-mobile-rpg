import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import {
  MONSTERS,
  getMonsterEvasionChance,
  getPhysicalHitChance
} from "../../../src/data.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState({ agi = 10, monster, physicalAccuracy = false } = {}) {
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
      status: "ok",
      spells: [],
      equipment: {
        weapon: physicalAccuracy
          ? {
              kind: "equipment",
              baseId: "SHORT_SWORD",
              identified: true,
              affixes: [{ id: "CORE_PHYSICAL_ACCURACY", type: "CORE_PHYSICAL_ACCURACY", kind: "core" }]
            }
          : null,
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
        atk: 1,
        def: 0,
        row: "front",
        status: "ok",
        ...monster
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

function runAttack({ agi = 10, monster, physicalAccuracy = false }, randomValues) {
  const originalRandom = Math.random;
  Math.random = () => randomValues.shift() ?? 0;
  try {
    return runCombatRoundCalculation(createState({ agi, monster, physicalAccuracy }), {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    });
  } finally {
    Math.random = originalRandom;
  }
}

const evasiveMonsters = MONSTERS.filter(monster => monster.traits?.includes("evasive"));
assert.ok(evasiveMonsters.length >= 8, "real monster data must use evasive");
assert.ok(evasiveMonsters.every(monster => monster.evasionChance > 0), "evasive data must set evasionChance");
assert.equal(getMonsterEvasionChance({ traits: ["guardAdjacent"], evasionChance: 0.9 }), 0);
assert.equal(getMonsterEvasionChance({ traits: ["evasive"], evasionChance: 0.2 }), 0.2);

const target = { traits: ["evasive"], evasionChance: 0.2 };
assert.equal(getPhysicalHitChance({ agi: 10 }, target), 0.8);
assert.equal(getPhysicalHitChance({ agi: 20 }, target), 0.9);
assert.ok(Math.abs(getPhysicalHitChance({ agi: 0 }, target) - 0.7) < 1e-9);
assert.equal(getPhysicalHitChance({ agi: 0 }, { traits: [] }), 1);

const liveEvasiveTarget = evasiveMonsters[0];
const liveNormalTarget = MONSTERS.find(monster => !monster.traits?.includes("evasive"));
assert.ok(liveNormalTarget, "real monster data must retain normal targets");
assert.equal(getPhysicalHitChance({ agi: 0 }, liveNormalTarget), 1);

const hit = runAttack({ monster: liveEvasiveTarget }, [0, 0, 0.84, 0]);
assert.equal(hit.state.combatFormulaTelemetry.physicalPlayerHits.length, 1);
assert.equal(hit.state.combatFormulaTelemetry.physicalPlayerMisses.length, 0);
assert.equal(
  hit.state.combatFormulaTelemetry.physicalPlayerHits[0].targetEvasionChance,
  liveEvasiveTarget.evasionChance
);

const miss = runAttack({ monster: liveEvasiveTarget }, [0, 0, 0.85]);
assert.equal(miss.state.combatFormulaTelemetry.physicalPlayerHits.length, 0);
assert.deepEqual(miss.state.combatFormulaTelemetry.physicalPlayerMisses[0], {
  floor: 1,
  className: "Fighter",
  targetName: liveEvasiveTarget.name,
  targetRole: liveEvasiveTarget.role,
  targetEvasionChance: liveEvasiveTarget.evasionChance,
  hitChance: 1 - liveEvasiveTarget.evasionChance,
  isEvasionMiss: true
});
assert.match(miss.logQueue.map(entry => entry.msg).join("\n"), /霧のようにかわした/);

const guaranteedHit = runAttack({ monster: liveEvasiveTarget, physicalAccuracy: true }, [0, 0, 0.9999, 0]);
assert.equal(guaranteedHit.state.combatFormulaTelemetry.physicalPlayerHits.length, 1);
assert.equal(guaranteedHit.state.combatFormulaTelemetry.physicalPlayerMisses.length, 0);
assert.equal(
  guaranteedHit.state.combatFormulaTelemetry.physicalPlayerHits[0].hitChance,
  1,
  "必中 core caps evasive-target physical hit chance at 100%"
);

const normalCoreHit = runAttack({ monster: liveNormalTarget, physicalAccuracy: true }, [0, 0, 0.9999, 0]);
assert.equal(normalCoreHit.state.combatFormulaTelemetry.physicalPlayerHits.length, 1);
assert.equal(
  normalCoreHit.state.combatFormulaTelemetry.physicalPlayerHits[0].hitChance,
  1,
  "必中 core does not change normal-target behavior"
);

const normalHit = runAttack({ monster: liveNormalTarget }, [0, 0, 0, 0]);
assert.equal(normalHit.state.combatFormulaTelemetry.physicalPlayerHits.length, 1);
assert.equal(normalHit.state.combatFormulaTelemetry.physicalPlayerHits[0].hitChance, 1);

console.log(`[PASS] Hit/evasion data and deterministic resolution verified: evasive=${evasiveMonsters.length}`);
