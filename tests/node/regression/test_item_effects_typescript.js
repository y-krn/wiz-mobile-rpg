import assert from "node:assert/strict";
import * as itemEffectsFacade from "../../../src/systems/item_effects.js";
import * as itemEffectsOwner from "../../../src/systems/item_effects.ts";

const ITEM_KEYS = [
  "NOISE_BALL",
  "SILENCE_INCENSE",
  "TRAP_SENSE_STONE",
  "HEAL_POTION",
  "GREATER_HEAL",
  "ANTIDOTE",
  "EYE_DROPS",
  "PARALYZE_CURE",
  "WAKE_POWDER",
  "MANA_POTION",
  "ETHER",
  "HOLY_WATER",
  "TOWN_PORTAL",
  "PANACEA",
  "ELIXIR",
  "STR_POTION",
  "GUARD_POTION",
  "HASTE_POTION"
];

assert.strictEqual(itemEffectsFacade.ITEM_EFFECTS, itemEffectsOwner.ITEM_EFFECTS);
assert.deepEqual(Object.keys(itemEffectsFacade.ITEM_EFFECTS), ITEM_KEYS);
assert.equal(Object.isFrozen(itemEffectsFacade.ITEM_EFFECTS), false);
for (const key of ITEM_KEYS) {
  assert.strictEqual(itemEffectsFacade.ITEM_EFFECTS[key], itemEffectsOwner.ITEM_EFFECTS[key]);
  assert.equal(typeof itemEffectsFacade.ITEM_EFFECTS[key], "function");
}

const originalNoiseBall = itemEffectsFacade.ITEM_EFFECTS.NOISE_BALL;
const replacementNoiseBall = () => "replacement";
itemEffectsFacade.ITEM_EFFECTS.NOISE_BALL = replacementNoiseBall;
assert.strictEqual(itemEffectsOwner.ITEM_EFFECTS.NOISE_BALL, replacementNoiseBall);
itemEffectsFacade.ITEM_EFFECTS.NOISE_BALL = originalNoiseBall;

assert.equal(itemEffectsFacade.ITEM_EFFECTS.NOISE_BALL(), "鳴らし玉が甲高い音を響かせた。");
assert.equal(itemEffectsFacade.ITEM_EFFECTS.SILENCE_INCENSE(), "静寂の香を焚いた。迷宮の気配が遠のく。");
assert.equal(itemEffectsFacade.ITEM_EFFECTS.TRAP_SENSE_STONE(), "探知石を掲げた。周囲の罠が淡く光る。");
assert.equal(itemEffectsFacade.ITEM_EFFECTS.TOWN_PORTAL({ char: { name: "帰還者" } }), "帰還者は帰還の翼を掲げた！");

const healCharacter = { name: "回復役", hp: 10, maxHp: 20 };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.HEAL_POTION({ char: healCharacter }), "回復役は傷薬を使い、HPが15回復した。");
assert.equal(healCharacter.hp, 20);

const greaterHealCharacter = { name: "上薬役", hp: 10, maxHp: 45 };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.GREATER_HEAL({ char: greaterHealCharacter }), "上薬役は上薬を使い、HPが40回復した。");
assert.equal(greaterHealCharacter.hp, 45);

const holyWaterCharacter = {
  name: "聖水役",
  hp: 10,
  maxHp: 20,
  status: "poisoned",
  equipment: {
    accessory: { baseId: "RING_STR", identified: true, curseEffectId: "curse_blood_thirst" }
  }
};
assert.equal(itemEffectsFacade.ITEM_EFFECTS.HOLY_WATER({ char: holyWaterCharacter }), "聖水役は祝福の聖水を使い、HPが15回復した。毒も綺麗に消え去った！");
assert.equal(holyWaterCharacter.hp, 20);
assert.equal(holyWaterCharacter.status, "ok");
assert.equal(holyWaterCharacter.equipment.accessory.curseEffectId, "curse_blood_thirst");

for (const [key, status, message] of [
  ["ANTIDOTE", "poisoned", "状態役は解毒薬を使い、毒が消え去った。"],
  ["EYE_DROPS", "blind", "状態役は目薬を使い、視界が戻った。"],
  ["PARALYZE_CURE", "paralyzed", "状態役は解痺薬を使い、麻痺が解けた。"],
  ["WAKE_POWDER", "sleep", "状態役は覚醒薬を使い、目を覚ました。"]
]) {
  const char = { name: "状態役", status };
  assert.equal(itemEffectsFacade.ITEM_EFFECTS[key]({ char }), message);
  assert.equal(char.status, "ok");
}

const legacyParalyze = { name: "旧麻痺", status: "paralyze" };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.PARALYZE_CURE({ char: legacyParalyze }), "旧麻痺は解痺薬を使い、麻痺が解けた。");
assert.equal(legacyParalyze.status, "ok");

const noOpStatus = { name: "無効役", status: "ok" };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.PANACEA({ char: noOpStatus }), "無効役は万能薬を使ったが、何も起こらなかった。");
assert.equal(noOpStatus.status, "ok");
const panaceaTarget = { name: "万能役", status: "blind" };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.PANACEA({ char: panaceaTarget }), "万能役は万能薬を使い、状態異常が消え去った。");
assert.equal(panaceaTarget.status, "ok");

const manaCharacter = { name: "術者", mp: 1, maxMp: 3 };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.MANA_POTION({ char: manaCharacter }), "術者は魔力草を使用し、MPが3回復した。(MP:3/3)");
assert.equal(manaCharacter.mp, 3);
const etherCharacter = { name: "雫役", mp: 1, maxMp: 5 };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.ETHER({ char: etherCharacter }), "雫役は魔力の雫を使用し、MPが8回復した。(MP:5/5)");
assert.equal(etherCharacter.mp, 5);
const nonManaCharacter = { name: "非術者", maxMp: 0 };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.MANA_POTION({ char: nonManaCharacter }), "非術者は魔力草を使用したが、魔力を持たないため何も起こらなかった。");
assert.equal(Object.hasOwn(nonManaCharacter, "mp"), false);

const elixirCharacter = { name: "全快役", hp: 1, maxHp: 20, mp: 1, maxMp: 8, status: "paralyze" };
assert.equal(itemEffectsFacade.ITEM_EFFECTS.ELIXIR({ char: elixirCharacter }), "全快役はエリクサーを飲んだ！HP・MPが全回復し、全ての状態異常が消え去った！");
assert.equal(elixirCharacter.hp, 20);
assert.equal(elixirCharacter.mp, 8);
assert.equal(elixirCharacter.status, "ok");

const buffCharacter = { name: "強化役", buffs: [] };
itemEffectsFacade.ITEM_EFFECTS.STR_POTION({ char: buffCharacter });
itemEffectsFacade.ITEM_EFFECTS.GUARD_POTION({ char: buffCharacter });
itemEffectsFacade.ITEM_EFFECTS.HASTE_POTION({ char: buffCharacter });
assert.deepEqual(buffCharacter.buffs, [
  { type: "atk", value: 15, turns: 5 },
  { type: "physGuard", value: 40, turns: 99 },
  { type: "firstStrike", value: 5, turns: 5 }
]);

console.log("[PASS] Issue #1604 TypeScript item-effects owner and facade contract");
