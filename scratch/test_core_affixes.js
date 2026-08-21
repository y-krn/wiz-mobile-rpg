import assert from "node:assert/strict";
import {
  CORE_AFFIXES,
  SUPPORT_AFFIXES,
  AFFIX_BALANCE,
  getCharCoreParams,
  getCharMaxMp,
  getDamageAffixResult,
  getSpellPayment,
  paySpellCost,
  getTrapEaterBonusAfterDisarm,
  getFollowUpChance,
  getStatusEffectChance,
  partyHasCoreAffix,
  getEquippedCoreAffixes,
  canEquipUnidentifiedItem,
  getItemData,
  getPartyMaxAffix,
  getAffixDefinition
} from "../src/data.js";
import {
  getPolishCost,
  polishSupportAffix
} from "../src/craft.js";
import {
  getCharDef,
  getCharInt,
  getCharStr,
  getCharWeaponAtk
} from "../src/rules/character_stats.js";
import {
  applyKillAffixEffects,
  getMeleeModifiers,
  reduceIncomingDamage,
  tryApplyHitFlinch,
  tryThornCounter
} from "../src/combat_logic/damage.js";
import { resolvePurifyRecovery } from "../src/rules/purify_rules.js";
import {
  generateRandomAccessory,
  generateRandomEquipment
} from "../src/systems/equipment_generation.js";
import { getPerceptionIntent } from "../src/systems/elite_perception.js";
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

test("コア18種がenabled", () => {
  assert.equal(CORE_AFFIXES.length, 18);
  const enabled = CORE_AFFIXES.filter(core => core.enabled).map(core => core.id);
  assert.deepEqual(enabled, [
    "CORE_LAST_STAND", "CORE_OPENER", "CORE_PHYSICAL_ACCURACY", "CORE_BLOOD_WAND", "CORE_PURIFY_RING",
    "CORE_TRAP_EATER", "CORE_CURSE_KEEPER", "CORE_GIANT_SLAYER", "CORE_MILESTONE_BREAKER",
    "CORE_THORN_SHIELD", "CORE_EXECUTIONER", "CORE_THIN_ICE_PACT", "CORE_SNEAK_STEP", "CORE_TOMB_RAIDER",
    "CORE_KEEN_EYE", "CORE_CAMP_MASTER", "CORE_BOUNTY_HUNTER", "CORE_SCHOLAR_EYE"
  ]);
});

test("工房追加coreはpoolノード解放前後で抽選が切り替わる", () => {
  const addedCoreIds = [
    "CORE_OPENER", "CORE_TRAP_EATER", "CORE_GIANT_SLAYER",
    "CORE_THORN_SHIELD", "CORE_TOMB_RAIDER", "CORE_SCHOLAR_EYE",
    "CORE_MILESTONE_BREAKER", "CORE_THIN_ICE_PACT"
  ];
  const collectGeneratedCoreIds = (unlockedAffixIds, count) => {
    const party = [makeChar(null)];
    party[0].status = "dead";
    party[0].unlockedAffixIds = [...unlockedAffixIds];
    const found = new Set();
    for (let seed = 1; seed <= count; seed++) {
      const rng = lcg(seed);
      const items = [
        generateRandomEquipment(5, { forceRarity: "epic", rng, party }),
        generateRandomAccessory(5, { forceRarity: "epic", rng, party })
      ];
      items.flatMap(item => item?.affixes || []).forEach(affix => {
        if (addedCoreIds.includes(affix.id)) found.add(affix.id);
      });
    }
    return found;
  };

  assert.equal(collectGeneratedCoreIds([], 800).size, 0);
  assert.deepEqual(
    [...collectGeneratedCoreIds(addedCoreIds, 1600)].sort(),
    [...addedCoreIds].sort()
  );
});

test("生成API: magic coreChanceがcorePoolの抽選へ反映", () => {
  const originalComposition = AFFIX_BALANCE.rollComposition.magic;
  const originalBudgets = AFFIX_BALANCE.budgetsByRarityAndFloor.magic;
  try {
    AFFIX_BALANCE.rollComposition.magic = { support: 1, core: 1, coreChance: 1 };
    AFFIX_BALANCE.budgetsByRarityAndFloor.magic = [0, 10, 10, 10, 10, 10];
    const guaranteedCore = generateRandomEquipment(5, {
      forceRarity: "magic",
      rng: () => 0
    });
    assert.equal(guaranteedCore.affixes.filter(affix => affix.kind === "core").length, 1);

    AFFIX_BALANCE.rollComposition.magic.coreChance = 0;
    const supportOnly = generateRandomEquipment(5, {
      forceRarity: "magic",
      rng: () => 0
    });
    assert.equal(supportOnly.affixes.filter(affix => affix.kind === "core").length, 0);
  } finally {
    AFFIX_BALANCE.rollComposition.magic = originalComposition;
    AFFIX_BALANCE.budgetsByRarityAndFloor.magic = originalBudgets;
  }
});

