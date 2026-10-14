// A fled pack follows (#2114): the monsters left standing keep their wounds,
// catch up after PURSUIT_TURNS turns on the same floor, and are shaken off by
// leaving the floor.
import { strict as assert } from "node:assert";
import {
  PURSUIT_TURNS, getPursuit, isPursuitDue, recordFleePursuit, shakeOffPursuit, takePursuitMonsters, tickPursuit
} from "../../../src/systems/pursuit.js";

const state = { floor: 3, currentRun: {} };
const monsters = [{ name: "A", hp: 4, maxHp: 10 }, { name: "B", hp: 0, maxHp: 8 }, { name: "C", hp: 6, maxHp: 6, fled: true }];
const pursuit = recordFleePursuit(state, monsters);
assert.deepEqual(pursuit.monsters.map(monster => [monster.name, monster.hp]), [["A", 4]], "only those still standing follow, wounds kept");
assert.notEqual(pursuit.monsters[0], monsters[0], "the pack is a copy");

for (let turn = 1; turn < PURSUIT_TURNS; turn++) assert.equal(tickPursuit(state), false);
assert.equal(isPursuitDue(state), false);
assert.equal(tickPursuit(state), true);
assert.equal(isPursuitDue(state), true);
assert.deepEqual(takePursuitMonsters(state).monsters.map(monster => monster.name), ["A"]);
assert.equal(getPursuit(state), null, "taken once");

// The stairs shake it off.
recordFleePursuit(state, monsters);
state.floor = 4;
assert.equal(getPursuit(state), null);
assert.equal(tickPursuit(state), false);
assert.equal(shakeOffPursuit(state), true);
assert.equal(state.currentRun.pursuit, null);

// Nothing standing, nothing follows.
assert.equal(recordFleePursuit({ floor: 1, currentRun: {} }, [{ hp: 0 }]), null);

console.log("[PASS] a fled pack follows on its floor and is shaken off by the stairs");
