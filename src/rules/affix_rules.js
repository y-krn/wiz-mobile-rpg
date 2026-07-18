import { getAffixDefinition } from "../data/affixes.js";
import { getCharAffixSum } from "./item_rules.js";

const halveMultiplier = value => 1 + (value - 1) / 2;
const halveConstant = value => Math.floor(value / 2);

const CORE_SEAL_RULES = {
  CORE_LAST_STAND: params => ({ ...params, damageMultiplier: halveMultiplier(params.damageMultiplier) }),
  CORE_OPENER: params => ({ ...params, followUpChance: params.followUpChance / 2 }),
  CORE_BLOOD_WAND: params => ({ ...params, hpCostMultiplier: params.hpCostMultiplier * 2 }),
  CORE_PURIFY_RING: () => null,
  CORE_TRAP_EATER: params => ({
    ...params,
    attackPerDisarm: halveConstant(params.attackPerDisarm),
    maxAttack: halveConstant(params.maxAttack)
  }),
  CORE_CURSE_KEEPER: params => ({ ...params, statsPerCurse: halveConstant(params.statsPerCurse) }),
  CORE_GIANT_SLAYER: params => ({ ...params, damageMultiplier: halveMultiplier(params.damageMultiplier) }),
  CORE_REARGUARD: () => null,
  CORE_THORN_SHIELD: params => ({
    ...params,
    counterChance: params.counterChance / 2,
    counterPower: params.counterPower / 2
  }),
  CORE_EXECUTIONER: params => ({ ...params, damageMultiplier: halveMultiplier(params.damageMultiplier) }),
  CORE_SNEAK_STEP: params => ({
    ...params,
    detectionRangeMultiplier: halveMultiplier(params.detectionRangeMultiplier),
    auraRangeBonus: halveConstant(params.auraRangeBonus)
  }),
  CORE_TOMB_RAIDER: () => null,
  CORE_KEEN_EYE: () => null,
  CORE_CAMP_MASTER: params => ({ ...params, recoveryMultiplier: halveMultiplier(params.recoveryMultiplier) }),
  CORE_BOUNTY_HUNTER: () => null,
  CORE_SCHOLAR_EYE: () => null
};

export function getSealedCoreParams(coreId, params) {
  if (!params) return null;
  return CORE_SEAL_RULES[coreId]?.(params) ?? null;
}

function getEquippedCoreEntries(char, { activeOnly = true } = {}) {
  if (!char?.equipment) return [];
  return Object.values(char.equipment).flatMap(item => {
    if (!item || typeof item !== "object" || (activeOnly && !item.identified)) return [];
    return (item.affixes || []).flatMap(affix => {
      const definition = getAffixDefinition(affix);
      const isCore = (affix.kind || definition?.kind) === "core" && definition?.enabled;
      return isCore ? [{ affix, item }] : [];
    });
  });
}

export function getEquippedCoreAffixes(char, { activeOnly = true } = {}) {
  return getEquippedCoreEntries(char, { activeOnly }).map(entry => entry.affix);
}

export function hasCoreAffix(item) {
  if (!item || typeof item !== "object") return false;
  return (item.affixes || []).some(affix => {
    const definition = getAffixDefinition(affix);
    return (affix.kind || definition?.kind) === "core";
  });
}

export function canEquipCoreAffix(char, item, slot) {
  if (!hasCoreAffix(item)) return true;
  return Object.entries(char?.equipment || {}).every(([equippedSlot, equippedItem]) => {
    return equippedSlot === slot || !hasCoreAffix(equippedItem);
  });
}

export function getCharCoreAffix(char, coreId) {
  return getEquippedCoreAffixes(char).find(affix => (affix.id || affix.type) === coreId) || null;
}

export function getCharCoreDefinition(char, coreId) {
  return getCharCoreAffix(char, coreId) ? getAffixDefinition(coreId) : null;
}

export function getCharCoreParams(char, coreId) {
  const entry = getEquippedCoreEntries(char).find(({ affix }) => (affix.id || affix.type) === coreId);
  if (!entry) return null;
  const params = getAffixDefinition(coreId)?.params || null;
  return entry.item.coreSealed ? getSealedCoreParams(coreId, params) : params;
}

export function partyHasCoreAffix(party, coreId) {
  if (!Array.isArray(party)) return false;
  return party.some(char => {
    if (!char || char.hp <= 0 || ["dead", "ash"].includes(char.status)) return false;
    return Boolean(getCharCoreAffix(char, coreId));
  });
}

export function getPartyCoreParams(party, coreId) {
  if (!Array.isArray(party)) return null;
  const wearer = party.find(char => {
    if (!char || char.hp <= 0 || ["dead", "ash"].includes(char.status)) return false;
    return Boolean(getCharCoreAffix(char, coreId));
  });
  return wearer ? getCharCoreParams(wearer, coreId) : null;
}

export function canEquipUnidentifiedItem(char, item) {
  return Boolean(char) && Boolean(item);
}

export function hasHiddenEquipmentEffects(char) {
  if (!getCharCoreParams(char, "CORE_KEEN_EYE")) return false;
  return Object.values(char?.equipment || {}).some(item => item && typeof item === "object" && !item.identified);
}

export function getContractProgressIncrement(party, baseCount = 1) {
  const params = getPartyCoreParams(party, "CORE_BOUNTY_HUNTER");
  return baseCount * (params?.contractCountMultiplier || 1);
}