test("素材経済サポートenabled・浅層経済3/戦闘1・深層逆転", () => {
  const phase3 = [
    "victoryMaterial", "stairsHeal", "identifyDiscount", "materialFind", "contractReward"
  ];
  assert.ok(phase3.every(id => SUPPORT_AFFIXES.find(affix => affix.id === id)?.enabled));
  assert.deepEqual(AFFIX_BALANCE.corePoolWeights.shallow, { combat: 1, economy: 3 });
  assert.deepEqual(AFFIX_BALANCE.corePoolWeights.deep, { combat: 3, economy: 1 });
});

test("atk/def supportと呪いを装備値へ各1回だけ反映", () => {
  const char = makeChar(null);
  char.class = "Thief";
  char.runTrapAttackBonus = 3;
  char.equipment.weapon = {
    ...supportItem("atk", 6, "SHORT_SWORD"),
    curseEffectId: "curse_blood_thirst",
    cursePower: 1
  };
  char.equipment.armor = {
    ...supportItem("def", 3, "LEATHER_ARMOR"),
    curseEffectId: "curse_cowardly_shield",
    cursePower: 1
  };

  assert.equal(
    getCharWeaponAtk(char),
    37.5,
    "基礎9 + support6 + 呪い22.5（罠喰いは別の固定加算）"
  );
  assert.equal(
    getCharDef(char),
    17,
    "基礎4 + support3 + 呪い10"
  );
});

test("Ninja素手攻撃は装備affix変更後も維持", () => {
  const char = makeChar(null);
  char.class = "Ninja";
  char.level = 5;
  char.equipment.weapon = null;
  assert.equal(getCharWeaponAtk(char), 15);
});

