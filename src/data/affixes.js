export const AFFIX_BALANCE = {
  polishCost: {
    mats: { "魔石片": 2 }
  },
  supportCosts: {
    atk: 3,
    def: 3,
    str: 2,
    int: 2,
    pie: 2,
    vit: 2,
    agi: 2,
    luk: 2,
    hp: 2,
    mp: 2,
    antiUndead: 3,
    antiDragon: 3,
    antiDemon: 3,
    poisonWard: 2,
    spellGuard: 3,
    trapBonus: 2,
    trapGuard: 2,
    treasureSense: 2,
    arcaneSense: 1,
    hearRange: 1,
    traceRead: 1,
    followUp: 3,
    spellPower: 3,
    arcane: 3,
    devotion: 3,
    guardian: 3,
    firstStrike: 3,
    deepAssault: 2,
    frontGuard: 2,
    rearEvasion: 2,
    fullHpDamage: 3,
    firstTurnAttack: 2,
    antiBeast: 2,
    antiSpirit: 2,
    firstStrikeDefense: 2,
    lastSurvivorStats: 3,
    statusResistance: 2,
    spellAccuracy: 2,
    killHeal: 2,
    followUpMp: 2,
    hitFlinch: 2,
    poisonAtk: 2,
    bleedingAtk: 2,
    victoryMaterial: 2,
    stairsHeal: 1,
    identifyDiscount: 1,
    materialFind: 2,
    contractReward: 2,
    lowHpDamage: 3,
    firstStrikeFollowUp: 3,
    physicalAccuracy: 2,
    highHpTargetDamage: 3,
    bossDamage: 3
  },
  // Shared spell power uses rarity for value. Floor only controls whether a
  // generator pool can offer the affix; it never scales the rolled value.
  spellPowerByRarity: {
    magic: 10,
    rare: 15,
    epic: 20
  },
  // Support values are quality-driven.  The generator may still use floor to
  // decide whether a support can enter a pool, but a generated item's value
  // is determined only by its rarity.
  supportValuesByRarity: {
    atk: { magic: 1.5, rare: 4.5, epic: 9 },
    def: { magic: 1, rare: 2, epic: 4 },
    hp: { magic: 3, rare: 6, epic: 9 },
    mp: { magic: 1, rare: 2, epic: 4 },
    str: { magic: 1, rare: 2, epic: 3 },
    int: { magic: 1, rare: 2, epic: 3 },
    pie: { magic: 1, rare: 2, epic: 3 },
    vit: { magic: 1, rare: 2, epic: 3 },
    agi: { magic: 1, rare: 2, epic: 3 },
    luk: { magic: 1, rare: 2, epic: 3 },
    trapBonus: { magic: 5, rare: 10, epic: 15 },
    trapGuard: { magic: 10, rare: 20, epic: 30 },
    spellGuard: { magic: 10, rare: 15, epic: 20 },
    antiUndead: { magic: 15, rare: 20, epic: 25 },
    antiDragon: { magic: 15, rare: 20, epic: 25 },
    antiDemon: { magic: 15, rare: 20, epic: 25 },
    poisonWard: { magic: 20, rare: 35, epic: 50 },
    treasureSense: { magic: 5, rare: 7, epic: 8 },
    hearRange: { magic: 1, rare: 2, epic: 3 },
    arcaneSense: { magic: 1, rare: 2, epic: 3 },
    traceRead: { magic: 1, rare: 2, epic: 3 },
    deepAssault: { magic: 10, rare: 12, epic: 15 },
    frontGuard: { magic: 2, rare: 3, epic: 4 },
    rearEvasion: { magic: 6, rare: 8, epic: 10 },
    firstStrikeDefense: { magic: 2, rare: 3, epic: 4 },
    fullHpDamage: { magic: 10, rare: 12, epic: 15 },
    firstTurnAttack: { magic: 3, rare: 4, epic: 6 },
    firstStrike: { magic: 5, rare: 8, epic: 10 },
    antiBeast: { magic: 15, rare: 20, epic: 25 },
    antiSpirit: { magic: 15, rare: 20, epic: 25 },
    spellAccuracy: { magic: 10, rare: 12, epic: 15 },
    hitFlinch: { magic: 10, rare: 12, epic: 15 },
    poisonAtk: { magic: 8, rare: 10, epic: 12 },
    bleedingAtk: { magic: 8, rare: 10, epic: 12 },
    lastSurvivorStats: { magic: 2, rare: 3, epic: 3 },
    statusResistance: { magic: 12, rare: 16, epic: 20 },
    stairsHeal: { magic: 2, rare: 3, epic: 4 },
    lowHpDamage: { magic: 10, rare: 12, epic: 15 },
    firstStrikeFollowUp: { magic: 15, rare: 20, epic: 25 },
    physicalAccuracy: { magic: 5, rare: 8, epic: 10 },
    highHpTargetDamage: { magic: 10, rare: 12, epic: 15 },
    bossDamage: { magic: 10, rare: 12, epic: 15 }
  },
  // #270: 実src経路のsim（N=500、工房解放済み・帰還の翼あり）で
  // 前半core遭遇 44.2%→65.4%、前半core装備 36.2%→58.2%。
  // 注: sim内オーバーライドでの試算値(67.6%/61.8%)は乱数消費順が異なるため一致しない。
  budgetsByRarityAndFloor: {
    magic: [0, 10, 10, 10, 10, 10],
    rare: [0, 10, 10, 10, 10, 10],
    epic: [0, 12, 13, 14, 15, 16]
  },
  rollComposition: {
    magic: { support: 1, core: 1, coreChance: 1.00 },
    rare: { support: 2, core: 1, coreChance: 0.75 },
    epic: { support: 2, core: 1 }
  },
  legacySupportCounts: {
    equipment: { magic: 1, rare: 2, epic: 3 },
    accessory: { magic: 1, rare: 1, epic: 2 }
  },
  corePoolWeights: {
    shallowMaxFloor: 2,
    shallow: { combat: 1, economy: 3 },
    deep: { combat: 3, economy: 1 }
  }
};

