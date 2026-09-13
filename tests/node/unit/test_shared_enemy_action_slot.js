import assert from "node:assert/strict";

import { createStartingKitCharacter } from "../../../src/state.js";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";

function monster(name, traits = []) {
  return {
    name,
    hp: 100,
    maxHp: 100,
    atk: 1,
    def: 1,
    traits,
    multiActionQueued: traits.includes("multiAction"),
    buffs: [],
    status: "ok",
    tags: []
  };
}

function makeState(enemyActionScheduling = undefined) {
  return {
    party: [createStartingKitCharacter("vanguard")],
    inventory: [],
    currentRun: { deathLogs: [] },
    combatState: {
      monsters: [
        monster("双頭の番犬", ["multiAction"]),
        monster("錆びた盾兵")
      ],
      roundNumber: 1,
      phase: "choose_actions",
      ...(enemyActionScheduling ? { enemyActionScheduling } : {})
    },
  };
}

function resolve(policy = {}, enemyActionScheduling = undefined) {
  const state = makeState(enemyActionScheduling);
  const measurement = { measurementEnemyTurnEvents: [], measurementEnemyActionDetails: true };
  const result = runCombatRoundCalculation(state, {
    actions: [{ type: "defend", actorIdx: 0 }]
  }, { rng: () => 0.99, policy, measurement });
  return { result, measurement };
}

const baseline = resolve();
assert.equal(baseline.measurement.measurementEnemyTurnEvents.length, 3, "baseline keeps both ordinary turns and the queued trait extra");
assert.deepEqual(
  baseline.measurement.measurementEnemyTurnEvents.map(event => event.monster),
  ["双頭の番犬", "錆びた盾兵", "双頭の番犬"]
);
assert.equal(baseline.result.logQueue.some(entry => entry.msg.includes("連携して通常行動")), false);

const candidate = resolve({ measurementSharedNormalEnemyActionSlot: true });
assert.equal(candidate.measurement.measurementEnemyTurnEvents.length, 2, "shared slot keeps the selected ordinary turn and its trait extra");
assert.deepEqual(candidate.measurement.measurementEnemyTurnEvents.map(event => event.monster), ["双頭の番犬", "双頭の番犬"]);
assert.equal(candidate.measurement.measurementEnemyTurnEvents.filter(event => event.extraMultiAction).length, 1);
assert.ok(candidate.measurement.measurementEnemyTurnEvents.every(event => event.sharedNormalSlot === true));
assert.equal(candidate.result.logQueue.filter(entry => entry.msg.includes("連携して通常行動")).length, 1);

const production = resolve({}, "shared-normal-slot");
assert.deepEqual(
  production.measurement.measurementEnemyTurnEvents,
  candidate.measurement.measurementEnemyTurnEvents,
  "production scheduling uses the same exact shared-slot semantics"
);

console.log("[PASS] shared ordinary enemy action slot preserves initiative owner and attached trait extra.");