test("旧セーブの刻印・封印属性は装備計算と表示に影響しない", () => {
  const legacySupport = {
    ...supportItem("atk", 6, "SHORT_SWORD"),
    inscription: { name: "旧火印", type: "atk", value: 99 },
    coreSealed: true
  };
  const char = makeChar(null);
  char.equipment.weapon = legacySupport;

  assert.equal(getCharWeaponAtk(char), 15);
  assert.doesNotMatch(getItemData(legacySupport).name, /旧火印/);
  assert.doesNotMatch(getItemData(legacySupport).desc, /刻印/);

  const normalCore = makeChar("CORE_LAST_STAND");
  const legacyCore = makeChar("CORE_LAST_STAND");
  legacyCore.equipment.weapon.coreSealed = true;
  assert.deepEqual(
    getCharCoreParams(legacyCore, "CORE_LAST_STAND"),
    getCharCoreParams(normalCore, "CORE_LAST_STAND")
  );
  assert.doesNotMatch(getItemData(legacyCore.equipment.weapon).desc, /\(封\)/);
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

test("未鑑定装備のコアも装備中は戦闘経路で有効", () => {
  const char = makeChar(null);
  const unknownCore = coreItem("CORE_LAST_STAND");
  unknownCore.identified = false;
  unknownCore.halfIdentified = false;
  char.equipment.weapon = unknownCore;
  assert.equal(getEquippedCoreAffixes(char)[0].id, "CORE_LAST_STAND");
  assert.equal(getCharCoreParams(char, "CORE_LAST_STAND").damageMultiplier, 1.4);
  assert.equal(unknownCore.identified, false);
  assert.equal(unknownCore.halfIdentified, false);
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

test("浄化の環ルール: MP空き時はMP、満タン時はHPへ振替", () => {
  const target = { name: "Undead", tags: ["undead"] };
  assert.deepEqual(
    resolvePurifyRecovery({
      target,
      targetTags: ["undead", "demon"],
      hp: 50,
      maxHp: 100,
      mp: 0,
      maxMp: 10,
      mpRecovery: 1,
      fullMpHpRecovery: 1
    }),
    { targetMatched: true, mpRecovered: 1, hpRecovered: 0 }
  );
  assert.deepEqual(
    resolvePurifyRecovery({
      target,
      targetTags: ["undead", "demon"],
      hp: 50,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      mpRecovery: 1,
      fullMpHpRecovery: 1
    }),
    { targetMatched: true, mpRecovered: 0, hpRecovered: 1 }
  );
  assert.deepEqual(
    resolvePurifyRecovery({
      target: { name: "Beast", tags: ["beast"] },
      targetTags: ["undead", "demon"],
      hp: 50,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      mpRecovery: 1,
      fullMpHpRecovery: 1
    }),
    { targetMatched: false, mpRecovered: 0, hpRecovered: 0 }
  );
});

test("浄化の環: MP空き時はMP回復", () => {
  const char = makeChar(null);
  char.equipment.accessory = coreItem("CORE_PURIFY_RING", "AMULET_MP");
  const state = { combatState: {} };
  const logs = [];
  applyKillAffixEffects(char, { name: "Undead", tags: ["undead"] }, state, logs);
  assert.equal(char.mp, getCharCoreParams(char, "CORE_PURIFY_RING").mpRecovery);
  assert.ok(logs.some(entry => entry.msg.startsWith("[浄化の環]")));
});

test("浄化の環: MP満タン時はHPへ振替、HP満タン時は発動ログなし", () => {
  const char = makeChar(null);
  char.class = "Thief";
  char.equipment.accessory = coreItem("CORE_PURIFY_RING", "AMULET_MP");
  char.mp = getCharMaxMp(char);
  char.hp = 50;
  const state = { combatState: {} };
  const logs = [];
  applyKillAffixEffects(char, { name: "Demon", tags: ["demon"] }, state, logs);
  assert.equal(char.mp, getCharMaxMp(char));
  assert.equal(char.hp, 52);
  assert.match(logs[0].msg, /HPが2回復/);

  const fullHpChar = makeChar(null);
  fullHpChar.class = "Thief";
  fullHpChar.equipment.accessory = coreItem("CORE_PURIFY_RING", "AMULET_MP");
  fullHpChar.mp = getCharMaxMp(fullHpChar);
  const fullHpLogs = [];
  applyKillAffixEffects(
    fullHpChar,
    { name: "Demon", tags: ["demon"] },
    { combatState: {} },
    fullHpLogs
  );
  assert.equal(fullHpChar.hp, fullHpChar.maxHp);
  assert.equal(fullHpLogs.length, 0);
});

test("罠喰い: 罠適性職だけが累積し、上限20", () => {
  const char = makeChar(null);
  char.class = "Thief";
  char.equipment.accessory = coreItem("CORE_TRAP_EATER", "AMULET_HP");
  let bonus = 0;
  for (let i = 0; i < 20; i++) bonus = getTrapEaterBonusAfterDisarm(char, bonus);
  assert.equal(bonus, 20);
  const ineligible = makeChar(null);
  ineligible.equipment.accessory = coreItem("CORE_TRAP_EATER", "AMULET_HP");
  assert.equal(getCharCoreParams(ineligible, "CORE_TRAP_EATER"), null);
  assert.equal(getTrapEaterBonusAfterDisarm(ineligible, 0), 0);
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

test("守護者殺し: ボスだけ1.25倍", () => {
  const char = makeChar("CORE_MILESTONE_BREAKER");
  assert.equal(getDamageAffixResult(char, { maxHp: 100, isBoss: true }, 100).damage, 125);
  assert.equal(getDamageAffixResult(char, { maxHp: 100, isBoss: false }, 100).damage, 100);
});

test("殿の構え: 既存セーブ装備でも無害・無効果", () => {
  const char = makeChar("CORE_REARGUARD");
  assert.equal(getAffixDefinition("CORE_REARGUARD"), null);
  assert.deepEqual(getEquippedCoreAffixes(char), []);
  assert.equal(getCharCoreParams(char, "CORE_REARGUARD"), null);
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

test("薄氷の誓約: 低HP時に攻撃・被害が増える", () => {
  const char = makeChar(null);
  char.hp = 50;
  char.equipment.armor = coreItem("CORE_THIN_ICE_PACT", "LEATHER_ARMOR");
  assert.equal(getDamageAffixResult(char, { maxHp: 100 }, 100).damage, 135);
  assert.equal(reduceIncomingDamage(char, 10), 12);

  char.hp = 51;
  assert.equal(getDamageAffixResult(char, { maxHp: 100 }, 100).damage, 100);
  assert.equal(reduceIncomingDamage(char, 10), 10);
});

test("戦闘サポート: 条件倍率・状態耐性・キル回復・威圧", () => {
  const char = makeChar(null);
  char.class = "Thief";
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

test("迷宮アクセサリ: コア生成とIDENTIFICATION_BALANCE経路", () => {
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

// #311: コア1個制限を撤廃。スロットが許す限り複数のコアが同時に効く。
test("装備制約: 複数スロットのコアが同時に有効", () => {
  const char = makeChar("CORE_LAST_STAND");
  char.equipment.accessory = coreItem("CORE_OPENER", "AMULET_HP");
  const equipped = getEquippedCoreAffixes(char).map(affix => affix.id || affix.type);
  assert.ok(equipped.includes("CORE_LAST_STAND"), "weapon core stays active");
  assert.ok(equipped.includes("CORE_OPENER"), "accessory core is active at the same time");
  assert.ok(getCharCoreParams(char, "CORE_LAST_STAND"));
  assert.ok(getCharCoreParams(char, "CORE_OPENER"));
});

if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] core affix deterministic suite");