export const LOOT_BUILD_ROLES = Object.freeze({
  REINFORCE: "reinforce",
  CONVERT: "convert",
  PIVOT: "pivot"
});

export const LOOT_BUILD_AXES = Object.freeze({
  MAIN: "main",
  AUXILIARY: "auxiliary",
  SUPPORT: "support"
});

// These weights are the authored supply target for the five-floor chapters.
// They shape what a run may discover; they never inspect the current build.
export const LOOT_ROLE_SUPPLY_BY_BAND = Object.freeze([
  Object.freeze({ id: "B1_5", minFloor: 1, maxFloor: 5, weights: Object.freeze({ reinforce: 75, convert: 20, pivot: 5 }) }),
  Object.freeze({ id: "B6_10", minFloor: 6, maxFloor: 10, weights: Object.freeze({ reinforce: 60, convert: 30, pivot: 10 }) }),
  Object.freeze({ id: "B11_15", minFloor: 11, maxFloor: 15, weights: Object.freeze({ reinforce: 55, convert: 30, pivot: 15 }) }),
  Object.freeze({ id: "B16_20", minFloor: 16, maxFloor: 20, weights: Object.freeze({ reinforce: 50, convert: 35, pivot: 15 }) }),
  Object.freeze({ id: "B21_PLUS", minFloor: 21, maxFloor: Infinity, weights: Object.freeze({ reinforce: 45, convert: 35, pivot: 20 }) })
]);

export function getLootRoleSupply(floor = 1) {
  const normalizedFloor = Math.max(1, Number.isFinite(Number(floor)) ? Number(floor) : 1);
  return LOOT_ROLE_SUPPLY_BY_BAND.find(band => normalizedFloor >= band.minFloor && normalizedFloor <= band.maxFloor)
    || LOOT_ROLE_SUPPLY_BY_BAND[0];
}

export function getLootBuildRoleForRoll(floor = 1, roll = 0) {
  const { weights } = getLootRoleSupply(floor);
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let remaining = Math.max(0, Math.min(0.999999999, Number(roll) || 0)) * totalWeight;
  return Object.entries(weights).find(([, weight]) => {
    remaining -= weight;
    return remaining <= 0;
  })?.[0] || LOOT_BUILD_ROLES.REINFORCE;
}

const SUPPORT_BUILD_ROLES = Object.freeze({
  atk: "reinforce", def: "reinforce", str: "reinforce", int: "reinforce", pie: "reinforce",
  vit: "reinforce", agi: "reinforce", luk: "reinforce", hp: "reinforce", mp: "reinforce",
  antiUndead: "reinforce", antiDragon: "reinforce", antiDemon: "reinforce", spellPower: "reinforce",
  arcane: "reinforce", devotion: "reinforce", guardian: "convert", firstStrike: "reinforce",
  poisonWard: "convert", spellGuard: "convert", trapBonus: "convert", trapGuard: "convert", frontGuard: "convert",
  rearEvasion: "convert", firstStrikeDefense: "convert", statusResistance: "convert", killHeal: "convert",
  followUpMp: "convert", poisonAtk: "convert", bleedingAtk: "convert", stairsHeal: "convert",
  deepAssault: "pivot", followUp: "pivot", treasureSense: "pivot", arcaneSense: "pivot",
  hearRange: "pivot", traceRead: "pivot", fullHpDamage: "pivot", firstTurnAttack: "pivot",
  antiBeast: "pivot", antiSpirit: "pivot", lastSurvivorStats: "pivot", spellAccuracy: "pivot",
  lowHpDamage: "reinforce", firstStrikeFollowUp: "reinforce", physicalAccuracy: "reinforce",
  highHpTargetDamage: "pivot", bossDamage: "pivot",
  hitFlinch: "pivot", victoryMaterial: "pivot", identifyDiscount: "pivot", materialFind: "pivot",
  contractReward: "pivot"
});