export function getEquippedCurseCount(char) {
  if (!char?.equipment) return 0;
  return Object.values(char.equipment).filter(item => {
    return item && typeof item === "object" && Boolean(item.curseEffectId);
  }).length;
}

export function getCharAllStatsAffixBonus(char) {
  let bonus = char?.combatLastSurvivor ? getCharAffixSum(char, "lastSurvivorStats") : 0;
  const params = getCharCoreParams(char, "CORE_CURSE_KEEPER");
  if (params) bonus += getEquippedCurseCount(char) * params.statsPerCurse;
  return bonus;
}

export function getDamageAffixResult(char, target, damage, { floor = 1, maxHp = char.maxHp } = {}) {
  let multiplier = 1;
  const coreIds = [];

  const lastStand = getCharCoreParams(char, "CORE_LAST_STAND");
  if (lastStand && char.hp / Math.max(1, maxHp) <= lastStand.hpThreshold) {
    multiplier *= lastStand.damageMultiplier;
    coreIds.push("CORE_LAST_STAND");
  }

  const giantSlayer = getCharCoreParams(char, "CORE_GIANT_SLAYER");
  if (giantSlayer && target?.maxHp > maxHp) {
    multiplier *= giantSlayer.damageMultiplier;
    coreIds.push("CORE_GIANT_SLAYER");
  }

  const executioner = getCharCoreParams(char, "CORE_EXECUTIONER");
  if (executioner && target?.status && !["ok", "dead"].includes(target.status)) {
    multiplier *= executioner.damageMultiplier;
    coreIds.push("CORE_EXECUTIONER");
  }

  let supportPercent = 0;
  if (floor >= 3) supportPercent += getCharAffixSum(char, "deepAssault");
  if (char.hp >= maxHp) supportPercent += getCharAffixSum(char, "fullHpDamage");
  if (target?.tags?.includes("beast")) supportPercent += getCharAffixSum(char, "antiBeast");
  if (target?.tags?.includes("spirit")) supportPercent += getCharAffixSum(char, "antiSpirit");
  multiplier *= 1 + supportPercent / 100;

  return {
    damage: Math.max(1, Math.round(damage * multiplier)),
    coreIds
  };
}

export function getSpellPayment(char, mpCost) {
  if (char.mp >= mpCost) {
    return { canCast: true, resource: "mp", cost: mpCost };
  }
  const params = getCharCoreParams(char, "CORE_BLOOD_WAND");
  if (!params) return { canCast: false, resource: "mp", cost: mpCost };
  const hpCost = mpCost * params.hpCostMultiplier;
  return {
    canCast: char.hp >= hpCost,
    resource: "hp",
    cost: hpCost
  };
}

export function paySpellCost(char, mpCost) {
  const payment = getSpellPayment(char, mpCost);
  if (!payment.canCast) return payment;
  if (payment.resource === "mp") char.mp -= payment.cost;
  else char.hp = Math.max(1, char.hp - payment.cost);
  return payment;
}

export function getStatusEffectChance(char, baseChance) {
  const resistance = Math.max(0, Math.min(100, getCharAffixSum(char, "statusResistance")));
  return Math.max(0, baseChance * (1 - resistance / 100));
}

export function getSpellAccuracyBonus(char) {
  return getCharAffixSum(char, "spellAccuracy") / 100;
}

export function getFollowUpChance(char, baseChance, firstStrikeSucceeded) {
  const opener = firstStrikeSucceeded ? getCharCoreParams(char, "CORE_OPENER") : null;
  return opener ? opener.followUpChance * 100 : baseChance;
}

export function getTrapEaterBonusAfterDisarm(char, currentBonus = 0) {
  const params = getCharCoreParams(char, "CORE_TRAP_EATER");
  if (!params) return currentBonus;
  return Math.min(params.maxAttack, currentBonus + params.attackPerDisarm);
}

export function getCoreLogText(coreId) {
  const name = getAffixDefinition(coreId)?.jpName || coreId;
  const messages = {
    CORE_LAST_STAND: "刃が燃え上がった！",
    CORE_OPENER: "先制の勢いで追撃した！",
    CORE_BLOOD_WAND: "生命を魔力へ変えた！",
    CORE_PURIFY_RING: "邪気を祓い、魔力を取り戻した！",
    CORE_TRAP_EATER: "罠の力を喰らい、攻撃力が増した！",
    CORE_CURSE_KEEPER: "呪いを飼い慣らし、力へ変えた！",
    CORE_GIANT_SLAYER: "巨躯を断つ一撃が冴えた！",
    CORE_REARGUARD: "後列から間合いを制した！",
    CORE_THORN_SHIELD: "棘が攻撃者へ牙を剥いた！",
    CORE_EXECUTIONER: "弱った敵へ執行の刃を振るった！",
    CORE_SNEAK_STEP: "気配を殺し、敵の感知を鈍らせた！",
    CORE_TOMB_RAIDER: "危険な罠ごと宝を奪い取った！",
    CORE_KEEN_EYE: "未知の装備の真価を引き出した！",
    CORE_CAMP_MASTER: "野営の知恵で回復を高めた！",
    CORE_BOUNTY_HUNTER: "契約対象を確実に仕留めた！",
    CORE_SCHOLAR_EYE: "未知の魔物から素材を見抜いた！"
  };
  return `[${name}] ${messages[coreId] || "コアが発動した！"}`;
}
