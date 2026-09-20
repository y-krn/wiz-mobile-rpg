import assert from "node:assert/strict";
import { getEnemyHpState } from "../../../src/rules/enemy_hp_state.js";

assert.equal(getEnemyHpState({ name: "健在ではない名前", hp: 10, maxHp: 10 }), "健在");
assert.equal(getEnemyHpState({ name: "負傷ではない名前", hp: 4, maxHp: 10 }), "負傷");
assert.equal(getEnemyHpState({ name: "重傷ではない名前", hp: 3, maxHp: 10 }), "重傷");
assert.equal(getEnemyHpState({ name: "状態不明ではない名前", hp: 1, maxHp: 0 }), "状態不明");

console.log("enemy HP state is derived from HP ratio, not enemy name");