function support(id, jpName, desc, category, options = {}) {
  return {
    id,
    type: id,
    kind: "support",
    category,
    jpName,
    desc,
    cost: AFFIX_BALANCE.supportCosts[id],
    buildRole: options.buildRole || SUPPORT_BUILD_ROLES[id] || LOOT_BUILD_ROLES.REINFORCE,
    buildAxis: options.buildAxis || LOOT_BUILD_AXES.SUPPORT,
    enabled: options.enabled ?? true,
    unit: options.unit ?? "",
    ...options
  };
}

export const SUPPORT_AFFIXES = [
  support("atk", "攻撃", "攻撃力が増加する。", "basic"),
  support("def", "防御", "防御力が増加する。", "basic"),
  support("str", "力", "力が増加する。", "basic"),
  support("int", "知恵", "知恵が増加する。", "basic"),
  support("pie", "信仰", "信仰が増加する。", "basic"),
  support("vit", "生命", "生命が増加する。", "basic"),
  support("agi", "素早さ", "素早さが増加する。", "basic"),
  support("luk", "運", "運が増加する。", "basic"),
  support("hp", "最大HP", "最大HPが増加する。", "basic"),
  support("mp", "最大MP", "最大MPが増加する。", "basic"),
  support("antiUndead", "不死祓い", "不死への与ダメージが増加する。", "basic", { unit: "%" }),
  support("antiDragon", "竜殺し", "竜への与ダメージが増加する。", "basic", { unit: "%" }),
  support("antiDemon", "悪魔対策", "悪魔への与ダメージが増加する。", "basic", { unit: "%" }),
  support("poisonWard", "毒避け", "毒への耐性が増加する。", "basic", { unit: "%" }),
  support("spellGuard", "魔除け", "呪文ダメージを軽減する。", "basic", { unit: "%" }),
  support("trapBonus", "罠解除", "罠解除率が増加する。", "basic", { unit: "%" }),
  support("trapGuard", "罠守", "罠によるHPダメージを軽減する。", "basic", { unit: "%" }),
  support("treasureSense", "宝探", "宝の発見率が増加する。", "basic", { unit: "%" }),
  support("arcaneSense", "霊視", "魔力感知範囲が増加する。", "basic", { unit: "Lv" }),
  support("hearRange", "聴覚", "聴覚範囲が増加する。", "basic"),
  support("traceRead", "痕跡", "痕跡判読範囲が増加する。", "basic", { unit: "Lv" }),
  support("followUp", "追加攻撃", "追加攻撃率が増加する。", "basic", { unit: "%" }),
  support("spellPower", "術力", "攻撃・回復呪文の威力が増加する。", "basic", { unit: "%" }),
  support("arcane", "呪文威力", "呪文威力が増加する。", "basic", { unit: "%" }),
  support("devotion", "回復威力", "回復威力が増加する。", "basic", { unit: "%" }),
  support("guardian", "守護", "HP25%以下のとき、物理ダメージを軽減する。", "basic", { unit: "%" }),
  support("firstStrike", "先制", "先制率が増加する。", "basic"),
  support("physicalAccuracy", "物理命中", "回避対象への物理命中率が増加する。", "basic", { unit: "%" }),

  support("deepAssault", "深層攻勢", "B3F以深で与ダメージが増加する。", "conditional", { unit: "%" }),
  support("frontGuard", "前衛堅守", "前列で防御力が増加する。", "conditional"),
  support("rearEvasion", "後衛回避", "後列で回避率が増加する。", "conditional", { unit: "%" }),
  support("fullHpDamage", "無傷の猛攻", "HP満タン時に与ダメージが増加する。", "conditional", { unit: "%" }),
  support("firstTurnAttack", "初陣", "1ターン目に攻撃力が増加する。", "conditional"),
  support("antiBeast", "獣狩り", "獣への与ダメージが増加する。", "conditional", { unit: "%" }),
  support("antiSpirit", "霊祓い", "霊体への与ダメージが増加する。", "conditional", { unit: "%" }),
  support("firstStrikeDefense", "先陣の守り", "先制成功時に防御力が増加する。", "conditional"),
  support("lastSurvivorStats", "孤軍", "単独生存時に全能力が増加する。", "conditional"),
  support("statusResistance", "不屈", "状態異常への耐性が増加する。", "conditional", { unit: "%" }),
  support("spellAccuracy", "精唱", "呪文命中率が増加する。", "conditional", { unit: "%" }),
  support("lowHpDamage", "窮地の猛攻", "HP40%以下で与ダメージが増加する。", "conditional", {
    unit: "%",
    params: { hpThreshold: 0.40 }
  }),
  support("highHpTargetDamage", "巨体狙い", "自分より最大HPが高い敵への与ダメージが増加する。", "conditional", {
    unit: "%",
    params: { targetMaxHpMultiplier: 1 }
  }),
  support("bossDamage", "守護者狙い", "階層守護者への与ダメージが増加する。", "conditional", { unit: "%" }),

  support("killHeal", "吸命", "敵撃破時にHPを2回復する。", "trigger"),
  support("followUpMp", "連環", "追撃時にMPを1回復する。", "trigger"),
  support("hitFlinch", "威圧", "被弾時に低確率で敵を怯ませる。", "trigger"),
  // 消費側は round.js の攻撃命中処理に実装済みだったが、供給が「毒脈の呪い」しか
  // なく、プレイヤー側の状態異常付与手段が実質 KATINO だけになっていた（#313）。
  support("poisonAtk", "毒刃", "攻撃命中時に低確率で敵を毒にする。", "trigger", { unit: "%" }),
  support("bleedingAtk", "裂傷", "攻撃命中時に低確率で敵を出血させる。後続の通常攻撃で追加ダメージ。", "trigger", { unit: "%" }),
  support("victoryMaterial", "拾得", "勝利時に低確率で素材を得る。", "trigger", { unit: "%" }),
  support("stairsHeal", "踏破の息吹", "階段発見時にHPを回復する。", "trigger"),
  support("firstStrikeFollowUp", "先手連撃", "先制成功時、追撃率が増加する。", "trigger", { unit: "%" }),

  support("identifyDiscount", "鑑定眼", "鑑定費用を軽減する。", "economy", { unit: "%" }),
  support("materialFind", "素材探し", "素材発見率が10%増加する。", "economy", { unit: "%" }),
  support("contractReward", "任務巧者", "依頼報酬が10%増加する。", "economy", { unit: "%" }),
];

