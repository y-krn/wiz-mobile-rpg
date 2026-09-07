import assert from "node:assert/strict";
import {
  COMBAT_LOG_DELAYS,
  formatCombatLogMessage,
  getCombatLogDelay,
  groupCombatLogEntries,
  isImportantCombatResult
} from "../../../src/combat_ui/combat_log_presentation.js";

assert.equal(getCombatLogDelay({ msg: "ゴブリンに8のダメージ。" }), COMBAT_LOG_DELAYS.normal);
assert.equal(getCombatLogDelay({ msg: "弱点を突いた。12ダメージ。" }), COMBAT_LOG_DELAYS.important);
assert.equal(getCombatLogDelay({ endCombat: true, msg: "周囲に静寂が戻った。" }), COMBAT_LOG_DELAYS.transition);
assert.equal(getCombatLogDelay({ triggerChest: true, msg: "宝箱が現れた。" }), COMBAT_LOG_DELAYS.chest);
assert.equal(getCombatLogDelay({ milestoneVictory: 2, msg: "階層守護者を撃破した。" }), COMBAT_LOG_DELAYS.milestone);

assert.equal(getCombatLogDelay({ msg: "通常結果" }, { isAuto: true }), 50);
assert.equal(getCombatLogDelay({ milestoneVictory: 2 }, { isAuto: true }), 300);
assert.equal(isImportantCombatResult("反射され、ダメージを与えられなかった。"), true);
assert.equal(isImportantCombatResult("ゴブリンを倒した！"), true);
assert.equal(isImportantCombatResult("毒が消え去った！"), true);
assert.equal(isImportantCombatResult("敵は沈黙した。"), true);
assert.equal(isImportantCombatResult("ゴブリンに8ダメージ。"), false);
assert.equal(
  formatCombatLogMessage("[味方] 冒険者の攻撃！ゴブリンに8のダメージ。"),
  "ゴブリンを斬りつけた。8ダメージ。"
);
assert.equal(
  formatCombatLogMessage("[ 敵 ] ゴブリンの攻撃！冒険者に5のダメージ！"),
  "ゴブリンの一撃を受けた。5ダメージ。"
);

const grouped = groupCombatLogEntries([
  { msg: "[味方] 冒険者の攻撃！ゴブリンに8のダメージ。", groupId: "action:1" },
  { msg: "[味方] [!] ゴブリンを倒した！", groupId: "action:1" },
  { msg: "次の行動。", groupId: "action:2" }
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].msg, "ゴブリンを斬りつけた。8ダメージ。 ゴブリンを倒した！");

console.log("[PASS] combat log presentation pacing, wording, and grouping");
