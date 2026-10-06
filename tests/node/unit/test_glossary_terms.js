import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SPELLS, getSpellLabel } from "../../../src/data/spells.js";
import { RUNES } from "../../../src/data/magic.js";
import { stripLogMarkers } from "../../../src/combat_log_semantics.js";
import { getStatusLabel } from "../../../src/ui/status_label.js";

// Player-facing terms (#2046, .agents/glossary.md).

// --- Spell and Rune names ---------------------------------------------------

const labels = Object.entries(SPELLS).map(([key, spell]) => {
  assert.equal(spell.name, key, `${key}: name stays the internal key`);
  assert.equal(typeof spell.label, "string", `${key}: has a label`);
  assert.doesNotMatch(spell.label, /[A-Za-z]/, `${key}: the label is Japanese`);
  assert.doesNotMatch(spell.desc.replace(/HP|MP/g, ""), /[A-Za-z]/, `${key}: the description is Japanese`);
  assert.equal(getSpellLabel(key), spell.label);
  assert.equal(RUNES[`RUNE_${key}`].name, `${spell.label}のルーン`);
  return spell.label;
});
assert.equal(new Set(labels).size, labels.length, "spell labels are unique");
assert.equal(getSpellLabel("UNKNOWN_SPELL"), "UNKNOWN_SPELL");
// 魔除け already names the 守勢 family effect.
assert.equal(SPELLS.MASFEAL.label, "魔物よけ");
console.log("[PASS] every spell and Rune shows a Japanese name");

// --- Log line markers -------------------------------------------------------

assert.equal(stripLogMarkers("[味方] [!] 冒険者は毒に侵された。"), "冒険者は毒に侵された。");
assert.equal(stripLogMarkers("[ 敵 ] ゴブリンの攻撃！"), "ゴブリンの攻撃！");
assert.equal(stripLogMarkers("[敵] 装甲が砕けた！"), "装甲が砕けた！");
assert.equal(stripLogMarkers("[★] レベルアップ！"), "レベルアップ！");
assert.equal(stripLogMarkers("[警告] 竜が息を吸い込んだ！"), "【予兆】竜が息を吸い込んだ！");
assert.equal(stripLogMarkers("[味方] 【🗡️急所攻撃！】冒険者の必殺の一撃！"), "冒険者の必殺の一撃！");
for (const kept of ["【気配】北に何かいる。", "【痕跡】隣の床に罠がある。", "【予兆】地鳴りがする。"]) {
  assert.equal(stripLogMarkers(kept), kept);
}
assert.equal(stripLogMarkers("[浄化の環] 冒険者は5回復した！"), "浄化の環：冒険者は5回復した！");
// Only the head of the line is a marker.
assert.equal(stripLogMarkers("罠「警報」に気づいた。[!]"), "罠「警報」に気づいた。[!]");
assert.equal(stripLogMarkers(null), "");
console.log("[PASS] internal markers stop before the player's log; three tags remain");

// --- Condition labels -------------------------------------------------------

assert.deepEqual(
  ["ok", "dead", "poisoned", "paralyzed", "blind", "sleep", "silence"].map(getStatusLabel),
  ["", "死亡", "毒", "麻痺", "盲目", "眠り", "沈黙"]
);
assert.equal(getStatusLabel("POISONED"), "毒");
console.log("[PASS] conditions are named in Japanese");

// --- Words that left the game ----------------------------------------------

const root = fileURLToPath(new URL("../../../", import.meta.url));
function listSources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.(js|ts|tsx)$/.test(name) ? [path] : [];
  });
}
// 最大戦利品記録 is a stored record key; the screen shows it as 拾った戦果.
const RETIRED = /潜行|遠征|戦利品(?!記録)|リルガミン|LLYLGAMYN|ディオス薬|踏破回復|ハリト|マダルト|ティルトウェイト|カティノ|ディオス|モンティノ|ディアルマ|ラツモフィス|デュマピック|マスペアル|ミルワ/;
const offenders = [...listSources(join(root, "src")), join(root, "index.html")].flatMap(path => (
  readFileSync(path, "utf8").split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && RETIRED.test(line))
    .map(({ line, index }) => `${relative(root, path)}:${index + 1}: ${line.trim().slice(0, 80)}`)
));
assert.deepEqual(offenders, [], "retired words must not come back (.agents/glossary.md)");
console.log("[PASS] retired words are gone from the source");
