import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  getCharCoreParams,
  getDamageAffixResult,
  getSpellPayment,
  paySpellCost,
  getTrapEaterBonusAfterDisarm,
  getFollowUpChance,
  getStatusEffectChance,
  canEquipCoreAffix
} from "../src/data.js";
import { getCharStr, getCharInt } from "../src/rules/character_stats.js";
import {
  applyKillAffixEffects,
  getMeleeModifiers,
  tryApplyHitFlinch,
  tryThornCounter
} from "../src/combat_logic/damage.js";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../src/systems/equipment_generation.js";

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

function lcg(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function coreItem(coreId, baseId = "SHORT_SWORD", curseEffectId = null) {
  return {
    kind: "equipment",
    baseId,
    identified: true,
    curseEffectId,
    affixes: [{ id: coreId, type: coreId, kind: "core", value: 1 }]
  };
}

function supportItem(type, value, baseId = "LEATHER_ARMOR") {
  return {
    kind: "equipment",
    baseId,
    identified: true,
    affixes: [{ id: type, type, kind: "support", value }]
  };
}

function makeChar(coreId, baseId = "SHORT_SWORD") {
  return {
    name: "Tester",
    class: "Fighter",
    level: 5,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 10,
    str: 15,
    int: 12,
    pie: 10,
    vit: 12,
    agi: 10,
    luk: 10,
    status: "ok",
    equipment: {
      weapon: coreId ? coreItem(coreId, baseId) : null,
      shield: null,
      armor: null,
      accessory: null
    }
  };
}

test("戦闘系コア10種だけがenabled", () => {
  const enabled = CORE_AFFIXES.filter(core => core.enabled).map(core => core.id);
  assert.deepEqual(enabled, [
    "CORE_LAST_STAND", "CORE_OPENER", "CORE_BLOOD_WAND", "CORE_PURIFY_RING",
    "CORE_TRAP_EATER", "CORE_CURSE_KEEPER", "CORE_GIANT_SLAYER", "CORE_REARGUARD",
    "CORE_THORN_SHIELD", "CORE_EXECUTIONER"
  ]);
});

test("背水: params閾値と倍率", () => {
  const char = makeChar("CORE_LAST_STAND");
  char.hp = 25;
  assert.equal(getDamageAffixResult(char, { maxHp: 50 }, 100).damage, 140);
});

test("先手必勝: 先制成功時のみ追撃100%", () => {
  const char = makeChar("CORE_OPENER", "AMULET_HP");
  assert.equal(getFollowUpChance(char, 0, true), 100);
  assert.equal(getFollowUpChance(char, 12, false), 12);
});

test("血杖: HP代替、HP不足、最低HP1", () => {
  const char = makeChar("CORE_BLOOD_WAND", "WAND");
  char.hp = 6;
  assert.deepEqual(getSpellPayment(char, 3), { canCast: true, resource: "hp", cost: 6 });
  paySpellCost(char, 3);
  assert.equal(char.hp, 1);
  char.hp = 5;
  assert.equal(getSpellPayment(char, 3).canCast, false);
});

test("浄化の環: undead/demonキルでMP回復", () => {
  const char = makeChar(null);
  char.equipment.accessory = coreItem("CORE_PURIFY_RING", "AMULET_MP");
  const state = { combatState: {} };
  const logs = [];
  applyKillAffixEffects(char, { name: "Undead", tags: ["undead"] }, state, logs);
  assert.equal(char.mp, getCharCoreParams(char, "CORE_PURIFY_RING").mpRecovery);
  assert.ok(logs.some(entry => entry.msg.startsWith("[浄化の環]")));
});

test("罠喰い: 1キャラ累積、上限20", () => {
  const char = makeChar(null);
  char.equipment.accessory = coreItem("CORE_TRAP_EATER", "AMULET_HP");
  let bonus = 0;
  for (let i = 0; i < 20; i++) bonus = getTrapEaterBonusAfterDisarm(char, bonus);
  assert.equal(bonus, 20);
});

test("呪飼いの鎖: 呪い数×全ステ+3", () => {
  const char = makeChar(null);
  char.equipment.weapon = supportItem("atk", 1, "SHORT_SWORD");
  char.equipment.weapon.curseEffectId = "curse_blood_thirst";
  char.equipment.accessory = coreItem("CORE_CURSE_KEEPER", "AMULET_HP", "curse_spectral_decay");
  assert.equal(getCharStr(char), char.str + 6);
  assert.equal(getCharInt(char), char.int + 6);
});

test("巨人殺し: maxHPが高い敵だけ1.3倍", () => {
  const char = makeChar("CORE_GIANT_SLAYER");
  assert.equal(getDamageAffixResult(char, { maxHp: 101 }, 100).damage, 130);
  assert.equal(getDamageAffixResult(char, { maxHp: 100 }, 100).damage, 100);
});

test("殿の構え: 後列rowRateをparamsの1へ変更", () => {
  const char = makeChar("CORE_REARGUARD");
  assert.equal(getMeleeModifiers(char, 2), 1);
});

test("反撃の棘: rng注入で発動と不発を固定", () => {
  const char = makeChar(null);
  char.equipment.shield = coreItem("CORE_THORN_SHIELD", "SMALL_SHIELD");
  const monster = { name: "Enemy", hp: 50, maxHp: 50, def: 0 };
  const state = { combatState: {} };
  assert.ok(tryThornCounter(char, monster, 0, state, [], () => 0) > 0);
  const hpAfterCounter = monster.hp;
  assert.equal(tryThornCounter(char, monster, 0, state, [], () => 1), 0);
  assert.equal(monster.hp, hpAfterCounter);
});

test("執行人: 状態異常中だけ2倍", () => {
  const char = makeChar("CORE_EXECUTIONER");
  assert.equal(getDamageAffixResult(char, { maxHp: 50, status: "poisoned" }, 100).damage, 200);
  assert.equal(getDamageAffixResult(char, { maxHp: 50 }, 100).damage, 100);
});

test("戦闘サポート: 条件倍率・状態耐性・キル回復・威圧", () => {
  const char = makeChar(null);
  char.hp = 50;
  char.equipment.weapon = supportItem("deepAssault", 10, "SHORT_SWORD");
  char.equipment.armor = supportItem("antiBeast", 20);
  assert.equal(getDamageAffixResult(char, { maxHp: 50, tags: ["beast"] }, 100, { floor: 3 }).damage, 130);

  char.equipment.armor = supportItem("statusResistance", 50);
  assert.equal(getStatusEffectChance(char, 0.4), 0.2);

  char.equipment.weapon = supportItem("killHeal", 2, "SHORT_SWORD");
  applyKillAffixEffects(char, { name: "Enemy", tags: [] }, { combatState: {} }, []);
  assert.equal(char.hp, 52);

  char.equipment.weapon = supportItem("hitFlinch", 10, "SHORT_SWORD");
  const target = { name: "Enemy", hp: 10 };
  assert.equal(tryApplyHitFlinch(char, target, [], () => 0), true);
  assert.equal(target.flinched, true);
});

test("生成API: allowCores=falseでエピック商人相当にもコアなし", () => {
  const rng = () => 0.1;
  const equipment = generateRandomEquipment(5, { forceRarity: "epic", rng, allowCores: false });
  const accessory = generateRandomAccessory(5, { forceRarity: "epic", rng, allowCores: false });
  assert.ok(equipment.affixes.every(affix => affix.kind !== "core"));
  assert.ok(accessory.affixes.every(affix => affix.kind !== "core"));
});

test("迷宮アクセサリ: コア生成とcoreCurseChance経路", () => {
  let coreAccessory = null;
  let cursedCoreAccessory = null;
  for (let seed = 1; seed <= 200; seed++) {
    const accessory = generateRandomAccessory(5, { forceRarity: "epic", rng: lcg(seed) });
    if (accessory.affixes.some(affix => affix.kind === "core")) {
      coreAccessory ||= accessory;
      if (accessory.curseEffectId) cursedCoreAccessory ||= accessory;
    }
  }
  assert.ok(coreAccessory);
  assert.ok(cursedCoreAccessory);
  assert.ok(cursedCoreAccessory.tags.includes("curse"));
});

test("装備制約: 2個目のコアを拒否、同スロット交換は許可", () => {
  const char = makeChar("CORE_LAST_STAND");
  const accessoryCore = coreItem("CORE_OPENER", "AMULET_HP");
  assert.equal(canEquipCoreAffix(char, accessoryCore, "accessory"), false);
  assert.equal(canEquipCoreAffix(char, coreItem("CORE_GIANT_SLAYER"), "weapon"), true);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] core affix deterministic suite");
