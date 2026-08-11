import assert from "node:assert/strict";
import { getCharAffixSum } from "../src/data.js";
import { applyKillAffixEffects, getMeleeModifiers } from "../src/combat_logic/damage.js";
import { getMpWardDef } from "../src/combat_logic/round.js";
import { getClassPassiveBonus } from "../src/rules/class_rules.js";
import { applyTrapGuardToEffect } from "../src/rules/trap_effect_rules.js";
import { SOLO_CLASSES, createSoloCharacter } from "../src/state.js";

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

test("僧侶はメイスとソロ用耐久・MPを持つ", () => {
  const priest = createSoloCharacter("Priest");
  assert.equal(priest.equipment.weapon, "MACE");
  assert.equal(priest.maxHp, 14);
  // #267: 火力窓の延長でMP +6（7→13）
  assert.equal(priest.maxMp, 13);
});

test("全職の近接倍率は等倍", () => {
  for (const className of SOLO_CLASSES) {
    assert.equal(getMeleeModifiers({ class: className }), 1, className);
  }
});

test("魔術師はソロ用耐久・MPを持つ", () => {
  const mage = createSoloCharacter("Mage");
  assert.equal(mage.maxHp, 19);
  // #267: 火力窓の延長でMP +6（6→12）
  assert.equal(mage.maxMp, 12);
});

test("僧侶と魔術師は敵撃破時にMPを1回復する", () => {
  for (const className of ["Priest", "Mage"]) {
    const character = createSoloCharacter(className);
    character.mp = 0;
    const target = { name: "かみつき蟲", tags: [] };
    const logs = [];

    applyKillAffixEffects(character, target, {}, logs);

    assert.equal(character.mp, 1, className);
    assert.match(logs[0].msg, /MPが1回復/);
  }
});

test("盗賊は技巧を35%回避へ転用する", () => {
  const thief = createSoloCharacter("Thief");
  assert.equal(getCharAffixSum(thief, "evasion"), 35);
});

test("戦士と魔術師は罠被害を職業passiveで軽減する", () => {
  assert.equal(getCharAffixSum(createSoloCharacter("Fighter"), "trapGuard"), 40);
  assert.equal(getCharAffixSum(createSoloCharacter("Mage"), "trapGuard"), 50);
  const effect = applyTrapGuardToEffect(
    { targetDamage: 12, partyDamage: [10, 10] },
    { trapGuardByParty: [40, 50], targetIndex: 0 }
  );
  assert.deepEqual(effect, { targetDamage: 7, partyDamage: [6, 5] });
});

// #267: 後衛の火力窓とMP連動障壁
test("僧侶と魔術師は攻撃呪文2hitごとにMPを1回復する", () => {
  for (const className of ["Priest", "Mage"]) {
    const character = createSoloCharacter(className);
    assert.equal(getClassPassiveBonus(character, "spellCycleMp"), 2, className);
  }
});

test("前衛は呪文サイクル回復とMP連動防御を持たない", () => {
  for (const className of ["Fighter", "Thief"]) {
    const character = createSoloCharacter(className);
    assert.equal(getClassPassiveBonus(character, "spellCycleMp"), 0, className);
    assert.equal(getClassPassiveBonus(character, "mpWard"), 0, className);
  }
});

test("後衛のMP連動防御はMP枯渇で消える", () => {
  for (const className of ["Priest", "Mage"]) {
    const character = createSoloCharacter(className);
    assert.equal(getClassPassiveBonus(character, "mpWard"), 4, className);

    // 攻撃呪文の最小コストが1なので MP>=1 が発動条件
    character.mp = 1;
    assert.equal(getMpWardDef(character), 4, `${className} MP1`);
    character.mp = 0;
    assert.equal(getMpWardDef(character), 0, `${className} MP0`);
  }
});

if (failures > 0) {
  console.error(`${failures}件のテスト失敗`);
  process.exit(1);
}

console.log("[PASS] 基本4職ソロエンジン");
