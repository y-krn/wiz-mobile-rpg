import assert from "node:assert/strict";

import { createStartingKitCharacter } from "../../../src/state.js";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import { GROUP_FOLLOWER_DAMAGE_SCALE } from "../../../src/combat_logic/turn_order.js";

// Ordinary groups (#2100): every enemy acts in its own turn. The first one in
// the resolved order strikes at full strength, each later one at the group
// follower share. (Before #2100 only the first one acted: the shared slot of
// #1216.)
function monster(name, traits = [], atk = 1) {
  return {
    name,
    hp: 100,
    maxHp: 100,
    atk,
    def: 1,
    traits,
    multiActionQueued: traits.includes("multiAction"),
    buffs: [],
    status: "ok",
    tags: []
  };
}

function makeState(monsters, enemyActionScheduling = "shared-normal-slot") {
  const hero = createStartingKitCharacter("vanguard");
  hero.hp = 1000;
  hero.maxHp = 1000;
  return {
    party: [hero],
    inventory: [],
    currentRun: { deathLogs: [] },
    combatState: { monsters, roundNumber: 1, phase: "choose_actions", enemyActionScheduling }
  };
}

function resolve(monsters, policy = {}) {
  const state = makeState(monsters);
  const measurement = { measurementEnemyTurnEvents: [], measurementEnemyActionDetails: true };
  const result = runCombatRoundCalculation(state, {
    actions: [{ type: "defend", actorIdx: 0 }]
  }, { rng: () => 0.99, policy, measurement });
  return { result, measurement, state };
}

// Every enemy acts, and a trait extra stays with its owner.
const group = resolve([monster("双頭の番犬", ["multiAction"]), monster("錆びた盾兵")]);
assert.deepEqual(
  group.measurement.measurementEnemyTurnEvents.map(event => event.monster),
  ["双頭の番犬", "錆びた盾兵", "双頭の番犬"],
  "both ordinary turns and the queued trait extra"
);
assert.equal(group.measurement.measurementEnemyTurnEvents.filter(event => event.extraMultiAction).length, 1);
assert.equal(group.result.logQueue.some(entry => /1体だけが仕掛けてくる/.test(entry.msg)), false);
assert.equal(group.result.state.combatState.groupFollowerScale, 1, "the follower share does not outlive the round");

// The follower strikes at the follower share of what the leader strikes.
const hits = monsters => resolve(monsters).result.logQueue
  .map(entry => /の攻撃！.+に(\d+)のダメージ/.exec(entry.msg)?.[1])
  .filter(Boolean)
  .map(Number);
const [leaderHit, followerHit] = hits([monster("錆びた盾兵", [], 30), monster("錆びた盾兵", [], 30)]);
assert.ok(leaderHit > 2, `leader hit ${leaderHit}`);
assert.equal(followerHit, Math.max(1, Math.round(leaderHit * GROUP_FOLLOWER_DAMAGE_SCALE)));

// A lone enemy strikes at full strength.
const [loneHit] = hits([monster("錆びた盾兵", [], 30)]);
assert.equal(loneHit, leaderHit);

console.log("[PASS] every enemy of an ordinary group acts; later ones strike at the follower share.");
