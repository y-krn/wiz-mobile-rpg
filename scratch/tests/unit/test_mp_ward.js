import assert from "node:assert/strict";
import { MONSTERS } from "../../../src/data.js";
import { CLASS_PASSIVES } from "../../../src/data/classes.js";
import { createDefaultCurrentRun, createSoloCharacter } from "../../../src/state/initial_state.js";
import { getMpWardDef, runCombatRoundCalculation } from "../../../src/combat_logic/round.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const MANA_DRAIN = MONSTERS.find(monster => monster.name === "マナドレイン");
const ATTACK_ROLLS = [0, 0.25, 0.5, 0.75];

function makeState(mp) {
  const character = createSoloCharacter("Mage");
  character.hp = character.maxHp = 100;
  character.mp = mp;
  const monster = structuredClone(MANA_DRAIN);
  monster.hp = monster.maxHp = 1000;
  return {
    party: [character],
    combatState: { monsters: [monster], roundNumber: 1, phase: "choose_actions", retreatPosition: null },
    inventory: [], firstKills: [], codex: null, currentRun: createDefaultCurrentRun(), metaMaterials: {},
    roamingMonsters: [], floorChestsTotal: [], floor: 2, x: 5, y: 5,
    combatFormulaTelemetry: {
      physicalPlayerHits: [], physicalPlayerMisses: [], physicalMonsterHits: [],
      targetedBonuses: [], mitigations: [], mitigationCalls: []
    }
  };
}

function runNormalHits(mp) {
  let state = makeState(mp);
  const rows = [];
  ATTACK_ROLLS.forEach(attackRoll => {
    const originalRandom = Math.random;
    let cursor = 0;
    const randomValues = [0, 0, 0.5, 1, 1, 0.5, attackRoll];
    Math.random = () => randomValues[cursor++] ?? 0;
    try {
      state = runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }] }).state;
      rows.push(state.combatFormulaTelemetry.physicalMonsterHits.at(-1));
    } finally {
      Math.random = originalRandom;
    }
  });
  return rows;
}

function runFleeHit(mp, attackRoll) {
  const state = makeState(mp);
  const originalRandom = Math.random;
  let cursor = 0;
  const randomValues = [0, 0, attackRoll];
  Math.random = () => randomValues[cursor++] ?? 0;
  try {
    return runCombatRoundCalculation(state, { actions: [{ type: "run", actorIdx: 0 }] }).state
      .combatFormulaTelemetry.physicalMonsterHits.at(-1);
  } finally {
    Math.random = originalRandom;
  }
}

assert.equal(CLASS_PASSIVES.Mage.bonuses.mpWard, 1);
assert.equal(getMpWardDef({ class: "Mage", mp: 1 }), 1);
assert.equal(getMpWardDef({ class: "Mage", mp: 0 }), 0);

const active = runNormalHits(12);
const empty = runNormalHits(0);
assert.deepEqual(active.map(row => row.finalAtk), [4, 5, 6, 7]);
assert.deepEqual(active.map(row => row.finalDef), [4, 4, 4, 4]);
assert.deepEqual(active.map(row => row.defResistance), [1 / 3, 1 / 3, 1 / 3, 1 / 3]);
assert.deepEqual(active.map(row => row.formulaRaw), [4, 5, 6, 7]);
assert.deepEqual(active.map(row => row.formulaDmg), [2, 3, 4, 4]);
assert.deepEqual(active.map(row => row.finalDmg), [2, 3, 4, 4]);
assert.deepEqual(empty.map(row => row.finalDef), [3, 3, 3, 3]);
assert.deepEqual(empty.map(row => row.defResistance), [3 / 11, 3 / 11, 3 / 11, 3 / 11]);
assert.deepEqual(empty.map(row => row.formulaDmg), [2, 3, 4, 5]);
assert.deepEqual(empty.map(row => row.finalDmg), [2, 3, 4, 5]);
assert.ok(active.some(row => row.finalDmg > 1), "MP-active Mana Drain hits must not all clamp to one");
assert.ok(empty.some(row => row.finalDmg > active[1].finalDmg), "MP-empty behavior must remain less mitigated");

const activeFlee = runFleeHit(12, 0.75);
const emptyFlee = runFleeHit(0, 0.75);
assert.equal(activeFlee.attackType, "flee");
assert.equal(activeFlee.finalDef, 4);
assert.equal(activeFlee.defResistance, 1 / 3);
assert.equal(activeFlee.formulaRaw, 7);
assert.equal(activeFlee.formulaDmg, 4);
assert.equal(activeFlee.finalDmg, 4);
assert.equal(emptyFlee.finalDef, 3);
assert.equal(emptyFlee.defResistance, 3 / 11);
assert.equal(emptyFlee.formulaDmg, 5);
assert.equal(emptyFlee.finalDmg, 5);

console.log("[PASS] Mage mpWard preserves MP gating and fixes normal/flee Mana Drain minimum-1 pileup.");
