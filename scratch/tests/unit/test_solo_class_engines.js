import assert from "node:assert/strict";
import { getCharAffixSum, getCharDerivedStats, getCharTrapBonus } from "../../../src/data.js";
import { applyKillAffixEffects, getMeleeModifiers } from "../../../src/combat_logic/damage.js";
import { getMpWardDef } from "../../../src/combat_logic/round.js";
import { CLASS_PASSIVES } from "../../../src/data/classes.js";
import { getClassPassiveBonus } from "../../../src/rules/class_rules.js";
import { applyTrapGuardToEffect } from "../../../src/rules/trap_effect_rules.js";
import { calculateChestDisarmChance } from "../../../src/rules/trap_rules.js";
import { checkCharLevelUp } from "../../../src/systems/leveling.js";
import { SOLO_CLASSES, createSoloCharacter } from "../../../src/state.js";

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
  assert.equal(mage.maxHp, 14);
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

test("戦士と魔術師は敵撃破時に職業固有HPを回復する", () => {
  for (const [className, expected] of [["Fighter", 2], ["Mage", 8]]) {
    const character = createSoloCharacter(className);
    character.hp = 1;
    const target = { name: "かみつき蟲", tags: [] };

    applyKillAffixEffects(character, target, {}, []);

    assert.equal(getClassPassiveBonus(character, "killHeal"), expected, className);
    assert.equal(character.hp, 1 + expected, className);
  }
  assert.equal(getClassPassiveBonus(createSoloCharacter("Thief"), "killHeal"), 0);
  assert.equal(getClassPassiveBonus(createSoloCharacter("Priest"), "killHeal"), 0);
});

test("盗賊は技巧を35%回避へ転用する", () => {
  const thief = createSoloCharacter("Thief");
  assert.equal(getCharAffixSum(thief, "evasion"), 35);
});

test("盗賊の罠パッシブは呼び出し元の罠解除率へ届く", () => {
  const thief = createSoloCharacter("Thief");
  const passive = CLASS_PASSIVES.Thief.bonuses;
  const originalTrapBonus = passive.trapBonus;

  try {
    const withPassive = getCharDerivedStats(thief, { floor: 5 }).trap;
    const chestWithPassive = calculateChestDisarmChance({
      className: thief.class,
      trapBonus: getCharTrapBonus(thief)
    });
    assert.equal(getCharAffixSum(thief, "trapBonus"), 15);

    passive.trapBonus = 0;
    const withoutPassive = getCharDerivedStats(thief, { floor: 5 }).trap;
    const chestWithoutPassive = calculateChestDisarmChance({
      className: thief.class,
      trapBonus: getCharTrapBonus(thief)
    });

    assert.equal(withPassive, 88);
    assert.equal(withoutPassive, 73);
    assert.equal(withPassive - withoutPassive, 15);
    assert.ok(Math.abs(chestWithPassive - chestWithoutPassive - 0.15) < 1e-12);
  } finally {
    passive.trapBonus = originalTrapBonus;
  }
});

test("戦士と魔術師は罠被害を職業passiveで軽減する", () => {
  assert.equal(getCharAffixSum(createSoloCharacter("Fighter"), "trapGuard"), 40);
  assert.equal(getCharAffixSum(createSoloCharacter("Mage"), "trapGuard"), 60);
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

test("legacy class fixtures share the universal level growth", () => {
  const baseHp = Object.fromEntries(SOLO_CLASSES.map(className => [
    className,
    createSoloCharacter(className).maxHp
  ]));
  assert.ok(baseHp.Fighter > baseHp.Thief);
  assert.ok(baseHp.Thief > baseHp.Priest);
  assert.ok(baseHp.Priest >= baseHp.Mage);

  const growth = className => {
    const character = createSoloCharacter(className);
    character.exp = 999999;
    const before = character.maxHp;
    assert.equal(checkCharLevelUp(character, { rng: () => 0 }), true, className);
    return character.maxHp - before;
  };
  const hpGrowth = Object.fromEntries(SOLO_CLASSES.map(className => [className, growth(className)]));
  assert.deepEqual(
    { baseHp, hpGrowth },
    {
      baseHp: { Fighter: 20, Thief: 15, Priest: 14, Mage: 14, Samurai: 18, Bishop: 11, Ranger: 16, Ninja: 15 },
      hpGrowth: { Fighter: 5, Thief: 5, Priest: 5, Mage: 5, Samurai: 5, Bishop: 5, Ranger: 5, Ninja: 5 }
    }
  );
});

test("前衛は呪文サイクル回復とMP連動防御を持たない", () => {
  for (const className of ["Fighter", "Thief"]) {
    const character = createSoloCharacter(className);
    assert.equal(getClassPassiveBonus(character, "spellCycleMp"), 0, className);
    assert.equal(getClassPassiveBonus(character, "mpWard"), 0, className);
  }
});

test("後衛のMP連動防御はMP枯渇で消える", () => {
  for (const [className, expected] of [["Priest", 4], ["Mage", 1]]) {
    const character = createSoloCharacter(className);
    assert.equal(getClassPassiveBonus(character, "mpWard"), expected, className);

    // 攻撃呪文の最小コストが1なので MP>=1 が発動条件
    character.mp = 1;
    assert.equal(getMpWardDef(character), expected, `${className} MP1`);
    character.mp = 0;
    assert.equal(getMpWardDef(character), 0, `${className} MP0`);
  }
});

if (failures > 0) {
  console.error(`${failures}件のテスト失敗`);
  process.exit(1);
}

console.log("[PASS] 基本4職ソロエンジン");
