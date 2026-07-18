import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  SUPPORT_AFFIXES,
  AFFIX_BALANCE,
  getCharCoreParams,
  getDamageAffixResult,
  getSpellPayment,
  paySpellCost,
  getTrapEaterBonusAfterDisarm,
  getFollowUpChance,
  getStatusEffectChance,
  canEquipCoreAffix,
  partyHasCoreAffix,
  canEquipUnidentifiedItem,
  getItemData,
  getPartyMaxAffix,
  getAffixDefinition,
  formatAffixText,
  TAG_EFFECT_MAP,
  MATERIAL_TAGS
} from "../src/data.js";
import { applyCurseSeal, getDismantleResults, getPolishCost, polishSupportAffix } from "../src/craft.js";
import { getCharStr, getCharInt, getCharWeaponAtk } from "../src/rules/character_stats.js";
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
import { getPerceptionIntent } from "../src/systems/warden_perception.js";
import { applyTombRaiderTrapTier, generateChestMaterials } from "../src/chest.js";
import { increaseChestTrapTier } from "../src/systems/traps.js";
import { restAtCamp } from "../src/systems/camp_rest.js";
import { applyCombatRewards } from "../src/combat_logic/rewards.js";

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

test("全コア16種がenabled", () => {
  const enabled = CORE_AFFIXES.filter(core => core.enabled).map(core => core.id);
  assert.deepEqual(enabled, [
    "CORE_LAST_STAND", "CORE_OPENER", "CORE_BLOOD_WAND", "CORE_PURIFY_RING",
    "CORE_TRAP_EATER", "CORE_CURSE_KEEPER", "CORE_GIANT_SLAYER", "CORE_REARGUARD",
    "CORE_THORN_SHIELD", "CORE_EXECUTIONER", "CORE_SNEAK_STEP", "CORE_TOMB_RAIDER",
    "CORE_KEEN_EYE", "CORE_CAMP_MASTER", "CORE_BOUNTY_HUNTER", "CORE_SCHOLAR_EYE"
  ]);
});

test("素材経済サポートenabled・浅層経済3/戦闘1・深層逆転", () => {
  const phase3 = [
    "victoryMaterial", "stairsHeal", "identifyDiscount", "materialFind", "contractReward"
  ];
  assert.ok(phase3.every(id => SUPPORT_AFFIXES.find(affix => affix.id === id)?.enabled));
  assert.deepEqual(AFFIX_BALANCE.corePoolWeights.shallow, { combat: 1, economy: 3 });
  assert.deepEqual(AFFIX_BALANCE.corePoolWeights.deep, { combat: 3, economy: 1 });
});

test("刻印19種: 素材cost・サポートtype・素材割当が整合", () => {
  const entries = Object.entries(TAG_EFFECT_MAP);
  assert.equal(entries.length, 19);
  const assignedTags = new Set(Object.values(MATERIAL_TAGS).flat());
  entries.forEach(([tag, effect]) => {
    assert.ok(effect.matCost >= 1 && effect.matCost <= 4, `${tag}: matCost`);
    assert.ok(assignedTags.has(tag), `${tag}: material assignment`);
    if (effect.type !== "curse") {
      const definition = getAffixDefinition(effect.type);
      assert.equal(definition?.kind, "support", `${tag}: support type`);
      assert.equal(definition?.enabled, true, `${tag}: enabled`);
    }
  });
});

test("研磨: サポートを切り上げ1.5倍・1アイテム1回・コア除外", () => {
  const item = supportItem("statusResistance", 5);
  assert.deepEqual(getPolishCost(item), AFFIX_BALANCE.polishCost);
  assert.equal(polishSupportAffix(item, 0), true);
  assert.equal(item.affixes[0].value, 8);
  assert.equal(item.polished, true);
  assert.equal(polishSupportAffix(item, 0), false);

  const coreOnly = coreItem("CORE_LAST_STAND");
  assert.equal(getPolishCost(coreOnly), null);
  assert.equal(polishSupportAffix(coreOnly, 0), false);
  assert.equal(coreOnly.affixes[0].value, 1);
  assert.equal(coreOnly.polished, undefined);
  assert.equal(getDismantleResults(coreOnly), null);
});

