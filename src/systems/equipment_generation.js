import { ITEMS, CURSE_EFFECTS } from "../data/items.js";
import { ACCESSORY_CANDIDATES_BY_FLOOR, EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../data/equipment_tables.js";
import {
  AFFIX_BALANCE,
  CORE_AFFIXES,
  SUPPORT_AFFIXES,
  getLootBuildRoleForRoll,
  getAffixBudget,
  getSupportValueByRarity
} from "../data/affixes.js";
import {
  IDENTIFICATION_BALANCE,
  getIdentificationGambleProfile
} from "../rules/identification_rules.js";
import { recordRuntimeCall } from "../runtime_diagnostics.js";

const SUPPORT_AFFIX_BY_TYPE = new Map(SUPPORT_AFFIXES.map(affix => [affix.type, affix]));
// Workshop pool nodes intentionally gate pre-existing core IDs to make the
// added nodes a real material sink. Blood Wand keeps its existing gate; a
// missing party context keeps this low-level generator backward-compatible for
// standalone loot generation and tests.
const WORKSHOP_LOCKED_AFFIX_IDS = new Set([
  "CORE_BLOOD_WAND",
  "CORE_OPENER",
  "CORE_TRAP_EATER",
  "CORE_GIANT_SLAYER",
  "CORE_THORN_SHIELD",
  "CORE_TOMB_RAIDER",
  "CORE_SCHOLAR_EYE",
  "CORE_MILESTONE_BREAKER",
  "CORE_THIN_ICE_PACT"
]);

function requireGenerationOptions(options, functionName) {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`${functionName} requires an options object; positional arguments are not supported`);
  }
  return options;
}

export function pickCurseEffectId(rng, heavyCurseShare) {
  const curseEffectIds = Object.keys(CURSE_EFFECTS);
  const heavyCurseIds = curseEffectIds.filter(id => CURSE_EFFECTS[id].heavy);
  const normalCurseIds = curseEffectIds.filter(id => !CURSE_EFFECTS[id].heavy);
  const pool = rng() < heavyCurseShare ? heavyCurseIds : normalCurseIds;
  return pool[Math.floor(rng() * pool.length)];
}

export function rollLootBuildRole(floor = 1, rng = Math.random) {
  return getLootBuildRoleForRoll(floor, rng());
}

export function rollAffixes(pool, count, rng = Math.random, budget = Infinity) {
  const affixes = [];
  const selectedIds = new Set();
  let remainingBudget = budget;

  for (let i = 0; i < count; i++) {
    const available = pool.filter(aff => {
      const id = aff.id || aff.type;
      return !selectedIds.has(id) && (aff.cost || 0) <= remainingBudget;
    });
    if (available.length === 0) break;
    const totalWeight = available.reduce((sum, aff) => sum + aff.weight, 0);
    let roll = rng() * totalWeight;
    const chosen = available.find(aff => {
      roll -= aff.weight;
      return roll <= 0;
    }) || available[available.length - 1];
    affixes.push({
      id: chosen.id || chosen.type,
      kind: chosen.kind || "support",
      type: chosen.type || chosen.id,
      value: chosen.getVal ? chosen.getVal() : (chosen.value ?? 1),
      buildRole: chosen.buildRole || null
    });
    selectedIds.add(chosen.id || chosen.type);
    remainingBudget -= chosen.cost || 0;
  }

  return affixes;
}

function withSupportDefinition(candidate) {
  const definition = SUPPORT_AFFIX_BY_TYPE.get(candidate.type);
  if (!definition?.enabled) return null;
  return {
    ...candidate,
    id: definition.id,
    kind: definition.kind,
    cost: definition.cost,
    buildRole: definition.buildRole
  };
}

