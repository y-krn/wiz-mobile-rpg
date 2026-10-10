import { ITEMS, CURSE_EFFECTS } from "../data/items.js";
import { ACCESSORY_CANDIDATES_BY_FLOOR, EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../data/equipment_tables.js";
import {
  AFFIX_BALANCE,
  BUILD_VNEXT_CORE_AFFIXES,
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
import { isEquipmentInstance } from "../state/equipment.js";
import {
  getVNextTrialCandidates,
  isVNextDevotionWeapon,
  isVNextMediumWeapon,
  isVNextTrialCore,
  isVNextTrialSupport
} from "../rules/equipment_vnext_trial.js";
import { BUILD_VNEXT_SUPPLY, applyBuildVNextSupply } from "../rules/build_vnext_supply.js";
import { getDungeonCurseRule, getDungeonFloor } from "../rules/dungeons.js";
import { getCoreIdsForFamilies } from "../rules/core_families.js";

// Supports that pay out in materials/quests/identification rather than in a
// fight. The Build vNext trial keeps them possible but rare so early finds
// read as combat choices.
const BUILD_VNEXT_ECONOMY_SUPPORTS = new Set([
  "identifyDiscount", "materialFind", "contractReward", "victoryMaterial"
]);
const BUILD_VNEXT_ECONOMY_WEIGHT = 0.25;

// A Core that random generation can hand out: enabled, kept by the trial,
// and not waiting for a Workshop unlock. With no unlock list (no party
// context) every Workshop Core counts as unlocked, as generation does.
function isGeneratableCore(affix, activeUnlocks) {
  return affix.enabled
    && (affix.trialOnly || isVNextTrialCore(affix.id))
    && (affix.trialOnly || !WORKSHOP_LOCKED_AFFIX_IDS.has(affix.id) || !activeUnlocks || activeUnlocks.has(affix.id));
}

/** Ids of the Cores random generation can hand out with these unlocks. */
export function getGeneratableCoreIds(unlockedAffixIds = null) {
  const activeUnlocks = Array.isArray(unlockedAffixIds) ? new Set(unlockedAffixIds) : null;
  return [...CORE_AFFIXES, ...BUILD_VNEXT_CORE_AFFIXES]
    .filter(affix => isGeneratableCore(affix, activeUnlocks))
    .map(affix => affix.id);
}

function rollBuildVNextAffixLoadout(supportPool, slot, rarity, floor, rng, lootRole, allowCores, unlockedAffixIds, forceCoreId = null, baseId = null, likelyCoreFamilies = null) {
  const budget = getAffixBudget(rarity, floor);
  const activeUnlocks = Array.isArray(unlockedAffixIds) ? new Set(unlockedAffixIds) : null;
  const eligibleSupports = supportPool.filter(affix => isVNextTrialSupport(affix.type, { slot, baseId }));
  const weightedSupports = eligibleSupports.map(affix => BUILD_VNEXT_ECONOMY_SUPPORTS.has(affix.type)
    ? { ...affix, weight: (affix.weight || 1) * BUILD_VNEXT_ECONOMY_WEIGHT }
    : affix);
  const supportCount = rarity === "magic" ? 1 : 2;
  const isMediumWeapon = slot === "weapon" && isVNextMediumWeapon(baseId);
  const isAllowedCoreForBase = coreId => (
    (coreId !== "CORE_BLOOD_WAND" || isMediumWeapon)
    && (coreId !== "CORE_TECH_CHAIN" || !isMediumWeapon)
  );
  const supports = rollAffixes(weightedSupports, supportCount, rng, budget, lootRole);
  if (forceCoreId) {
    const forced = [...CORE_AFFIXES, ...BUILD_VNEXT_CORE_AFFIXES].find(affix =>
      affix.id === forceCoreId && affix.enabled && affix.slot === slot && isAllowedCoreForBase(affix.id)
    );
    if (forced) {
      return [{ id: forced.id, kind: "core", type: forced.id, value: 1, buildRole: forced.buildRole || null }, ...supports];
    }
  }
  if (!allowCores || floor < BUILD_VNEXT_SUPPLY.coreMinFloor) return supports;
  // The run's likely Core families (#2061) weight which Core is chosen and
  // how often an item carries one. A run without them keeps the old roll.
  const likelyCoreIds = getCoreIdsForFamilies(likelyCoreFamilies);
  const likely = BUILD_VNEXT_SUPPLY.likelyFamily;
  const corePool = [...CORE_AFFIXES, ...BUILD_VNEXT_CORE_AFFIXES]
    .filter(affix => isGeneratableCore(affix, activeUnlocks)
      && affix.slot === slot
      && isAllowedCoreForBase(affix.id))
    .map(affix => ({
      ...affix,
      type: affix.id,
      value: 1,
      weight: (BUILD_VNEXT_SUPPLY.corePoolWeights[affix.poolGroup] || 1)
        * (likelyCoreIds?.has(affix.id) ? likely.choiceWeight : 1)
    }));
  if (corePool.length === 0) return supports;
  const coreChance = rarity === "epic" ? 1 : (BUILD_VNEXT_SUPPLY.coreChanceByRarity[rarity] ?? 0);
  if (!likelyCoreIds) {
    if (rng() >= coreChance) return supports;
    return [...rollAffixes(corePool, 1, rng, Infinity, lootRole), ...supports];
  }
  const [core] = rollAffixes(corePool, 1, rng, Infinity, lootRole);
  const chance = rarity === "epic"
    ? 1
    : Math.min(1, coreChance * (likelyCoreIds.has(core.id) ? likely.chanceUp : likely.chanceDown));
  if (rng() >= chance) return supports;
  return [core, ...supports];
}

const SUPPORT_AFFIX_BY_TYPE = new Map(SUPPORT_AFFIXES.map(affix => [affix.type, affix]));
// Workshop pool nodes intentionally gate pre-existing core IDs to make the
// added nodes a real material sink. Blood Wand keeps its existing gate; a
// missing party context keeps this low-level generator backward-compatible for
// standalone loot generation and tests.
const WORKSHOP_LOCKED_AFFIX_IDS = new Set([
  "CORE_BLOOD_WAND",
  "CORE_TRAP_EATER",
  "CORE_THORN_SHIELD",
  "CORE_TOMB_RAIDER",
  "CORE_SCHOLAR_EYE",
  "CORE_THIN_ICE_PACT"
]);

function requireGenerationOptions(options, functionName) {
  if (options === undefined) return {};
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`${functionName} requires an options object; positional arguments are not supported`);
  }
  return options;
}