test("封印半減: 倍率系は基準差半減・定数系は切捨て・boolean系は無効", () => {
  const multiplierChar = makeChar("CORE_LAST_STAND");
  multiplierChar.equipment.weapon.tags = ["curse"];
  multiplierChar.equipment.weapon.curseEffectId = "curse_blood_thirst";
  assert.equal(applyCurseSeal(multiplierChar.equipment.weapon), true);
  assert.equal(multiplierChar.equipment.weapon.coreSealed, true);
  assert.equal(multiplierChar.equipment.weapon.tags.includes("curse"), false);
  assert.equal(multiplierChar.equipment.weapon.curseEffectId, null);
  assert.ok(formatAffixText(multiplierChar.equipment.weapon.affixes[0], ": ", { coreSealed: true }).startsWith("◆(封)背水:"));
  multiplierChar.hp = 25;
  assert.equal(getCharCoreParams(multiplierChar, "CORE_LAST_STAND").damageMultiplier, 1.2);
  assert.equal(getDamageAffixResult(multiplierChar, { maxHp: 50 }, 100).damage, 120);

  const constantChar = makeChar(null);
  constantChar.equipment.accessory = coreItem("CORE_CURSE_KEEPER", "AMULET_HP", "curse_spectral_decay");
  constantChar.equipment.accessory.coreSealed = true;
  assert.equal(getCharCoreParams(constantChar, "CORE_CURSE_KEEPER").statsPerCurse, 1);

  const booleanChar = makeChar("CORE_REARGUARD");
  booleanChar.equipment.weapon.coreSealed = true;
  assert.equal(getCharCoreParams(booleanChar, "CORE_REARGUARD"), null);
  assert.equal(getMeleeModifiers(booleanChar, 2), 0.5);
});

test("忍び足: 生存装備者のみパーティ有効、感知4→2、オーラ値+1", () => {
  const wearer = makeChar(null);
  wearer.equipment.armor = coreItem("CORE_SNEAK_STEP", "LEATHER_ARMOR");
  assert.equal(partyHasCoreAffix([wearer], "CORE_SNEAK_STEP"), true);
  const intent = getPerceptionIntent({
    monster: { x: 0, y: 0, perception: "standard" },
    player: { x: 3, y: 0 },
    grid: []
  });
  const sneaking = getPerceptionIntent({
    monster: { x: 0, y: 0, perception: "standard" },
    player: { x: 3, y: 0 },
    grid: [],
    rangeMultiplier: 0.5
  });
  assert.equal(intent.detected, true);
  assert.equal(sneaking.detected, false);
  assert.equal(getCharCoreParams(wearer, "CORE_SNEAK_STEP").auraRangeBonus, 1);
  wearer.status = "ash";
  assert.equal(partyHasCoreAffix([wearer], "CORE_SNEAK_STEP"), false);
});

test("盗掘王: 開錠者本人で素材+1と罠強度+1を両立", () => {
  const opener = makeChar(null);
  opener.equipment.accessory = coreItem("CORE_TOMB_RAIDER", "AMULET_HP");
  const chest = { trap: "poison needle" };
  assert.equal(applyTombRaiderTrapTier(chest, opener), true);
  assert.equal(chest.trap, increaseChestTrapTier("poison needle", 1));
  assert.equal(applyTombRaiderTrapTier(chest, opener), false);
  const baseMats = generateChestMaterials(1, () => 0, 0);
  const boostedMats = generateChestMaterials(1, () => 0, 1);
  assert.equal(Object.values(boostedMats).reduce((a, b) => a + b, 0),
    Object.values(baseMats).reduce((a, b) => a + b, 0) + 1);
});

