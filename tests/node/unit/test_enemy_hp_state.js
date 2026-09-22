import assert from "node:assert/strict";
import { getEnemyHpState as getEnemyHpStateFacade } from "../../../src/rules/enemy_hp_state.js";
import { getEnemyHpState as getEnemyHpStateOwner } from "../../../src/rules/enemy_hp_state.ts";

assert.equal(getEnemyHpStateFacade, getEnemyHpStateOwner, "the JS facade preserves owner function identity");
assert.equal(getEnemyHpStateFacade(), "状態不明");
assert.equal(getEnemyHpStateFacade({}), "状態不明");
assert.equal(getEnemyHpStateFacade({ hp: 10 }), "状態不明");
assert.equal(getEnemyHpStateFacade({ maxHp: 10 }), "状態不明");

assert.equal(getEnemyHpStateFacade({ name: "重傷ではない名前", hp: 10, maxHp: 10 }), "健在");
assert.equal(getEnemyHpStateFacade({ name: "健在ではない名前", hp: 7.5, maxHp: 10 }), "健在");
assert.equal(getEnemyHpStateFacade({ hp: 7.499, maxHp: 10 }), "負傷");
assert.equal(getEnemyHpStateFacade({ hp: 4, maxHp: 10 }), "負傷");
assert.equal(getEnemyHpStateFacade({ hp: 3.5, maxHp: 10 }), "負傷");
assert.equal(getEnemyHpStateFacade({ hp: 3.499, maxHp: 10 }), "重傷");
assert.equal(getEnemyHpStateFacade({ name: "健在ではない名前", hp: 3, maxHp: 10 }), "重傷");
assert.equal(getEnemyHpStateFacade({ hp: -1, maxHp: 10 }), "重傷");
assert.equal(getEnemyHpStateFacade({ hp: 11, maxHp: 10 }), "健在");

for (const hp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "nope", undefined]) {
  assert.equal(getEnemyHpStateFacade({ hp, maxHp: 10 }), "状態不明");
}
for (const maxHp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "nope", undefined]) {
  assert.equal(getEnemyHpStateFacade({ hp: 5, maxHp }), "状態不明");
}
for (const maxHp of [0, -1, "0", ""]) {
  assert.equal(getEnemyHpStateFacade({ hp: 5, maxHp }), "状態不明");
}

assert.equal(getEnemyHpStateFacade({ hp: "7.5", maxHp: "10" }), "健在");
assert.equal(getEnemyHpStateFacade({ hp: false, maxHp: true }), "重傷");
assert.equal(getEnemyHpStateFacade({ hp: null, maxHp: 10 }), "重傷");
assert.equal(getEnemyHpStateFacade({ hp: "", maxHp: 10 }), "重傷");
assert.equal(getEnemyHpStateFacade({ hp: "  ", maxHp: 10 }), "重傷");
assert.throws(() => getEnemyHpStateFacade(null), TypeError, "null monster container keeps existing property access behavior");

console.log("enemy HP state is derived from HP ratio, not enemy name");