function requireGeneratedEquipment(value) {
  if (!isEquipmentInstance(value)) {
    return null;
  }
  return value;
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

const LOOT_ROLE_MATCH_WEIGHT = 4;

function getRoleAdjustedWeight(affix, lootRole) {
  if (!lootRole || !affix.buildRole) return affix.weight;
  return affix.weight * (affix.buildRole === lootRole ? LOOT_ROLE_MATCH_WEIGHT : 1);
}

export function rollAffixes(pool, count, rng = Math.random, budget = Infinity, lootRole = null) {
  const affixes = [];
  const selectedIds = new Set();
  let remainingBudget = budget;

  for (let i = 0; i < count; i++) {
    const available = pool.filter(aff => {
      const id = aff.id || aff.type;
      return !selectedIds.has(id) && (aff.cost || 0) <= remainingBudget;
    });
    if (available.length === 0) break;
    const totalWeight = available.reduce((sum, aff) => sum + getRoleAdjustedWeight(aff, lootRole), 0);
    let roll = rng() * totalWeight;
    const chosen = available.find(aff => {
      roll -= getRoleAdjustedWeight(aff, lootRole);
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

function getDominantBuildRole(affixes, fallbackRole) {
  const counts = new Map();
  affixes.forEach(affix => {
    if (affix.buildRole) counts.set(affix.buildRole, (counts.get(affix.buildRole) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([role]) => role)[0] || fallbackRole;
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

const RARITY_STEP_UP = Object.freeze({ magic: "rare", rare: "epic", epic: "epic" });

// The catacomb's curse rule (#2063): the curse is decided as soon as the grade
// is, so a cursed find can be one grade better. Elsewhere the curse is still
// rolled after the affixes, as before.
function rollRuleCurse(runFloor, rarity, forceRarity, rng) {
  const rule = getDungeonCurseRule(runFloor);
  if (!rule) return { rule: null, cursed: false, rarity };
  const cursed = rng() < rule.curseChance;
  return { rule, cursed, rarity: cursed && !forceRarity ? RARITY_STEP_UP[rarity] || rarity : rarity };
}

// `runFloor` is the running floor number; supply reads the floor inside the
// dungeon, so every dungeon hands out the same kinds on the same floor (#2060).
export function generateRandomEquipment(runFloor, options) {
  const { forceRarity = null, rarityBonus = 0, rng = Math.random, party = null, excludeHighEnd = false, allowCores = true, runtimeDiagnostics = null, forceBaseId = null, forceCoreId = null, likelyCoreFamilies = party?.[0]?.likelyCoreFamilies ?? null } =
    requireGenerationOptions(options, "generateRandomEquipment");
  recordRuntimeCall(runtimeDiagnostics, "equipment.generate", { kind: "equipment", floor: runFloor });
  // An invalid floor stays invalid and is rejected below, as before.
  const floor = Number.isInteger(runFloor) && runFloor >= 1 ? getDungeonFloor(runFloor) : runFloor;
  const gambleProfile = getIdentificationGambleProfile(floor);
  const candidateFloor = Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1));
  let baseCandidates = EQUIPMENT_CANDIDATES_BY_FLOOR[candidateFloor]
    || EQUIPMENT_CANDIDATES_BY_FLOOR[30];

  // 通常チェストなど高級ベースを出したくないソースでは除外する。
  if (excludeHighEnd) {
    baseCandidates = baseCandidates.filter(baseId => !RESTRICTED_CHEST_BASES.includes(baseId));
  }
  baseCandidates = getVNextTrialCandidates(baseCandidates);

  // Reuse the historical pre-selection roll for the role target so seeded
  // streams stay stable. Candidate selection remains independent of the loadout.
  const lootRole = rollLootBuildRole(floor, rng);
  const baseRoll = rng();
  let baseId = baseCandidates[Math.floor(baseRoll * baseCandidates.length)];
  if (forceBaseId && ITEMS[forceBaseId]) baseId = forceBaseId;
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
  const ruleCurse = rollRuleCurse(runFloor, rarity, forceRarity, rng);
  rarity = ruleCurse.rarity;
  // A chest opened in the throne's dark is better (#2063).
  for (let step = 0; !forceRarity && step < rarityBonus; step++) rarity = RARITY_STEP_UP[rarity] || rarity;

  // Every Support can appear from the first floor (#2061); the floor raises
  // grade and the affix budget, never which kinds exist.
  const possibleAffixes = [];
  const addAffix = (type, getVal, weight = 3) => {
    if (!isVNextTrialSupport(type, {
      slot: baseItem.type === "weapon" ? "weapon" : baseItem.type,
      baseId
    })) return;
    const candidate = withSupportDefinition({ type, getVal, weight });
    if (candidate) possibleAffixes.push(candidate);
  };

  if (baseItem.type === "weapon") {
    addAffix("atk", () => getSupportValueByRarity("atk", rarity));
  }
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix("def", () => getSupportValueByRarity("def", rarity));
  }
  addAffix("hp", () => getSupportValueByRarity("hp", rarity));

  const isMpEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "ROBE", "PRIEST_ROBE", "MAGE_CLOAK", "ARCANE_ROBE", "SORCERER_ROBE"].includes(baseId);
  if (isMpEligible) {
    addAffix("mp", () => getSupportValueByRarity("mp", rarity));
  }

  addAffix("physicalAccuracy", () => getSupportValueByRarity("physicalAccuracy", rarity), 1);
  addAffix("escapeChance", () => getSupportValueByRarity("escapeChance", rarity), 1);
  
  const isTrapEligible = ["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "RAPIER", "LEATHER_ARMOR", "NINJA_SUIT", "EXPLORER_CLOAK", "BUCKLER"].includes(baseId);
  if (isTrapEligible) {
    addAffix("trapBonus", () => getSupportValueByRarity("trapBonus", rarity), 3);
  }

  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix("trapGuard", () => getSupportValueByRarity("trapGuard", rarity), 2);
  }

  const isFollowUpEligible = ["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "SHORT_SWORD", "RAPIER", "FLAME_SWORD", "BATTLE_GARB"].includes(baseId);
  if (isFollowUpEligible) {
    addAffix("followUp", () => Math.floor(rng() * 6) + 10, 2); // 10-15%
  }
  const isArcaneEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneEligible) {
    addAffix("arcane", () => 15, 2); // +15%
  }
  const isSpellPowerEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isSpellPowerEligible) {
    addAffix("spellPower", () => AFFIX_BALANCE.spellPowerByRarity[rarity], 2);
  }
  const isDevotionEligible = isVNextDevotionWeapon(baseId);
  if (isDevotionEligible) {
    addAffix("devotion", () => 15, 2); // +15%
  }
  const isGuardianEligible = ["SMALL_SHIELD", "LARGE_SHIELD", "KNIGHT_SHIELD", "LEGENDARY_SHIELD", "PLATE_MAIL", "CHAIN_MAIL", "SCALE_MAIL", "BUCKLER", "MAGIC_SHIELD", "DRAGON_SCALE"].includes(baseId);
  if (isGuardianEligible) {
    addAffix("guardian", () => 15, 2); // -15%
  }
  const isTreasureSenseEligible = ["LEATHER_ARMOR", "NINJA_SUIT", "DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "SHORT_SWORD", "RAPIER", "BUCKLER", "EXPLORER_CLOAK"].includes(baseId);
  if (isTreasureSenseEligible) {
    addAffix("treasureSense", () => getSupportValueByRarity("treasureSense", rarity), 1);
  }
  const isHearEligible = ["EXPLORER_CLOAK", "NINJA_SUIT", "LEATHER_ARMOR", "BUCKLER"].includes(baseId);
  if (isHearEligible) {
    addAffix("hearRange", () => getSupportValueByRarity("hearRange", rarity), 1);
  }
  const isArcaneSenseEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneSenseEligible) {
    addAffix("arcaneSense", () => getSupportValueByRarity("arcaneSense", rarity), 1);
  }
  const isTraceReadEligible = ["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "RAPIER", "EXPLORER_CLOAK", "NINJA_SUIT", "BUCKLER"].includes(baseId);
  if (isTraceReadEligible) {
    addAffix("traceRead", () => getSupportValueByRarity("traceRead", rarity), 1);
  }
  if (["SACRED_MACE", "MACE", "HOLY_STAFF"].includes(baseId)) {
    addAffix("antiUndead", () => getSupportValueByRarity("antiUndead", rarity), 1);
  }
  if (baseId === "DRAGON_SCALE") {
    addAffix("antiDragon", () => getSupportValueByRarity("antiDragon", rarity), 1);
  }
  if (["MAGIC_SHIELD", "ARCH_WAND", "ARCANE_ROBE", "SORCERER_ROBE", "DRAGON_SCALE"].includes(baseId)) {
    addAffix("spellGuard", () => getSupportValueByRarity("spellGuard", rarity), 1);
  }
  if (baseId === "EXPLORER_CLOAK") {
    addAffix("poisonWard", () => getSupportValueByRarity("poisonWard", rarity), 1);
  }
  if (["RAPIER", "NINJA_BLADE", "MOONSHADOW", "BATTLE_GARB"].includes(baseId)) {
    addAffix("firstStrike", () => getSupportValueByRarity("firstStrike", rarity), 1);
  }
  addAffix("deepAssault", () => getSupportValueByRarity("deepAssault", rarity), 2);
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix("frontGuard", () => getSupportValueByRarity("frontGuard", rarity), 2);
    addAffix("rearEvasion", () => getSupportValueByRarity("rearEvasion", rarity), 2);
    addAffix("firstStrikeDefense", () => getSupportValueByRarity("firstStrikeDefense", rarity), 1);
  }
  if (baseItem.type === "weapon") {
    addAffix("fullHpDamage", () => getSupportValueByRarity("fullHpDamage", rarity), 2);
    addAffix("lowHpDamage", () => getSupportValueByRarity("lowHpDamage", rarity), 2);
    addAffix("highHpTargetDamage", () => getSupportValueByRarity("highHpTargetDamage", rarity), 1);
    addAffix("bossDamage", () => getSupportValueByRarity("bossDamage", rarity), 1);
    addAffix("physicalAccuracy", () => getSupportValueByRarity("physicalAccuracy", rarity), 1);
    addAffix("firstTurnAttack", () => getSupportValueByRarity("firstTurnAttack", rarity), 2);
    addAffix("antiBeast", () => getSupportValueByRarity("antiBeast", rarity), 1);
    addAffix("antiSpirit", () => getSupportValueByRarity("antiSpirit", rarity), 1);
    // #271実src N=8,000: B5装備2.0%、職内r=0.065 [0.027, 0.103]、event勝率4.9%→4.8%。
    addAffix("antiDemon", () => getSupportValueByRarity("antiDemon", rarity), 1);
    if (isVNextMediumWeapon(baseId)) {
      addAffix("spellAccuracy", () => getSupportValueByRarity("spellAccuracy", rarity), 1);
    }
    addAffix("killHeal", () => 2, 1);
    addAffix("followUpMp", () => 1, 1);
    addAffix("hitFlinch", () => getSupportValueByRarity("hitFlinch", rarity), 1);
    // #313: 前衛が自力で状態異常を撒ける唯一の手段。執行人の前提でもある。
    addAffix("poisonAtk", () => getSupportValueByRarity("poisonAtk", rarity), 1);
    // #793: the single Phase 1 bleeding producer remains weapon-only and
    // follows the existing poison trigger pool without repurposing poisonAtk.
    addAffix("bleedingAtk", () => getSupportValueByRarity("bleedingAtk", rarity), 1);
  }
  addAffix("statusResistance", () => getSupportValueByRarity("statusResistance", rarity), 2);
  addAffix("victoryMaterial", () => 5, 1);
  addAffix("stairsHeal", () => getSupportValueByRarity("stairsHeal", rarity), 1);
  addAffix("identifyDiscount", () => 10, 2);
  addAffix("materialFind", () => 10, 2);
  addAffix("contractReward", () => 10, 2);
  
  const unlockedAffixIds = party?.[0]?.unlockedAffixIds;
  const affixes = rollBuildVNextAffixLoadout(possibleAffixes, baseItem.type, rarity, floor, rng, lootRole, allowCores, unlockedAffixIds, forceCoreId, baseId, likelyCoreFamilies);
  const buildRoles = [...new Set(affixes.map(affix => affix.buildRole).filter(Boolean))];
  const buildRole = getDominantBuildRole(affixes, lootRole);

  const instanceId = `eq_${rng().toString(36).substr(2, 9)}`;

  // tags, curse, unidentified information generation
  const baseItemTags = baseItem.tags || [];
  const tags = [...baseItemTags];
  
  // Add tags based on affixes
  affixes.forEach(aff => {
    if (aff.type === "atk") {
      if (!tags.includes("blade")) tags.push("blade");
    }
    if (aff.type === "def") {
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
  if (isKatanaOrSealed || (ruleCurse.rule ? ruleCurse.cursed : rollCurse < curseChance)) {
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

  const generated = {
    kind: "equipment",
    instanceId,
    baseId,
    rarity,
    level: floor,
    identified: false,
    halfIdentified: false,
    knowledgeStage: "discovery",
    observationCount: 0,
    trialCount: 0,
    tags,
    hintTags: meta.hintTags,
    curseEffectId,
    cursePower: gambleProfile.cursePower,
    curseSuspected: meta.curseSuspected,
    unidentifiedName: meta.unidentifiedName,
    affixes,
    buildRole,
    buildRoles,
    lootRole
  };
  applyBuildVNextSupply(generated, baseItem.type, floor, rng);
  return requireGeneratedEquipment(generated);
}

export function generateRandomAccessory(runFloor, options) {
  const { forceRarity = null, rng = Math.random, party = null, allowCores = true, runtimeDiagnostics = null, forceBaseId = null, forceCoreId = null, likelyCoreFamilies = party?.[0]?.likelyCoreFamilies ?? null } =
    requireGenerationOptions(options, "generateRandomAccessory");
  recordRuntimeCall(runtimeDiagnostics, "equipment.generate", { kind: "accessory", floor: runFloor });
  const floor = Number.isInteger(runFloor) && runFloor >= 1 ? getDungeonFloor(runFloor) : runFloor;
  const gambleProfile = getIdentificationGambleProfile(floor);
  const candidateFloor = Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1));
  let baseCandidates = ACCESSORY_CANDIDATES_BY_FLOOR[candidateFloor]
    || ACCESSORY_CANDIDATES_BY_FLOOR[30];
  baseCandidates = getVNextTrialCandidates(baseCandidates);

  const lootRole = rollLootBuildRole(floor, rng);
  const baseRoll = rng();
  let baseId = baseCandidates[Math.floor(baseRoll * baseCandidates.length)];
  if (forceBaseId && ITEMS[forceBaseId]) baseId = forceBaseId;
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
  const ruleCurse = rollRuleCurse(runFloor, rarity, forceRarity, rng);
  rarity = ruleCurse.rarity;

  const accessoryAffixPool = [
    { type: "hp", getVal: () => getSupportValueByRarity("hp", rarity), weight: 4 },
    { type: "mp", getVal: () => getSupportValueByRarity("mp", rarity), weight: 3 },
    { type: "physicalAccuracy", getVal: () => getSupportValueByRarity("physicalAccuracy", rarity), weight: 2 },
    { type: "escapeChance", getVal: () => getSupportValueByRarity("escapeChance", rarity), weight: 2 },
    { type: "trapBonus", getVal: () => getSupportValueByRarity("trapBonus", rarity), weight: 3 },
    { type: "trapGuard", getVal: () => getSupportValueByRarity("trapGuard", rarity), weight: 2 },
    { type: "spellGuard", getVal: () => getSupportValueByRarity("spellGuard", rarity), weight: 1 },
    { type: "antiDragon", getVal: () => getSupportValueByRarity("antiDragon", rarity), weight: 1 },
    { type: "antiUndead", getVal: () => getSupportValueByRarity("antiUndead", rarity), weight: 1 },
    { type: "antiDemon", getVal: () => getSupportValueByRarity("antiDemon", rarity), weight: 1 },
    { type: "poisonWard", getVal: () => getSupportValueByRarity("poisonWard", rarity), weight: 1 },
    { type: "treasureSense", getVal: () => getSupportValueByRarity("treasureSense", rarity), weight: 1 },
    { type: "hearRange", getVal: () => getSupportValueByRarity("hearRange", rarity), weight: 2 },
    { type: "arcaneSense", getVal: () => getSupportValueByRarity("arcaneSense", rarity), weight: 2 },
    { type: "spellPower", getVal: () => AFFIX_BALANCE.spellPowerByRarity[rarity], weight: 2 },
    { type: "traceRead", getVal: () => getSupportValueByRarity("traceRead", rarity), weight: 2 },
    { type: "deepAssault", getVal: () => getSupportValueByRarity("deepAssault", rarity), weight: 2 },
    { type: "fullHpDamage", getVal: () => getSupportValueByRarity("fullHpDamage", rarity), weight: 2 },
    { type: "firstStrikeFollowUp", getVal: () => getSupportValueByRarity("firstStrikeFollowUp", rarity), weight: 2 },
    { type: "antiBeast", getVal: () => getSupportValueByRarity("antiBeast", rarity), weight: 1 },
    { type: "antiSpirit", getVal: () => getSupportValueByRarity("antiSpirit", rarity), weight: 1 },
    { type: "statusResistance", getVal: () => getSupportValueByRarity("statusResistance", rarity), weight: 2 },
    { type: "spellAccuracy", getVal: () => getSupportValueByRarity("spellAccuracy", rarity), weight: 1 },
    { type: "killHeal", getVal: () => 2, weight: 1 },
    { type: "followUpMp", getVal: () => 1, weight: 1 },
    { type: "hitFlinch", getVal: () => getSupportValueByRarity("hitFlinch", rarity), weight: 1 },
    { type: "victoryMaterial", getVal: () => 5, weight: 1 },
    { type: "stairsHeal", getVal: () => getSupportValueByRarity("stairsHeal", rarity), weight: 1 },
    { type: "identifyDiscount", getVal: () => 10, weight: 2 },
    { type: "materialFind", getVal: () => 10, weight: 2 },
    { type: "contractReward", getVal: () => 10, weight: 2 }
  ].filter(aff => aff.weight > 0 && isVNextTrialSupport(aff.type, { slot: "accessory", baseId }))
    .map(withSupportDefinition)
    .filter(Boolean);

  const unlockedAffixIds = party?.[0]?.unlockedAffixIds;
  const affixes = rollBuildVNextAffixLoadout(accessoryAffixPool, "accessory", rarity, floor, rng, lootRole, allowCores, unlockedAffixIds, forceCoreId, baseId, likelyCoreFamilies);
  const buildRoles = [...new Set(affixes.map(affix => affix.buildRole).filter(Boolean))];
  const buildRole = getDominantBuildRole(affixes, lootRole);
  const tags = [...(baseItem.tags || [])];
  affixes.forEach(aff => {
    const affixTags = {
      hp: "ward",
      mp: "spirit",
      physicalAccuracy: "ambush",
      escapeChance: "evasion",
      trapBonus: "trap",
      trapGuard: "trap",
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
  const accessoryCurseRoll = rng();
  if (ruleCurse.rule ? ruleCurse.cursed : accessoryCurseRoll < curseChance) {
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

  const generated = {
    kind: "equipment",
    instanceId: `eq_${rng().toString(36).substr(2, 9)}`,
    baseId,
    rarity,
    level: floor,
    identified: false,
    halfIdentified: false,
    knowledgeStage: "discovery",
    observationCount: 0,
    trialCount: 0,
    tags,
    hintTags: meta.hintTags,
    curseEffectId,
    cursePower: gambleProfile.cursePower,
    curseSuspected: meta.curseSuspected,
    unidentifiedName: meta.unidentifiedName,
    affixes,
    buildRole,
    buildRoles,
    lootRole
  };
  applyBuildVNextSupply(generated, "accessory", floor, rng);
  return requireGeneratedEquipment(generated);
}