function rollAffixLoadout(supportPool, slot, rarity, floor, rng, source, allowCores, unlockedAffixIds, party = null) {
  const budget = getAffixBudget(rarity, floor);
  const poolWeights = floor <= AFFIX_BALANCE.corePoolWeights.shallowMaxFloor
    ? AFFIX_BALANCE.corePoolWeights.shallow
    : AFFIX_BALANCE.corePoolWeights.deep;
  const corePool = allowCores ? CORE_AFFIXES
    .filter(affix => affix.enabled
      && affix.slot === slot
      && affix.cost <= budget
      && (!affix.allowedClasses
        || !party?.length
        || !party.some(char => char?.status !== "dead")
        || party.some(char => char?.status !== "dead" && affix.allowedClasses.includes(char.class)))
      && (
        !WORKSHOP_LOCKED_AFFIX_IDS.has(affix.id) ||
        !Array.isArray(unlockedAffixIds) ||
        unlockedAffixIds.includes(affix.id)
      ))
    .map(affix => ({
      ...affix,
      type: affix.id,
      value: 1,
      buildRole: affix.buildRole,
      weight: poolWeights[affix.poolGroup] || 1
    })) : [];

  if (corePool.length === 0) {
    const count = AFFIX_BALANCE.legacySupportCounts[source][rarity] || 1;
    return rollAffixes(supportPool, count, rng, budget);
  }

  const composition = AFFIX_BALANCE.rollComposition[rarity]
    || AFFIX_BALANCE.rollComposition.magic;
  if (typeof composition.coreChance === "number") {
    if (rng() >= composition.coreChance) {
      return rollAffixes(supportPool, composition.support, rng, budget);
    }
    return rollAffixes(corePool, Math.max(1, composition.core || 1), rng, budget);
  }

  const coreCount = Math.max(0, composition.core || 0);
  const coreAffixes = coreCount > 0
    ? rollAffixes(corePool, coreCount, rng, budget)
    : [];
  const remainingBudget = budget - coreAffixes.reduce((sum, affix) => {
    return sum + (CORE_AFFIXES.find(definition => definition.id === affix.id)?.cost || 0);
  }, 0);
  const supportAffixes = rollAffixes(supportPool, composition.support, rng, remainingBudget);
  return [...coreAffixes, ...supportAffixes];
}

export function buildUnidentifiedMeta(
  tags,
  rarity,
  typeName,
  rng = Math.random,
  { curseEffectId = null, curseDetectChance = 1 } = {}
) {
  const nonCurseTags = tags.filter(t => t !== "curse");
  const hintTags = [];
  if (nonCurseTags.length > 0) {
    const t1 = nonCurseTags[Math.floor(rng() * nonCurseTags.length)];
    hintTags.push(t1);
    if (nonCurseTags.length > 1 && rng() < 0.5) {
      const t2 = nonCurseTags.find(t => t !== t1);
      if (t2) hintTags.push(t2);
    }
  }

  let prefix = "古びた";
  if (rarity === "rare") {
    prefix = "金紋の";
  } else if (rarity === "epic") {
    prefix = "紫光を放つ";
  }

  const suspicionRoll = rng();
  return {
    hintTags,
    curseSuspected: curseEffectId
      ? suspicionRoll < curseDetectChance
      : suspicionRoll < 0.20,
    unidentifiedName: `${prefix}未鑑定の${typeName}`
  };
}

