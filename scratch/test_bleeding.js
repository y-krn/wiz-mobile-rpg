import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import {
  applyStatusEffect,
  getStatusEffectRemainingTurns,
  hasStatusEffect,
  removeStatusEffect,
  tickStatusEffects,
  STATUS_EFFECT_IDS,
  BLEEDING_DURATION_TURNS
} from "../src/combat_logic/status_effects.js";

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function createState(monster = {}) {
  return {
    party: [{
      name: "Tester", class: "Fighter", level: 1,
      hp: 100, maxHp: 100, mp: 0, maxMp: 0,
      str: 15, int: 8, pie: 8, vit: 10, agi: 100, luk: 10, status: "ok", spells: [],
      equipment: {
        weapon: {
          baseId: "SHORT_SWORD", identified: true,
          affixes: [{ id: "bleedingAtk", type: "bleedingAtk", kind: "support", value: 100 }]
        },
        shield: null, armor: null, accessory: null
      }
    }],
    combatState: {
      monsters: [{ name: "Target", hp: 1000, maxHp: 1000, atk: 1, def: 0, row: "front", status: "ok", ...monster }],
      roundNumber: 1, phase: "choose_actions"
    },
    inventory: [], firstKills: [], codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [], roamingMonsters: [], floor: 1,
    simTelemetry: {
      bleeding: { applications: 0, refresh: 0, triggered: 0, damageContribution: 0, expired: 0, cleared: 0, failed: 0, sources: {}, builds: {}, bossEvents: 0, midbossEvents: 0 }
    },
    combatFormulaTelemetry: {
      physicalPlayerHits: [], physicalPlayerMisses: [], physicalMonsterHits: [],
      targetedBonuses: [], mitigations: [], mitigationCalls: []
    }
  };
}

function runRound(state, randomValues) {
  const originalRandom = Math.random;
  Math.random = () => randomValues.shift() ?? 0;
  try {
    return runCombatRoundCalculation(state, { actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }] });
  } finally {
    Math.random = originalRandom;
  }
}

const first = runRound(createState(), [0, 0, 0, 0]);
const firstTarget = first.state.combatState.monsters[0];
assert.equal(hasStatusEffect(firstTarget, STATUS_EFFECT_IDS.BLEEDING), true);
assert.equal(getStatusEffectRemainingTurns(firstTarget, STATUS_EFFECT_IDS.BLEEDING), BLEEDING_DURATION_TURNS - 1);
assert.match(first.logQueue.map(entry => entry.msg).join("\n"), /出血/);
assert.equal(first.state.simTelemetry.bleeding.applied, 1);
assert.equal(first.state.combatFormulaTelemetry.physicalPlayerHits[0].bleedingTrigger, false);

const second = runRound(first.state, [0, 0, 0, 0]);
const secondTarget = second.state.combatState.monsters[0];
const secondHit = second.state.combatFormulaTelemetry.physicalPlayerHits.at(-1);
assert.equal(secondHit.bleedingTrigger, true);
assert.equal(secondHit.bleedingDamageContribution, 2);
assert.equal(second.state.simTelemetry.bleeding.triggered, 1);
assert.equal(second.state.simTelemetry.bleeding.refresh, 1);
assert.equal(getStatusEffectRemainingTurns(secondTarget, STATUS_EFFECT_IDS.BLEEDING), BLEEDING_DURATION_TURNS - 1);
assert.equal(secondTarget.statusEffects.bleeding.stacks, 1);
assert.match(second.logQueue.map(entry => entry.msg).join("\n"), /出血の追撃/);

const lifecycleTarget = { status: "ok" };
applyStatusEffect(lifecycleTarget, STATUS_EFFECT_IDS.BLEEDING, {
  remainingTurns: BLEEDING_DURATION_TURNS,
  stacks: 99,
  source: "test"
});
assert.equal(lifecycleTarget.statusEffects.bleeding.stacks, 1);
tickStatusEffects(lifecycleTarget);
tickStatusEffects(lifecycleTarget);
assert.equal(getStatusEffectRemainingTurns(lifecycleTarget, STATUS_EFFECT_IDS.BLEEDING), 1);
tickStatusEffects(lifecycleTarget);
assert.equal(hasStatusEffect(lifecycleTarget, STATUS_EFFECT_IDS.BLEEDING), false);
removeStatusEffect(lifecycleTarget, STATUS_EFFECT_IDS.BLEEDING);

console.log("bleeding deterministic pipeline: PASS");