test("未鑑定装備: 全員装備可・鑑定前表示隠匿", () => {
  const char = makeChar(null);
  char.equipment.accessory = coreItem("CORE_KEEN_EYE", "AMULET_HP");
  const unknown = {
    kind: "equipment",
    baseId: "SHORT_SWORD",
    identified: false,
    unidentifiedName: "古びた未鑑定の武器",
    affixes: [{ id: "str", type: "str", kind: "support", value: 3 }]
  };
  assert.equal(canEquipUnidentifiedItem(char, unknown), true);
  assert.equal(canEquipUnidentifiedItem(makeChar(null), unknown), true);
  const hidden = getItemData(unknown);
  assert.deepEqual(hidden.statsBonus, {});
  assert.deepEqual(hidden.affixes, []);
  assert.ok(!hidden.desc.includes("力+3"));
});

test("野営の達人: 装備者本人のキャンプ回復量2倍", () => {
  const master = makeChar(null);
  master.equipment.armor = coreItem("CORE_CAMP_MASTER", "LEATHER_ARMOR");
  master.hp = 50;
  master.mp = 0;
  const normal = makeChar(null);
  normal.hp = 50;
  normal.mp = 0;
  const campState = {
    floor: 2,
    openedGates: ["B2_WARDEN_GATE"],
    currentRun: { campRested: {} },
    party: [master, normal]
  };
  const result = restAtCamp(campState);
  assert.equal(master.hp, 90);
  assert.equal(normal.hp, 70);
  assert.deepEqual(result.coreUsers, [master.name]);
});

function makeRewardState(coreId, quest = null) {
  const char = makeChar(null);
  char.equipment.accessory = coreId ? coreItem(coreId, "AMULET_HP") : null;
  return {
    floor: 1,
    party: [char],
    combatState: { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [] },
    currentRun: {
      kills: 0, goldGained: 0, expGained: 0, bossesKilled: 0, elitesKilled: 0,
      materials: {}, equipmentFound: [], quests: quest ? [quest] : [], defeatsByRole: {}
    },
    codex: { stats: {}, monsters: { ゴブリン: { encountered: 1, killed: 0, firstKilled: false } } },
    firstKills: ["ゴブリン"],
    inventory: [],
    metaMaterials: {},
    floorChestsTotal: [0]
  };
}

function goblin() {
  return { name: "ゴブリン", hp: 0, maxHp: 10, exp: 0, tags: [], fled: false };
}

test("賞金稼ぎ: ランクエスト対象キルを2倍カウント", () => {
  const quest = { type: "role_kill", role: "aggressor", currentValue: 0, targetValue: 4, completed: false, reward: { materials: {} } };
  const rewardState = makeRewardState("CORE_BOUNTY_HUNTER", quest);
  rewardState.combatState.monsters = [goblin()];
  rewardState.combatState.monsters[0].role = "aggressor";
  const logs = [];
  applyCombatRewards(rewardState, rewardState.combatState.monsters, logs, () => 1);
  assert.equal(quest.currentValue, 2);
  assert.ok(logs.some(entry => entry.msg.startsWith("[賞金稼ぎ]")));
});

test("学者の眼: 図鑑未登録敵からrng不発でも素材確定", () => {
  const rewardState = makeRewardState("CORE_SCHOLAR_EYE");
  rewardState.combatState.monsters = [goblin()];
  const logs = [];
  applyCombatRewards(rewardState, rewardState.combatState.monsters, logs, () => 1);
  assert.equal(rewardState.currentRun.materials["獣の牙"], 1);
  assert.ok(logs.some(entry => entry.msg.startsWith("[学者の眼]")));
});

test("素材サポート: パーティ合算でなく最大値1人分", () => {
  const a = makeChar(null);
  const b = makeChar(null);
  a.equipment.armor = supportItem("materialFind", 10);
  b.equipment.armor = supportItem("materialFind", 10);
  assert.equal(getPartyMaxAffix([a, b], "materialFind"), 10);
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
