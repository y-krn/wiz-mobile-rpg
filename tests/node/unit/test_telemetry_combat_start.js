import assert from "node:assert/strict";
import {
  __setTelemetryClientForTests,
  __setTelemetryInitializationForTests,
  trackCombatDecisionCommit,
  trackCombatDecisionPending,
  trackCombatStart,
  trackDamageReceived,
  trackRunStart
} from "../../../src/telemetry.js";

const run = { startedAt: Date.now(), startFloor: 1 };
const forbidden = () => { throw new Error("guard evaluated combat input"); };
const guardedCombat = Object.defineProperties({}, {
  player: { get: forbidden },
  floor: { get: forbidden },
  monsters: { get: forbidden }
});

__setTelemetryInitializationForTests({ enabled: false });
assert.doesNotThrow(() => trackCombatStart(guardedCombat));
__setTelemetryInitializationForTests({ enabled: true });
assert.doesNotThrow(() => trackCombatStart(guardedCombat));

const events = [];
const order = [];
__setTelemetryClientForTests({ capture: (name, properties) => {
  order.push(`capture:${name}`);
  events.push({ name, properties });
} });
trackRunStart(run, { level: 1, maxHp: 10, maxMp: 5, equipment: {} });
const player = { hp: 7, mp: 3 };
let playerReads = 0;
const combat = {
  get player() { playerReads++; order.push(`player${playerReads}`); return player; },
  get floor() { order.push("floor"); return 2; },
  get monsters() { order.push("monsters"); return [{ name: "ゾンビ A" }]; },
  get isBoss() { order.push("isBoss"); return 0; },
  get isMidboss() { order.push("isMidboss"); return "no"; },
  get isRoamingFlack() { order.push("isRoamingFlack"); return false; }
};
const failingState = new Proxy({}, {
  get(_target, key) {
    if (key === "floor") throw new Error("context derivation failed");
    return undefined;
  }
});
trackCombatStart(combat, failingState);
assert.equal(playerReads, 3);
assert.deepEqual(order.slice(-9), [
  "player1", "floor", "player2", "player3", "monsters",
  "isBoss", "isMidboss", "isRoamingFlack", "capture:combat_start"
]);
const combatStart = events.find(event => event.name === "combat_start").properties;
assert.deepEqual(Object.keys(combatStart), [
  "schemaVersion", "runId", "combatId", "floor", "playerHp", "playerMp", "enemyIds",
  "isBoss", "isMidboss", "isRoamingFlack"
]);
assert.equal(combatStart.floor, 2);
assert.deepEqual(combatStart.enemyIds, ["ゾンビ"]);
assert.equal(Object.hasOwn(combatStart, "gameState"), false);
trackDamageReceived({ enemyId: "Goblin A", rawDamage: 2, finalDamage: 1 });
assert.equal(events.find(event => event.name === "damage_received").properties.combatId, combatStart.combatId);
assert.ok(order.indexOf("capture:combat_start") < order.indexOf("capture:damage_received"));

trackCombatDecisionPending("attack", { actorIdx: 0, targetIdx: 0, combat: { monsters: [] } });
trackCombatStart({ floor: 1, player: {}, monsters: [] });
trackCombatDecisionCommit();
assert.equal(events.filter(event => event.name === "combat_decision").length, 0);

const throwingPlayer = Object.defineProperty({}, "player", {
  get() { throw new Error("player input getter failed"); }
});
assert.throws(() => trackCombatStart(throwingPlayer), /player input getter failed/);

console.log("[PASS] JavaScript combat start facade preserves guard, context fallback, ordering, and correlation");
