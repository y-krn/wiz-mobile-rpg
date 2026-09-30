import assert from "node:assert/strict";
import { buildCombatStartPayload } from "../../../src/telemetry_combat_start.ts";
import {
  combatStartPayloadFixture,
  combatStartPayloadInputFixture
} from "../fixtures/typescript/telemetry_combat_start_input.ts";

const fixturePayload = buildCombatStartPayload(combatStartPayloadInputFixture);
assert.deepEqual(fixturePayload, combatStartPayloadFixture);
assert.deepEqual(Object.keys(fixturePayload), [
  "runId", "combatId", "contextOnly", "floor", "playerHp", "playerMp", "enemyIds",
  "isBoss", "isMidboss", "isRoamingFlack"
]);
assert.equal(fixturePayload.floor, 3);
assert.equal(fixturePayload.playerHp, 12.5);
assert.equal(fixturePayload.playerMp, 0);
assert.deepEqual(fixturePayload.enemyIds, ["Goblin"]);
assert.equal(fixturePayload.isBoss, false);
assert.equal(fixturePayload.isMidboss, true);

const order = [];
const player = {
  get hp() { order.push("hp"); return ""; },
  get mp() { order.push("mp"); return Infinity; }
};
const monsters = Array.from({ length: 8 }, (_, index) => ({
  get name() { order.push(`name${index}`); return `Enemy ${index}`; }
}));
Object.defineProperty(monsters, 8, {
  get() { order.push("ninth"); throw new Error("capped monster read"); }
});
const combat = {
  get floor() { order.push("floor"); return false; },
  get player() { order.push("playerHpOwner"); return player; },
  get monsters() { order.push("monsters"); return monsters; },
  get isBoss() { order.push("isBoss"); return 1; },
  get isMidboss() { order.push("isMidboss"); return 0; },
  get isRoamingFlack() { order.push("isRoamingFlack"); return "false"; }
};
const payload = buildCombatStartPayload({
  runId: "outer-run",
  combatId: "outer-combat",
  context: { runId: "context-run", combatId: "context-combat", floor: 900, contextOnly: true },
  combat,
  maxEnemySnapshot: 8,
  normalizeEnemyId: value => { order.push(`normalize:${value}`); return String(value); }
});
assert.deepEqual(order, [
  "floor", "playerHpOwner", "hp", "playerHpOwner", "mp", "monsters",
  ...monsters.slice(0, 8).map((_, index) => [`name${index}`, `normalize:Enemy ${index}`]).flat(),
  "isBoss", "isMidboss", "isRoamingFlack"
]);
assert.deepEqual(Object.keys(payload), [
  "runId", "combatId", "floor", "contextOnly", "playerHp", "playerMp", "enemyIds",
  "isBoss", "isMidboss", "isRoamingFlack"
]);
assert.equal(payload.runId, "context-run");
assert.equal(payload.combatId, "context-combat");
assert.equal(payload.floor, 0);
assert.equal(payload.playerHp, 0);
assert.equal(payload.playerMp, null);
assert.equal(payload.isBoss, true);
assert.equal(payload.isMidboss, false);
assert.equal(payload.isRoamingFlack, true);

let sparseMapCalls = 0;
assert.deepEqual(buildCombatStartPayload({
  runId: "run", combatId: "combat", context: {}, combat: { monsters: null },
  maxEnemySnapshot: 8, normalizeEnemyId: () => { sparseMapCalls++; return "other"; }
}).enemyIds, []);
const sparseMonsters = Array(2);
sparseMonsters[1] = { name: "Goblin" };
const sparseExpected = Array(2);
sparseExpected[1] = "Goblin";
assert.deepEqual(buildCombatStartPayload({
  runId: "run", combatId: "combat", context: {}, combat: { monsters: sparseMonsters },
  maxEnemySnapshot: 8, normalizeEnemyId: () => { sparseMapCalls++; return "Goblin"; }
}).enemyIds, sparseExpected);
assert.equal(sparseMapCalls, 1);

for (const [input, expected] of [[null, 0], [undefined, null], ["bad", null], [-4, 0], [3.25, 3.25], [Infinity, null], [false, 0], ["", 0]]) {
  assert.equal(buildCombatStartPayload({
    runId: "run", combatId: "combat", context: {}, combat: { floor: input },
    maxEnemySnapshot: 8, normalizeEnemyId: () => "other"
  }).floor, expected);
}

console.log("[PASS] TypeScript combat start owner preserves payload, getter, and normalization semantics");