export function generateRandomEquipment(floor, options) {
  const { forceRarity = null, rng = Math.random, party = null, excludeHighEnd = false, allowCores = true, runtimeDiagnostics = null } =
    requireGenerationOptions(options, "generateRandomEquipment");
  recordRuntimeCall(runtimeDiagnostics, "equipment.generate", { kind: "equipment", floor });
  const gambleProfile = getIdentificationGambleProfile(floor);
  const candidateFloor = Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1));
  let baseCandidates = EQUIPMENT_CANDIDATES_BY_FLOOR[candidateFloor]
    || EQUIPMENT_CANDIDATES_BY_FLOOR[30];

  // 通常チェストなど高級ベースを出したくないソースでは除外する。
  if (excludeHighEnd) {
    baseCandidates = baseCandidates.filter(baseId => !RESTRICTED_CHEST_BASES.includes(baseId));
  }

  if (party && party.length > 0) {
    const livingParty = party.filter(char => char.status !== "dead");
    let usableCandidates = baseCandidates.filter(baseId => {
      const item = ITEMS[baseId];
      if (!item) return false;
      return livingParty.some(char => {
        return !item.classes || item.classes.includes(char.class);
      });
    });

    if (usableCandidates.length > 0) {
      baseCandidates = usableCandidates;
    }
  }

  // Consume the historical pre-selection roll to keep seeded streams stable.
  // Candidate selection is intentionally independent of the current loadout.
  rng();
  const baseRoll = rng();
  let baseId = baseCandidates[Math.floor(baseRoll * baseCandidates.length)];
  let baseItem = ITEMS[baseId];
  if (!baseItem) return null;
  
  let rarity = "magic";
  if (forceRarity) {
    rarity = forceRarity;
  } else {
    const roll = rng();
    const epicChance = gambleProfile.epicChance;
    const rareChance = gambleProfile.rareChance;
    if (roll < epicChance) rarity = "epic";
    else if (roll < rareChance) rarity = "rare";
    else rarity = "magic";
  }

  const buildRole = getLootBuildRoleForRoll(floor, baseRoll);
  
  const possibleAffixes = [];
  const addAffix = (minFloor, type, getVal, weight = 3) => {
    if (floor < minFloor) return;
    const candidate = withSupportDefinition({ type, getVal, weight });
    if (candidate) possibleAffixes.push(candidate);
  };

  if (baseItem.type === "weapon") {
    addAffix(1, "atk", () => getSupportValueByRarity("atk", rarity));
  }
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix(1, "def", () => getSupportValueByRarity("def", rarity));
  }
  addAffix(1, "hp", () => getSupportValueByRarity("hp", rarity));

  const isMpEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "ROBE", "PRIEST_ROBE", "MAGE_CLOAK", "ARCANE_ROBE", "SORCERER_ROBE"].includes(baseId);
  if (isMpEligible) {
    addAffix(1, "mp", () => getSupportValueByRarity("mp", rarity));
  }

  const stats = ["str", "int", "pie", "vit", "agi", "luk"];
  stats.forEach(stat => {
    addAffix(1, stat, () => getSupportValueByRarity(stat, rarity));
  });
  
  const isTrapEligible = ["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "RAPIER", "LEATHER_ARMOR", "NINJA_SUIT", "EXPLORER_CLOAK", "BUCKLER"].includes(baseId);
  if (isTrapEligible) {
    addAffix(1, "trapBonus", () => getSupportValueByRarity("trapBonus", rarity), 3);
  }

  const isFollowUpEligible = ["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "SHORT_SWORD", "RAPIER", "FLAME_SWORD", "BATTLE_GARB"].includes(baseId);
  if (isFollowUpEligible) {
    addAffix(2, "followUp", () => Math.floor(rng() * 6) + 10, 2); // 10-15%
  }
  const isArcaneEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneEligible) {
    addAffix(2, "arcane", () => 15, 2); // +15%
  }
  const isSpellPowerEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isSpellPowerEligible) {
    addAffix(2, "spellPower", () => AFFIX_BALANCE.spellPowerByRarity[rarity], 2);
  }
  const isDevotionEligible = ["MACE", "PRIEST_ROBE", "SACRED_MACE", "HOLY_STAFF"].includes(baseId);
  if (isDevotionEligible) {
    addAffix(2, "devotion", () => 15, 2); // +15%
  }
  const isGuardianEligible = ["SMALL_SHIELD", "LARGE_SHIELD", "KNIGHT_SHIELD", "LEGENDARY_SHIELD", "PLATE_MAIL", "CHAIN_MAIL", "SCALE_MAIL", "BUCKLER", "MAGIC_SHIELD", "DRAGON_SCALE"].includes(baseId);
  if (isGuardianEligible) {
    addAffix(3, "guardian", () => 15, 2); // -15%
  }
  const isTreasureSenseEligible = ["LEATHER_ARMOR", "NINJA_SUIT", "DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "SHORT_SWORD", "RAPIER", "BUCKLER", "EXPLORER_CLOAK"].includes(baseId);
  if (isTreasureSenseEligible) {
    addAffix(3, "treasureSense", () => getSupportValueByRarity("treasureSense", rarity), 1);
  }
  const isHearEligible = ["EXPLORER_CLOAK", "NINJA_SUIT", "LEATHER_ARMOR", "BUCKLER"].includes(baseId);
  if (isHearEligible) {
    addAffix(1, "hearRange", () => getSupportValueByRarity("hearRange", rarity), 1);
  }
  const isArcaneSenseEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneSenseEligible) {
    addAffix(1, "arcaneSense", () => getSupportValueByRarity("arcaneSense", rarity), 1);
  }
  const isTraceReadEligible = ["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "RAPIER", "EXPLORER_CLOAK", "NINJA_SUIT", "BUCKLER"].includes(baseId);
  if (isTraceReadEligible) {
    addAffix(1, "traceRead", () => getSupportValueByRarity("traceRead", rarity), 1);
  }
  if (["SACRED_MACE", "MACE", "HOLY_STAFF"].includes(baseId)) {
    addAffix(3, "antiUndead", () => getSupportValueByRarity("antiUndead", rarity), 1);
  }
  if (baseId === "DRAGON_SCALE") {
    addAffix(4, "antiDragon", () => getSupportValueByRarity("antiDragon", rarity), 1);
  }
  if (["MAGIC_SHIELD", "ARCH_WAND", "ARCANE_ROBE", "SORCERER_ROBE", "DRAGON_SCALE"].includes(baseId)) {
    addAffix(3, "spellGuard", () => getSupportValueByRarity("spellGuard", rarity), 1);
  }
  if (baseId === "EXPLORER_CLOAK") {
    addAffix(2, "poisonWard", () => getSupportValueByRarity("poisonWard", rarity), 1);
  }
  if (["RAPIER", "NINJA_BLADE", "MOONSHADOW", "BATTLE_GARB"].includes(baseId)) {
    addAffix(4, "firstStrike", () => getSupportValueByRarity("firstStrike", rarity), 1);
  }
  addAffix(3, "deepAssault", () => getSupportValueByRarity("deepAssault", rarity), 2);
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix(1, "frontGuard", () => getSupportValueByRarity("frontGuard", rarity), 2);
    addAffix(2, "rearEvasion", () => getSupportValueByRarity("rearEvasion", rarity), 2);
    addAffix(2, "firstStrikeDefense", () => getSupportValueByRarity("firstStrikeDefense", rarity), 1);
  }
  if (baseItem.type === "weapon") {
    addAffix(2, "fullHpDamage", () => getSupportValueByRarity("fullHpDamage", rarity), 2);
    addAffix(1, "firstTurnAttack", () => getSupportValueByRarity("firstTurnAttack", rarity), 2);
    addAffix(2, "antiBeast", () => getSupportValueByRarity("antiBeast", rarity), 1);
    addAffix(2, "antiSpirit", () => getSupportValueByRarity("antiSpirit", rarity), 1);
    // #271実src N=8,000: B5装備2.0%、職内r=0.065 [0.027, 0.103]、event勝率4.9%→4.8%。
    addAffix(2, "antiDemon", () => getSupportValueByRarity("antiDemon", rarity), 1);
    addAffix(3, "spellAccuracy", () => getSupportValueByRarity("spellAccuracy", rarity), 1);
    addAffix(3, "killHeal", () => 2, 1);
    addAffix(3, "followUpMp", () => 1, 1);
    addAffix(3, "hitFlinch", () => getSupportValueByRarity("hitFlinch", rarity), 1);
    // #313: 前衛が自力で状態異常を撒ける唯一の手段。執行人の前提でもある。
    addAffix(3, "poisonAtk", () => getSupportValueByRarity("poisonAtk", rarity), 1);
    // #793: the single Phase 1 bleeding producer remains weapon-only and
    // follows the existing poison trigger pool without repurposing poisonAtk.
    addAffix(3, "bleedingAtk", () => getSupportValueByRarity("bleedingAtk", rarity), 1);
  }
  addAffix(3, "lastSurvivorStats", () => getSupportValueByRarity("lastSurvivorStats", rarity), 1);
  addAffix(2, "statusResistance", () => getSupportValueByRarity("statusResistance", rarity), 2);
  addAffix(2, "victoryMaterial", () => 5, 1);
  addAffix(1, "stairsHeal", () => getSupportValueByRarity("stairsHeal", rarity), 1);
  addAffix(1, "identifyDiscount", () => 10, 2);
  addAffix(1, "materialFind", () => 10, 2);
  addAffix(1, "contractReward", () => 10, 2);
  
  const unlockedAffixIds = party?.[0]?.unlockedAffixIds;
  const affixes = rollAffixLoadout(possibleAffixes, baseItem.type, rarity, floor, rng, "equipment", allowCores, unlockedAffixIds, party);

  // #311: コアは誰も装備できないベースに乗ると丸ごと死ぬ。職業ごとの装備制限そのものは
  // 個性として残し、コアが付いたときだけベースを同スロットの装備可能候補へ寄せる。
  if (party?.length > 0 && affixes.some(affix => affix.kind === "core")) {
    const livingParty = party.filter(char => char.status !== "dead");
    const usableByParty = item =>
      !item.classes || livingParty.some(char => item.classes.includes(char.class));
    if (livingParty.length > 0 && !usableByParty(baseItem)) {
      const sameSlotUsable = baseCandidates.filter(candidateId => {
        const candidate = ITEMS[candidateId];
        return candidate && candidate.type === baseItem.type && usableByParty(candidate);
      });
      if (sameSlotUsable.length > 0) {
        baseId = sameSlotUsable[Math.floor(rng() * sameSlotUsable.length)];
        baseItem = ITEMS[baseId];
      }
    }
  }
  
  const instanceId = `eq_${rng().toString(36).substr(2, 9)}`;

  // tags, curse, unidentified information generation
  const baseItemTags = baseItem.tags || [];
  const tags = [...baseItemTags];
  
  // Add tags based on affixes
  affixes.forEach(aff => {
    if (aff.type === "atk" || aff.type === "str") {
      if (!tags.includes("blade")) tags.push("blade");
    }
    if (aff.type === "def" || aff.type === "vit") {
      if (!tags.includes("ward")) tags.push("ward");
    }
    if (aff.type === "trapBonus") {
      if (!tags.includes("poison")) tags.push("poison");
    }
    if (aff.type === "hearRange" && !tags.includes("search")) tags.push("search");
    if (aff.type === "arcaneSense" && !tags.includes("analysis")) tags.push("analysis");
    if (aff.type === "traceRead" && !tags.includes("trap")) tags.push("trap");
  });

  let curseEffectId = null;
  const isKatanaOrSealed = baseId === "KATANA" || baseId === "SEALED_EXCALIBUR";
  const rollCurse = rng();
  const hasCoreAffix = affixes.some(affix => affix.kind === "core");
  const curseChance = Math.min(
    IDENTIFICATION_BALANCE.maxCurseChance,
    gambleProfile.curseChance + (hasCoreAffix ? IDENTIFICATION_BALANCE.coreCurseBonus : 0)
  );
  if (isKatanaOrSealed || rollCurse < curseChance) {
    curseEffectId = pickCurseEffectId(rng, gambleProfile.heavyCurseShare);
    if (!tags.includes("curse")) tags.push("curse");
    CURSE_EFFECTS[curseEffectId].tags.forEach(t => {
      if (!tags.includes(t)) tags.push(t);
    });
  }

  let prefix = "古びた";
  if (rarity === "magic") {
    const isMagicAura = ["WAND", "SAGE_STAFF", "ARCH_WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
    prefix = isMagicAura ? "青く光る" : "古びた";
  } else if (rarity === "rare") {
    prefix = "金紋の";
  } else if (rarity === "epic") {
    prefix = "紫光を放つ";
  }

  let typeName = "武器";
  if (baseItem.type === "shield") {
    typeName = baseId === "BUCKLER" ? "小盾" : (baseId === "MAGIC_SHIELD" ? "魔盾" : "盾");
  } else if (baseItem.type === "armor") {
    const isRobe = ["ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE"].includes(baseId);
    typeName = isRobe ? "ローブ" : (baseId === "EXPLORER_CLOAK" ? "外套" : (baseId === "BATTLE_GARB" ? "戦装束" : (baseId === "DRAGON_SCALE" ? "鱗鎧" : "鎧")));
  } else if (baseItem.type === "weapon") {
    if (["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF"].includes(baseId)) typeName = "杖";
    else if (baseId === "RAPIER") typeName = "細剣";
    else if (baseId === "SACRED_MACE") typeName = "聖器";
    else if (["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "SHORT_SWORD"].includes(baseId)) typeName = "短剣";
    else if (["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "NINJA_BLADE", "MOONSHADOW", "FLAME_SWORD"].includes(baseId)) typeName = "剣";
    else if (baseId === "MACE") typeName = "メイス";
  }
  const meta = buildUnidentifiedMeta(tags, rarity, typeName, rng, {
    curseEffectId,
    curseDetectChance: gambleProfile.curseDetectChance
  });
  meta.unidentifiedName = `${prefix}${baseItem.name}（未鑑定・${typeName}）`;

  return {
    kind: "equipment",
    instanceId,
    baseId,
    rarity,
    level: floor,
    identified: false,
    halfIdentified: false,
    tags,
    hintTags: meta.hintTags,
    curseEffectId,
    cursePower: gambleProfile.cursePower,
    curseSuspected: meta.curseSuspected,
    unidentifiedName: meta.unidentifiedName,
    affixes,
    buildRole,
    buildRoles: [...new Set(affixes.map(affix => affix.buildRole).filter(Boolean))]
  };
}

export function generateRandomAccessory(floor, options) {
  const { forceRarity = null, rng = Math.random, party = null, allowCores = true, runtimeDiagnostics = null } =
    requireGenerationOptions(options, "generateRandomAccessory");
  recordRuntimeCall(runtimeDiagnostics, "equipment.generate", { kind: "accessory", floor });
  const gambleProfile = getIdentificationGambleProfile(floor);
  const candidateFloor = Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1));
  let baseCandidates = ACCESSORY_CANDIDATES_BY_FLOOR[candidateFloor]
    || ACCESSORY_CANDIDATES_BY_FLOOR[30];

  if (party && party.length > 0) {
    const livingParty = party.filter(char => char.status !== "dead");
    const usableCandidates = baseCandidates.filter(baseId => {
      const item = ITEMS[baseId];
      return item && livingParty.some(char => !item.classes || item.classes.includes(char.class));
    });
    if (usableCandidates.length > 0) {
      baseCandidates = usableCandidates;
    }
  }

  const baseRoll = rng();
  const baseId = baseCandidates[Math.floor(baseRoll * baseCandidates.length)];
  const baseItem = ITEMS[baseId];
  if (!baseItem) return null;

  let rarity = "magic";
  if (forceRarity) {
    rarity = forceRarity;
  } else {
    const roll = rng();
    const epicChance = gambleProfile.epicChance;
    const rareChance = gambleProfile.rareChance;
    if (roll < epicChance) rarity = "epic";
    else if (roll < rareChance) rarity = "rare";
  }

  const buildRole = getLootBuildRoleForRoll(floor, baseRoll);

  const availableWeight = (minFloor, weight) => floor >= minFloor ? weight : 0;
  const accessoryAffixPool = [
    { type: "hp", getVal: () => getSupportValueByRarity("hp", rarity), weight: 4 },
    { type: "mp", getVal: () => getSupportValueByRarity("mp", rarity), weight: 3 },
    { type: "str", getVal: () => getSupportValueByRarity("str", rarity), weight: 2 },
    { type: "int", getVal: () => getSupportValueByRarity("int", rarity), weight: 2 },
    { type: "pie", getVal: () => getSupportValueByRarity("pie", rarity), weight: 2 },
    { type: "vit", getVal: () => getSupportValueByRarity("vit", rarity), weight: 2 },
    { type: "agi", getVal: () => getSupportValueByRarity("agi", rarity), weight: 2 },
    { type: "luk", getVal: () => getSupportValueByRarity("luk", rarity), weight: 2 },
    { type: "trapBonus", getVal: () => getSupportValueByRarity("trapBonus", rarity), weight: 3 },
    { type: "spellGuard", getVal: () => getSupportValueByRarity("spellGuard", rarity), weight: 1 },
    { type: "antiDragon", getVal: () => getSupportValueByRarity("antiDragon", rarity), weight: availableWeight(4, 1) },
    { type: "antiUndead", getVal: () => getSupportValueByRarity("antiUndead", rarity), weight: availableWeight(3, 1) },
    { type: "antiDemon", getVal: () => getSupportValueByRarity("antiDemon", rarity), weight: availableWeight(2, 1) },
    { type: "poisonWard", getVal: () => getSupportValueByRarity("poisonWard", rarity), weight: 1 },
    { type: "treasureSense", getVal: () => getSupportValueByRarity("treasureSense", rarity), weight: 1 },
    { type: "hearRange", getVal: () => getSupportValueByRarity("hearRange", rarity), weight: 2 },
    { type: "arcaneSense", getVal: () => getSupportValueByRarity("arcaneSense", rarity), weight: 2 },
    { type: "spellPower", getVal: () => AFFIX_BALANCE.spellPowerByRarity[rarity], weight: availableWeight(2, 2) },
    { type: "traceRead", getVal: () => getSupportValueByRarity("traceRead", rarity), weight: 2 },
    { type: "deepAssault", getVal: () => getSupportValueByRarity("deepAssault", rarity), weight: availableWeight(3, 2) },
    { type: "fullHpDamage", getVal: () => getSupportValueByRarity("fullHpDamage", rarity), weight: availableWeight(2, 2) },
    { type: "antiBeast", getVal: () => getSupportValueByRarity("antiBeast", rarity), weight: availableWeight(2, 1) },
    { type: "antiSpirit", getVal: () => getSupportValueByRarity("antiSpirit", rarity), weight: availableWeight(2, 1) },
    { type: "lastSurvivorStats", getVal: () => getSupportValueByRarity("lastSurvivorStats", rarity), weight: availableWeight(3, 1) },
    { type: "statusResistance", getVal: () => getSupportValueByRarity("statusResistance", rarity), weight: availableWeight(2, 2) },
    { type: "spellAccuracy", getVal: () => getSupportValueByRarity("spellAccuracy", rarity), weight: availableWeight(3, 1) },
    { type: "killHeal", getVal: () => 2, weight: availableWeight(3, 1) },
    { type: "followUpMp", getVal: () => 1, weight: availableWeight(3, 1) },
    { type: "hitFlinch", getVal: () => getSupportValueByRarity("hitFlinch", rarity), weight: availableWeight(3, 1) },
    { type: "victoryMaterial", getVal: () => 5, weight: availableWeight(2, 1) },
    { type: "stairsHeal", getVal: () => getSupportValueByRarity("stairsHeal", rarity), weight: 1 },
    { type: "identifyDiscount", getVal: () => 10, weight: 2 },
    { type: "materialFind", getVal: () => 10, weight: 2 },
    { type: "contractReward", getVal: () => 10, weight: 2 }
  ].filter(aff => aff.weight > 0)
    .map(withSupportDefinition)
    .filter(Boolean);

  const unlockedAffixIds = party?.[0]?.unlockedAffixIds;
  const affixes = rollAffixLoadout(accessoryAffixPool, "accessory", rarity, floor, rng, "accessory", allowCores, unlockedAffixIds, party);
  const tags = [...(baseItem.tags || [])];
  affixes.forEach(aff => {
    const affixTags = {
      hp: "ward",
      mp: "spirit",
      str: "iron",
      int: "analysis",
      pie: "holy",
      vit: "ward",
      agi: "ambush",
      luk: "search",
      trapBonus: "trap",
      spellGuard: "ward",
      antiDragon: "dragon",
      antiUndead: "holy",
      poisonWard: "poison",
      treasureSense: "search",
      hearRange: "search",
      arcaneSense: "analysis",
      traceRead: "trap"
    };
    const tag = affixTags[aff.type];
    if (tag && !tags.includes(tag)) tags.push(tag);
  });

  const hasCoreAffix = affixes.some(affix => affix.kind === "core");
  let curseEffectId = null;
  const curseChance = Math.min(
    IDENTIFICATION_BALANCE.maxCurseChance,
    gambleProfile.curseChance + (hasCoreAffix ? IDENTIFICATION_BALANCE.coreCurseBonus : 0)
  );
  if (rng() < curseChance) {
    curseEffectId = pickCurseEffectId(rng, gambleProfile.heavyCurseShare);
    if (!tags.includes("curse")) tags.push("curse");
    CURSE_EFFECTS[curseEffectId].tags.forEach(tag => {
      if (!tags.includes(tag)) tags.push(tag);
    });
  }

  let typeName = "装身具";
  if (baseId.includes("RING")) {
    typeName = "指輪";
  } else if (baseId.includes("BAND")) {
    typeName = "腕輪";
  } else if (baseId.includes("AMULET") || baseId.includes("CHARM")) {
    typeName = "護符";
  }

  const meta = buildUnidentifiedMeta(tags, rarity, typeName, rng, {
    curseEffectId,
    curseDetectChance: gambleProfile.curseDetectChance
  });
  meta.unidentifiedName = `${baseItem.name}（未鑑定・${typeName}）`;

  return {
    kind: "equipment",
    instanceId: `eq_${rng().toString(36).substr(2, 9)}`,
    baseId,
    rarity,
    level: floor,
    identified: false,
    halfIdentified: false,
    tags,
    hintTags: meta.hintTags,
    curseEffectId,
    cursePower: gambleProfile.cursePower,
    curseSuspected: meta.curseSuspected,
    unidentifiedName: meta.unidentifiedName,
    affixes,
    buildRole,
    buildRoles: [...new Set(affixes.map(affix => affix.buildRole).filter(Boolean))]
  };
}
