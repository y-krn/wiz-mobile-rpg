import assert from "assert";
import { getItemData, getCharAffixSum } from "../src/rules/item_rules.js";
import { getCharMaxHp, getCharMaxMp, getCharWeaponAtk, getCharDef } from "../src/rules/character_stats.js";
import { SPELL_EFFECTS } from "../src/systems/spell_effects.js";
import { runCombatRoundCalculation } from "../src/combat_logic/round.js";

console.log("=== TICKET-048 CURSE MOD TEST ===");

// 共通のベースキャラクター
const baseChar = {
  name: "Hero",
  class: "Thief",
  level: 5,
  hp: 40,
  maxHp: 40,
  mp: 10,
  maxMp: 10,
  str: 12,
  int: 10,
  pie: 10,
  vit: 10,
  agi: 10,
  luk: 10,
  status: "ok",
  equipment: {
    weapon: null,
    shield: null,
    armor: null,
    accessory: null
  }
};

// 1. 渇血の呪い (curse_blood_thirst: mod: { atk: 15, devotion: -20 })
console.log("--- 1. Blood Thirst Curse Test ---");
const unidentBloodThirst = {
  key: "test_blood_thirst_unident",
  baseId: "AMULET_HP",
  identified: false,
  curseEffectId: "curse_blood_thirst"
};
const identBloodThirst = {
  key: "test_blood_thirst_ident",
  baseId: "AMULET_HP",
  identified: true,
  curseEffectId: "curse_blood_thirst"
};

// 未鑑定: devotion -20 は getCharAffixSum で拾うが、atk は加算されない。
const data1_unident = getItemData(unidentBloodThirst);
assert.strictEqual(data1_unident.atk, 0, "Unidentified Blood Thirst atk must be 0");
const charUnident1 = JSON.parse(JSON.stringify(baseChar));
charUnident1.equipment.accessory = unidentBloodThirst;
assert.strictEqual(getCharWeaponAtk(charUnident1), 0, "Unidentified Blood Thirst character weapon atk must be 0");
assert.strictEqual(getCharAffixSum(charUnident1, "devotion"), -20, "Unidentified devotion penalty must apply");

// 鑑定済: devotion -20 及び atk +15 の両方が適用される。
const data1_ident = getItemData(identBloodThirst);
assert.strictEqual(data1_ident.atk, 15, "Identified Blood Thirst atk must be 15");
const charIdent1 = JSON.parse(JSON.stringify(baseChar));
charIdent1.equipment.accessory = identBloodThirst;
assert.strictEqual(getCharWeaponAtk(charIdent1), 15, "Identified Blood Thirst character weapon atk must be 15");
assert.strictEqual(getCharAffixSum(charIdent1, "devotion"), -20, "Identified devotion penalty must apply");


// 2. 臆病の呪い (curse_cowardly_shield: mod: { def: 10, guardian: -15 })
console.log("--- 2. Cowardly Shield Curse Test ---");
const unidentCowardly = {
  key: "test_cowardly_unident",
  baseId: "RING_STR",
  identified: false,
  curseEffectId: "curse_cowardly_shield"
};
const identCowardly = {
  key: "test_cowardly_ident",
  baseId: "RING_STR",
  identified: true,
  curseEffectId: "curse_cowardly_shield"
};

// 未鑑定: guardian -15 は適用、def は 0。
const data2_unident = getItemData(unidentCowardly);
assert.strictEqual(data2_unident.def, 0, "Unidentified Cowardly def must be 0");
const charUnident2 = JSON.parse(JSON.stringify(baseChar));
charUnident2.equipment.accessory = unidentCowardly;
assert.strictEqual(getCharDef(charUnident2), 0, "Unidentified Cowardly character def must be 0");
assert.strictEqual(getCharAffixSum(charUnident2, "guardian"), -15, "Unidentified guardian penalty must apply");

// 鑑定済: guardian -15 と def +10 が適用。
const data2_ident = getItemData(identCowardly);
assert.strictEqual(data2_ident.def, 10, "Identified Cowardly def must be 10");
const charIdent2 = JSON.parse(JSON.stringify(baseChar));
charIdent2.equipment.accessory = identCowardly;
assert.strictEqual(getCharDef(charIdent2), 10, "Identified Cowardly character def must be 10");
assert.strictEqual(getCharAffixSum(charIdent2, "guardian"), -15, "Identified guardian penalty must apply");


// 3. 霊蝕の呪い (curse_spectral_decay: mod: { mp: 3, hp: -15 })
console.log("--- 3. Spectral Decay Curse Test ---");
const unidentDecay = {
  key: "test_decay_unident",
  baseId: "RING_STR",
  identified: false,
  curseEffectId: "curse_spectral_decay"
};
const identDecay = {
  key: "test_decay_ident",
  baseId: "RING_STR",
  identified: true,
  curseEffectId: "curse_spectral_decay"
};

