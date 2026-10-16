// A fled pack follows (#2114), but only its hunters, and only once (#2128):
// the pursuers left standing keep their wounds, catch up after PURSUIT_TURNS
// turns on the same floor, give up if escaped again, and are shaken off by
// leaving the floor.
import { strict as assert } from "node:assert";
import { MONSTER_PURSUERS, MONSTERS } from "../../../src/data/monsters.js";
import {
  PURSUIT_TURNS, getPursuit, isPursuer, isPursuitDue, recordFleePursuit, shakeOffPursuit, takePursuitMonsters, tickPursuit
} from "../../../src/systems/pursuit.js";

// Every pursuer is a real ordinary monster, and they are a minority.
const ordinary = MONSTERS.filter(monster => !monster.isBoss && !monster.isRare);
for (const name of MONSTER_PURSUERS) {
  assert.ok(ordinary.some(monster => monster.name === name), `${name} is an ordinary monster`);
}
const share = MONSTER_PURSUERS.size / ordinary.length;
assert.ok(share >= 0.2 && share <= 0.4, `about a third pursue (${share.toFixed(2)})`);
assert.equal(isPursuer({ name: "ワーウルフ B" }), true, "a lettered copy is the same monster");
assert.equal(isPursuer({ name: "ゾンビ" }), false);

const state = { floor: 3, currentRun: {} };
const monsters = [
  { name: "ワーウルフ A", hp: 4, maxHp: 10 },
  { name: "ゾンビ", hp: 9, maxHp: 9 },
  { name: "ワーウルフ B", hp: 0, maxHp: 8 },
  { name: "キラーラビット", hp: 6, maxHp: 6, fled: true }
];
const followers = recordFleePursuit(state, monsters);
assert.deepEqual(followers.map(monster => [monster.name, monster.hp]), [["ワーウルフ A", 4]], "only standing pursuers follow, wounds kept");
assert.notEqual(followers[0], monsters[0], "the pack is a copy");

for (let turn = 1; turn < PURSUIT_TURNS; turn++) assert.equal(tickPursuit(state), false);
assert.equal(isPursuitDue(state), false);
assert.equal(tickPursuit(state), true);
assert.equal(isPursuitDue(state), true);
const caught = takePursuitMonsters(state);
assert.deepEqual(caught.map(monster => monster.name), ["ワーウルフ A"]);
assert.equal(getPursuit(state), null, "taken once");

// Escaping the pack that caught up makes it give up.
assert.deepEqual(recordFleePursuit(state, caught, state.floor, { caughtUp: true }), []);
assert.equal(getPursuit(state), null);

// The slow and the mindless stay behind.
assert.deepEqual(recordFleePursuit(state, [{ name: "ゾンビ", hp: 9 }]), []);
assert.equal(getPursuit(state), null);

// A second pack fled from joins the one already following; it does not replace it.
recordFleePursuit(state, [{ name: "オークの戦士", hp: 5 }]);
tickPursuit(state, 2);
recordFleePursuit(state, [{ name: "ゾンビ", hp: 9 }]);
assert.deepEqual(getPursuit(state).monsters.map(monster => monster.name), ["オークの戦士"], "a pack with no pursuers leaves the follower alone");
recordFleePursuit(state, [{ name: "群れネズミ", hp: 3 }]);
assert.deepEqual(getPursuit(state).monsters.map(monster => monster.name), ["オークの戦士", "群れネズミ"]);
assert.equal(getPursuit(state).turns, PURSUIT_TURNS - 2, "the earlier pack keeps its pace");

// The stairs shake it off.
state.floor = 4;
assert.equal(getPursuit(state), null);
assert.equal(tickPursuit(state), false);
assert.equal(shakeOffPursuit(state), true);
assert.equal(state.currentRun.pursuit, null);

// Nothing standing, nothing follows.
assert.deepEqual(recordFleePursuit({ floor: 1, currentRun: {} }, [{ name: "ワーウルフ", hp: 0 }]), []);

console.log("[PASS] only hunters follow a flee, once, on their floor, and the stairs shake them off");
