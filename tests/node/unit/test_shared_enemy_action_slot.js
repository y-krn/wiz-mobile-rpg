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

function makeState(simPolicy = {}, enemyActionScheduling = undefined) {
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
    simPolicy,
    simTelemetry: {
      measurementEnemyTurnEvents: [],
      measurementEnemyActionDetails: true
    }
  };
}

function resolve(simPolicy, enemyActionScheduling = undefined) {
  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const state = makeState(simPolicy, enemyActionScheduling);
    const result = runCombatRoundCalculation(state, {
      actions: [{ type: "defend", actorIdx: 0 }]
    });
    return result;
  } finally {
    Math.random = previousRandom;
  }
}

const baseline = resolve({});
assert.equal(baseline.state.simTelemetry.measurementEnemyTurnEvents.length, 3, "baseline keeps both ordinary turns and the queued trait extra");
assert.deepEqual(
  baseline.state.simTelemetry.measurementEnemyTurnEvents.map(event => event.monster),
  ["双頭の番犬", "錆びた盾兵", "双頭の番犬"]
);
assert.equal(baseline.logQueue.some(entry => entry.msg.includes("連携して通常行動")), false);

const candidate = resolve({ measurementSharedNormalEnemyActionSlot: true });
assert.equal(candidate.state.simTelemetry.measurementEnemyTurnEvents.length, 2, "shared slot keeps the selected ordinary turn and its trait extra");
assert.deepEqual(candidate.state.simTelemetry.measurementEnemyTurnEvents.map(event => event.monster), ["双頭の番犬", "双頭の番犬"]);
assert.equal(candidate.state.simTelemetry.measurementEnemyTurnEvents.filter(event => event.extraMultiAction).length, 1);
assert.ok(candidate.state.simTelemetry.measurementEnemyTurnEvents.every(event => event.sharedNormalSlot === true));
assert.equal(candidate.logQueue.filter(entry => entry.msg.includes("連携して通常行動")).length, 1);

const production = resolve({}, "shared-normal-slot");
assert.deepEqual(
  production.state.simTelemetry.measurementEnemyTurnEvents,
  candidate.state.simTelemetry.measurementEnemyTurnEvents,
  "production scheduling uses the same exact shared-slot semantics"
);

console.log("[PASS] shared ordinary enemy action slot preserves initiative owner and attached trait extra.");
