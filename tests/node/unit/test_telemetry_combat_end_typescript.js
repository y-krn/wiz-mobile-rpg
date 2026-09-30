import assert from "node:assert/strict";
import { buildCombatEndPayload } from "../../../src/telemetry_combat_end.ts";

const reads = [];
const players = [{ hp: 7, mp: 8 }, { hp: 9, mp: 10 }];
const monsters = [];
monsters.length = 3;
Object.defineProperty(monsters, 1, {
  get() {
    reads.push("monster:1");
    return { hp: "0", fled: 0 };
  }
});
Object.defineProperty(monsters, 2, {
  get() {
    reads.push("monster:2");
    return { hp: -1, get fled() { throw new Error("hp false must skip fled"); } };
  }
});

const combat = {
  get floor() { reads.push("floor"); return "2.5"; },
  get turns() { reads.push("turns"); return Number.MAX_VALUE; },
  get player() { reads.push("player"); return players.shift(); },
  get monsters() { reads.push("monsters"); return monsters; }
};
const payload = buildCombatEndPayload({
  runId: "run",
  combatId: "combat",
  context: {
    combatId: "context-combat",
    marker: true,
    floor: 999,
    result: "context-result",
    turns: 999,
    playerHp: 999,
    playerMp: 999,
    enemiesDefeated: 999
  },
  combat,
  result: "victory",
  maxEnemySnapshot: 2
});

assert.deepEqual(Object.keys(payload), [
  "runId", "combatId", "marker", "floor", "result", "turns", "playerHp", "playerMp", "enemiesDefeated"
]);
assert.equal(payload.combatId, "context-combat");
assert.equal(payload.floor, 2.5);
assert.equal(payload.result, "victory");
assert.equal(payload.turns, 1_000_000);
assert.equal(payload.playerHp, 7);
assert.equal(payload.playerMp, 10);
assert.equal(payload.enemiesDefeated, 1);
assert.deepEqual(reads, ["floor", "turns", "player", "player", "monsters", "monster:1"]);

const shortCircuitReads = [];
const shortCircuit = buildCombatEndPayload({
  runId: "run",
  combatId: "combat",
  context: {},
  combat: {
    monsters: [{ hp: 1, get fled() { shortCircuitReads.push("fled"); return false; } }, { hp: 0, fled: true }]
  },
  result: "other",
  maxEnemySnapshot: 8
});
assert.equal(shortCircuit.enemiesDefeated, 0);
assert.deepEqual(shortCircuitReads, []);

console.log("[PASS] TypeScript combat_end payload preserves property order and JavaScript read semantics");