export const CORE_AFFIXES = [
  {
    id: "CORE_BLOOD_WAND",
    kind: "core",
    jpName: "血杖",
    desc: "MP不足時、消費MPの2倍のHPで呪文を発動できる。",
    slot: "weapon",
    cost: 10,
    params: { hpCostMultiplier: 2 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_PURIFY_RING",
    kind: "core",
    jpName: "浄化の環",
    desc: "不死・霊・悪魔を倒すたび、MPに空きがあればMPを1、満タンならHPを2回復する。",
    slot: "accessory",
    cost: 10,
    // 対象を霊まで広げる。不死・悪魔だけでは実プレイ深度の遭遇プールに対象がおらず、
    // 発動機会が撃破13,730回中93回（0.7%）しかなかった（#312）。
    params: {
      mpRecovery: 1,
      fullMpHpRecovery: 2,
      targetTags: ["undead", "spirit", "demon"]
    },
    buildRole: "reinforce",
    buildAxis: "auxiliary",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_TRAP_EATER",
    kind: "core",
    jpName: "罠喰い",
    desc: "宝箱の罠解除に成功するたび、遠征中のダメージが2増加する。上限は20。",
    slot: "accessory",
    cost: 10,
    params: { attackPerDisarm: 2, maxAttack: 20 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_CURSE_KEEPER",
    kind: "core",
    jpName: "呪飼いの鎖",
    desc: "装備中の呪い1個につき全能力が3増加する。",
    slot: "accessory",
    cost: 10,
    params: { statsPerCurse: 3 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_THORN_SHIELD",
    kind: "core",
    jpName: "反撃の棘",
    desc: "被弾時30%の確率で威力50%の反撃を行う。",
    slot: "shield",
    cost: 10,
    params: { counterChance: 0.3, counterPower: 0.5 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_EXECUTIONER",
    kind: "core",
    jpName: "執行人",
    desc: "攻撃前35%で敵を毒にし、状態異常中の敵への与ダメージが1.4倍になる。",
    slot: "weapon",
    cost: 10,
    params: { status: "poisoned", statusChance: 0.35, damageMultiplier: 1.4 },
    buildRole: "pivot",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_THIN_ICE_PACT",
    kind: "core",
    jpName: "薄氷の誓約",
    desc: "HP50%以下で与ダメージが35%増加するが、被ダメージも20%増加する。",
    slot: "armor",
    cost: 10,
    params: { hpThreshold: 0.50, damageMultiplier: 1.35, incomingDamageMultiplier: 1.20 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "combat",
    enabled: true
  },
  {
    id: "CORE_SNEAK_STEP",
    kind: "core",
    jpName: "忍び足",
    desc: "門番・ボスの感知範囲を半減し、オーラ検知を1マス延長する。",
    slot: "armor",
    cost: 10,
    params: { detectionRangeMultiplier: 0.5, auraRangeBonus: 1 },
    buildRole: "pivot",
    buildAxis: "main",
    poolGroup: "economy",
    enabled: true
  },
  {
    id: "CORE_TOMB_RAIDER",
    kind: "core",
    jpName: "盗掘王",
    desc: "宝箱の素材が1個増えるが、罠強度も1段階上がる。",
    slot: "accessory",
    cost: 10,
    params: { materialBonus: 1, trapTierBonus: 1 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "economy",
    enabled: true
  },
  {
    id: "CORE_KEEN_EYE",
    kind: "core",
    jpName: "慧眼",
    desc: "未鑑定装備を能力適用状態で装備できる。効果は鑑定まで隠れる。",
    slot: "accessory",
    cost: 10,
    params: { applyUnidentifiedEffects: true, hideUntilIdentified: true },
    buildRole: "pivot",
    buildAxis: "auxiliary",
    poolGroup: "economy",
    enabled: true
  },
  {
    id: "CORE_CAMP_MASTER",
    kind: "core",
    jpName: "野営の達人",
    desc: "キャンプ休息の回復量が2倍になる。",
    slot: "armor",
    cost: 10,
    params: { recoveryMultiplier: 2 },
    buildRole: "convert",
    buildAxis: "main",
    poolGroup: "economy",
    enabled: true
  },
  {
    id: "CORE_BOUNTY_HUNTER",
    kind: "core",
    jpName: "賞金稼ぎ",
    desc: "依頼対象の撃破数を2倍で数える。",
    slot: "accessory",
    cost: 10,
    params: { contractCountMultiplier: 2 },
    buildRole: "pivot",
    buildAxis: "auxiliary",
    poolGroup: "economy",
    enabled: true
  },
  {
    id: "CORE_SCHOLAR_EYE",
    kind: "core",
    jpName: "学者の眼",
    desc: "図鑑未登録の敵から素材が必ずドロップする。",
    slot: "accessory",
    cost: 10,
    params: { guaranteedMaterialDrop: true },
    buildRole: "pivot",
    buildAxis: "auxiliary",
    poolGroup: "economy",
    enabled: true
  }
];

const AFFIX_BY_ID = new Map(
  [...SUPPORT_AFFIXES, ...CORE_AFFIXES].map(affix => [affix.id, affix])
);

export function getAffixDefinition(affixOrId) {
  const id = typeof affixOrId === "object"
    ? (affixOrId.id || affixOrId.type)
    : affixOrId;
  return AFFIX_BY_ID.get(id) || null;
}

export function getAffixKind(affixOrId) {
  const definition = getAffixDefinition(affixOrId);
  return definition?.enabled ? definition.kind : null;
}

export function formatAffixText(affix, supportSeparator = ": ") {
  const definition = getAffixDefinition(affix);
  if (!definition?.enabled) {
    return "（現行対象外の特性）";
  }
  if (definition.kind === "core") {
    return `◆${definition.jpName}: ${definition.desc || "特殊効果"}`;
  }
  const label = definition.jpName;
  const sign = affix.value >= 0 ? "+" : "";
  const unit = definition.unit || "";
  const valueText = unit === "Lv" ? affix.value : `${sign}${affix.value}`;
  return `${label}${supportSeparator}${valueText}${unit}`;
}

export function getAffixBudget(rarity, floor) {
  const table = AFFIX_BALANCE.budgetsByRarityAndFloor[rarity]
    || AFFIX_BALANCE.budgetsByRarityAndFloor.magic;
  const normalizedFloor = Math.max(1, Math.min(5, floor || 1));
  return table[normalizedFloor];
}

export function getSupportValueByRarity(type, rarity) {
  const values = AFFIX_BALANCE.supportValuesByRarity[type];
  return values?.[rarity] ?? values?.magic ?? 1;
}
