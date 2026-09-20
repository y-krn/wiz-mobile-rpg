import assert from "node:assert/strict";

import {
  getEligibleBossOpeningItemKey,
  getSimulationRandomState,
  resetSimulationRandom,
  selectCombatAction
} from "../../../scratch/simulations/sim_depth_material_ev.js";
import { ITEM_EFFECTS } from "../../../src/systems/item_effects.js";

function makeState({
  roundNumber = 1,
  inventory = [],
  encounter = "boss",
  hp = 18,
  enemyHp = 100,
  fleePolicy = "ev",
  initialLivingMonsterCount = 1
} = {}) {
  const isBoss = encounter === "boss";
  const isMidboss = encounter === "midboss";
  return {
    party: [{
      name: "test",
      hp,
      maxHp: 20,
      mp: 0,
      maxMp: 0,
      status: "ok",
      equipment: { weapon: "DAGGER" },
      spells: []
    }],
    inventory: [...inventory],
    floor: 5,
    simPolicy: {
      fleePolicy,
      fleeHpThreshold: 0.20,
      healPotionThreshold: 0.35,
      healPriorityPolicy: "potion-first",
      statusCurePolicy: "smart",
      statusCureHpThreshold: 0.35,
      bloodWandHpPaymentMinRate: 0.20,
      bloodWandHealPolicy: "allow-recovery-potion",
      b5GuardianFleeDisabled: false
    },
    combatState: {
      roundNumber,
      isBoss,
      isMidboss,
      initialLivingMonsterCount,
      monsters: [
        { hp: enemyHp, atk: 5, def: 0, status: "ok", isBoss, isMidboss },
        ...(initialLivingMonsterCount >= 2
          ? [{ hp: 100, atk: 5, def: 0, status: "ok", isBoss: false, isMidboss: false }]
          : [])
      ]
    }
  };
}

const roundOpenings = [
  [1, "GUARD_POTION"],
  [2, "STR_POTION"],
  [3, "HASTE_POTION"]
];

for (const [roundNumber, itemKey] of roundOpenings) {
  const state = makeState({ roundNumber, inventory: [itemKey] });
  assert.equal(getEligibleBossOpeningItemKey(state), itemKey);
  assert.deepEqual(selectCombatAction(state), {
    type: "item",
    actorIdx: 0,
    targetIdx: 0,
    itemKey
  });
}

const guardState = makeState({ inventory: ["GUARD_POTION"] });
resetSimulationRandom(1399);
const randomBefore = getSimulationRandomState();
const guardAction = selectCombatAction(guardState);
assert.equal(getSimulationRandomState(), randomBefore);
assert.equal(guardAction.itemKey, "GUARD_POTION");
ITEM_EFFECTS.GUARD_POTION({ char: guardState.party[0] });
assert.deepEqual(guardState.party[0].buffs, [{ type: "physGuard", value: 40, turns: 99 }]);
guardState.inventory = ["STR_POTION"];
guardState.combatState.roundNumber = 2;
assert.equal(selectCombatAction(guardState).itemKey, "STR_POTION");
assert.deepEqual(selectCombatAction(guardState), selectCombatAction(guardState));

assert.equal(
  selectCombatAction(makeState({ inventory: ["GUARD_POTION"], hp: 3 })).type,
  "run",
  "low-HP recovery-insufficient flee must remain immediate"
);
assert.equal(
  selectCombatAction(makeState({ roundNumber: 4, inventory: ["HEAL_POTION"], hp: 5, enemyHp: 15 })).itemKey,
  "HEAL_POTION",
  "recover decision must remain recovery"
);
assert.equal(
  selectCombatAction(makeState({ inventory: ["STR_POTION"] })).type,
  "run",
  "missing current-round opening item must keep survival-deficit flee"
);
assert.equal(
  selectCombatAction(makeState({ inventory: ["GUARD_POTION"], encounter: "normal" })).type,
  "run",
  "non-boss EV behavior must remain flee"
);
assert.equal(
  selectCombatAction(makeState({
    inventory: ["GUARD_POTION"],
    fleePolicy: "visible-multi-enemy-flee",
    initialLivingMonsterCount: 2
  })).type,
  "run",
  "visible-multi-enemy-flee policy must remain unchanged"
);
assert.equal(
  getEligibleBossOpeningItemKey(makeState({ inventory: ["GUARD_POTION"], encounter: "midboss" })),
  "GUARD_POTION",
  "midboss opening must use the generic boss opening policy"
);

console.log("[PASS] EV survival-deficit preserves existing boss openings and invariants");