// 未鑑定: hp -15（負の補正）は適用されるが、mp +3（正の補正）は適用されない。
const data3_unident = getItemData(unidentDecay);
assert.strictEqual(data3_unident.hpBonus, -15, "Unidentified Decay hpBonus must be -15");
assert.strictEqual(data3_unident.mpBonus, 0, "Unidentified Decay mpBonus must be 0");
const charUnident3 = JSON.parse(JSON.stringify(baseChar));
charUnident3.equipment.accessory = unidentDecay;
assert.strictEqual(getCharMaxHp(charUnident3), 25, "Character maxHp must be 25 (40 - 15)");
assert.strictEqual(getCharMaxMp(charUnident3), 10, "Character maxMp must be 10 (no bonus)");

// 鑑定済: hp -15 及び mp +3 の両方が適用。
const data3_ident = getItemData(identDecay);
assert.strictEqual(data3_ident.hpBonus, -15, "Identified Decay hpBonus must be -15");
assert.strictEqual(data3_ident.mpBonus, 3, "Identified Decay mpBonus must be 3");
const charIdent3 = JSON.parse(JSON.stringify(baseChar));
charIdent3.equipment.accessory = identDecay;
assert.strictEqual(getCharMaxHp(charIdent3), 25, "Character maxHp must be 25 (40 - 15)");
assert.strictEqual(getCharMaxMp(charIdent3), 13, "Character maxMp must be 13 (10 + 3)");


// 4. 煉獄の呪い (curse_purging_flame: mod: { fireRite: 30, spellGuard: -20 }) による fireRite 反映テスト
console.log("--- 4. Purging Flame Fire Rite Test ---");
const identPurgingFlame = {
  key: "test_purging_ident",
  baseId: "AMULET_HP",
  identified: true,
  curseEffectId: "curse_purging_flame"
};
const casterWithCurse = JSON.parse(JSON.stringify(baseChar));
casterWithCurse.equipment.accessory = identPurgingFlame;

// fireRite なしのキャスターとありのキャスターで HALITO の期待値を比較
let totalDmgNoCurse = 0;
let totalDmgWithCurse = 0;
const iterations = 1000;
const rng = () => 0.5; // 固定の乱数（期待値を正確に測るため）

for (let i = 0; i < iterations; i++) {
  const resNoCurse = SPELL_EFFECTS.HALITO({ caster: baseChar, target: { name: "Slime" }, rng });
  const resWithCurse = SPELL_EFFECTS.HALITO({ caster: casterWithCurse, target: { name: "Slime" }, rng });
  totalDmgNoCurse += resNoCurse.damage;
  totalDmgWithCurse += resWithCurse.damage;
}

const avgNoCurse = totalDmgNoCurse / iterations;
const avgWithCurse = totalDmgWithCurse / iterations;
console.log(`HALITO Average DMG: No Curse = ${avgNoCurse}, With Curse = ${avgWithCurse}`);
// fireRite: 30 (30%上昇) なので 1.3 倍付近であること
assert(avgWithCurse > avgNoCurse * 1.25 && avgWithCurse < avgNoCurse * 1.35, "fireRite +30% bonus not applied correctly");


// 5. 毒脈の呪い (curse_poisonous_vein: mod: { poisonAtk: 15, poisonWard: -30 }) による戦闘中毒付与・ターン終了時毒ダメージ
console.log("--- 5. Poisonous Vein Combat Test ---");
const identPoisonousVein = {
  key: "test_poisonous_ident",
  baseId: "AMULET_HP",
  identified: true,
  curseEffectId: "curse_poisonous_vein"
};

const attacker = JSON.parse(JSON.stringify(baseChar));
attacker.equipment.accessory = identPoisonousVein;

// 戦闘のモックステートを作成
const originalState = {
  floor: 1,
  x: 1,
  y: 1,
  dir: 0,
  party: [attacker],
  inventory: [],
  combatState: {
    inCombat: true,
    monsters: [
      { name: "Slime A", hp: 100, maxHp: 100, status: "ok", type: "slime", atk: 5, def: 2 }
    ]
  }
};

const combatSelection = {
  actions: [
    { type: "fight", targetIdx: 0, actorIdx: 0 } // attacker が Slime A を攻撃
  ]
};

const originalRandom = Math.random;
try {
  // Math.random をオーバーライドして毒付与を確実にする
  Math.random = () => 0.01;
  
  const result = runCombatRoundCalculation(originalState, combatSelection);
  console.log("Combat Log Queue:", result.logQueue);
  const slime = result.state.combatState.monsters[0];
  console.log("Monster status after attack:", slime.status);
  assert.strictEqual(slime.status, "poisoned", "Monster must be poisoned");
  
  // ターン終了時にモンスターが毒ダメージを受けることを検証
  const turnEndLog = result.logQueue.find(l => l.msg.includes("毒のダメージ！"));
  assert(turnEndLog, "Log queue must contain turn-end poison damage log for monster");
  console.log("Turn-end log message:", turnEndLog.msg);
  assert(slime.hp < 100, "Monster hp must decrease due to poison");
} finally {
  Math.random = originalRandom;
}

console.log("All curse mod tests passed!");
