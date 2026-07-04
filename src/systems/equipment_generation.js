import { ITEMS, CURSE_EFFECTS } from "../data/items.js";
import { ACCESSORY_CANDIDATES_BY_FLOOR, EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../data/equipment_tables.js";

export function rollAffixes(pool, count, rng = Math.random) {
  const affixes = [];
  const selectedTypes = new Set();

  for (let i = 0; i < count; i++) {
    const available = pool.filter(aff => !selectedTypes.has(aff.type));
    if (available.length === 0) break;
    const totalWeight = available.reduce((sum, aff) => sum + aff.weight, 0);
    let roll = rng() * totalWeight;
    const chosen = available.find(aff => {
      roll -= aff.weight;
      return roll <= 0;
    }) || available[available.length - 1];
    affixes.push({
      type: chosen.type,
      value: chosen.getVal()
    });
    selectedTypes.add(chosen.type);
  }

  return affixes;
}

export function buildUnidentifiedMeta(tags, rarity, typeName, rng = Math.random, { curseEffectId = null } = {}) {
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

  return {
    hintTags,
    curseSuspected: curseEffectId ? true : (rng() < 0.20),
    unidentifiedName: `${prefix}未鑑定の${typeName}`
  };
}

export function generateRandomEquipment(floor, { forceRarity = null, rng = Math.random, party = null, excludeHighEnd = false } = {}) {
  let baseCandidates = EQUIPMENT_CANDIDATES_BY_FLOOR[floor] || EQUIPMENT_CANDIDATES_BY_FLOOR[5];

  // 通常チェストなど高級ベースを出したくないソースでは除外する。
  if (excludeHighEnd) {
    baseCandidates = baseCandidates.filter(baseId => !RESTRICTED_CHEST_BASES.includes(baseId));
  }

  // Smart Drop (70%): Select base items usable by the current party
  if (rng() < 0.70 && party && party.length > 0) {
    const livingParty = party.filter(char => char.status !== "dead");
    const missingCount = { weapon: 0, shield: 0, armor: 0 };
    
    if (livingParty.length > 0) {
      livingParty.forEach(char => {
        if (!char.equipment || !char.equipment.weapon) {
          missingCount.weapon++;
        }
        const canEquipShield = !["Mage", "Thief", "Ninja"].includes(char.class);
        if (canEquipShield && (!char.equipment || !char.equipment.shield)) {
          missingCount.shield++;
        }
        if (!char.equipment || !char.equipment.armor || typeof char.equipment.armor === "string") {
          missingCount.armor++;
        }
      });
    }

    let priorityType = null;
    let maxMissing = 0;
    for (const [slot, count] of Object.entries(missingCount)) {
      if (count > maxMissing) {
        maxMissing = count;
        priorityType = slot;
      }
    }

    let usableCandidates = baseCandidates.filter(baseId => {
      const item = ITEMS[baseId];
      if (!item) return false;
      return livingParty.some(char => {
        return !item.classes || item.classes.includes(char.class);
      });
    });

    if (usableCandidates.length > 0) {
      if (priorityType) {
        const typeCandidates = usableCandidates.filter(baseId => {
          const item = ITEMS[baseId];
          return item && item.type === priorityType;
        });
        if (typeCandidates.length > 0) {
          usableCandidates = typeCandidates;
        }
      }
      baseCandidates = usableCandidates;
    }
  }
  
  const baseId = baseCandidates[Math.floor(rng() * baseCandidates.length)];
  const baseItem = ITEMS[baseId];
  if (!baseItem) return null;
  
  let rarity = "magic";
  if (forceRarity) {
    rarity = forceRarity;
  } else {
    const roll = rng();
    let epicChance = 0.03;
    let rareChance = 0.20;
    if (floor === 4) {
      epicChance = 0.05;
      rareChance = 0.25;
    } else if (floor >= 5) {
      epicChance = 0.08;
      rareChance = 0.30;
    }
    if (roll < epicChance) rarity = "epic";
    else if (roll < rareChance) rarity = "rare";
    else rarity = "magic";
  }
  
  const affixCount = { magic: 1, rare: 2, epic: 3 }[rarity];
  
  let maxWpBonus = 1;
  if (floor === 2) maxWpBonus = 2;
  else if (floor === 3) maxWpBonus = 3;
  else if (floor === 4) maxWpBonus = 4;
  else if (floor >= 5) maxWpBonus = 6;
  
  let maxArBonus = 1;
  if (floor === 3) maxArBonus = 2;
  else if (floor === 4) maxArBonus = 3;
  else if (floor >= 5) maxArBonus = 4;
  
  const possibleAffixes = [];
  const addAffix = (minFloor, type, getVal, weight = 3) => {
    if (floor >= minFloor) possibleAffixes.push({ type, getVal, weight });
  };

  if (baseItem.type === "weapon") {
    addAffix(1, "atk", () => Math.floor(rng() * maxWpBonus) + 1);
  }
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    addAffix(1, "def", () => Math.floor(rng() * maxArBonus) + 1);
  }
  addAffix(1, "hp", () => {
    const minHp = floor + 1;
    const maxHp = floor * 2 + 2;
    return Math.floor(rng() * (maxHp - minHp + 1)) + minHp;
  });

  const isMpEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "ROBE", "PRIEST_ROBE", "MAGE_CLOAK", "ARCANE_ROBE", "SORCERER_ROBE"].includes(baseId);
  if (isMpEligible) {
    addAffix(1, "mp", () => {
      const maxMpBonus = floor >= 5 ? 4 : (floor >= 3 ? 2 : 1);
      return Math.floor(rng() * maxMpBonus) + 1;
    });
  }

  const stats = ["str", "int", "pie", "vit", "agi", "luk"];
  stats.forEach(stat => {
    addAffix(1, stat, () => {
      const maxStat = floor >= 5 ? 3 : (floor >= 3 ? 2 : 1);
      return Math.floor(rng() * maxStat) + 1;
    });
  });
  
  const isTrapEligible = ["DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "RAPIER", "LEATHER_ARMOR", "NINJA_SUIT", "EXPLORER_CLOAK", "BUCKLER"].includes(baseId);
  if (isTrapEligible) {
    addAffix(1, "trapBonus", () => {
      if (floor >= 5) return 15;
      if (floor >= 3) return 10;
      return 5;
    }, 2);
  }

  const isFollowUpEligible = ["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "DAGGER", "NINJA_DAGGER", "VENOM_FANG", "NINJA_BLADE", "MOONSHADOW", "SHORT_SWORD", "RAPIER", "FLAME_SWORD", "BATTLE_GARB"].includes(baseId);
  if (isFollowUpEligible) {
    addAffix(2, "followUp", () => Math.floor(rng() * 6) + 10, 2); // 10-15%
  }
  const isArcaneEligible = ["WAND", "SAGE_STAFF", "ARCH_WAND", "HOLY_STAFF", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "SORCERER_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneEligible) {
    addAffix(2, "arcane", () => 15, 2); // +15%
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
    addAffix(3, "treasureSense", () => 8, 1); // +8%
  }
  if (["SACRED_MACE", "MACE", "HOLY_STAFF"].includes(baseId)) {
    addAffix(3, "antiUndead", () => 30, 1);
  }
  if (baseId === "DRAGON_SCALE") {
    addAffix(4, "antiDragon", () => 30, 1);
  }
  if (["MAGIC_SHIELD", "ARCH_WAND", "ARCANE_ROBE", "SORCERER_ROBE", "DRAGON_SCALE"].includes(baseId)) {
    addAffix(3, "spellGuard", () => 20, 1);
  }
  if (baseId === "EXPLORER_CLOAK") {
    addAffix(2, "poisonWard", () => {
      if (floor >= 5) return 50;
      if (floor >= 3) return 35;
      return 20;
    }, 1);
  }
  if (["RAPIER", "NINJA_BLADE", "MOONSHADOW", "BATTLE_GARB"].includes(baseId)) {
    addAffix(4, "firstStrike", () => {
      if (floor >= 5 && rarity === "epic") return 10;
      if (floor >= 5) return 8;
      return 5;
    }, 1);
  }
  
  const affixes = rollAffixes(possibleAffixes, affixCount, rng);
  
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
  });

  let curseEffectId = null;
  const isKatanaOrSealed = baseId === "KATANA" || baseId === "SEALED_EXCALIBUR";
  const rollCurse = rng();
  const curseChance = rarity === "epic" ? 0.25 : 0.15;
  if (isKatanaOrSealed || rollCurse < curseChance) {
    const curseKeys = Object.keys(CURSE_EFFECTS);
    curseEffectId = curseKeys[Math.floor(rng() * curseKeys.length)];
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
  const meta = buildUnidentifiedMeta(tags, rarity, typeName, rng, { curseEffectId });
  meta.unidentifiedName = `${prefix}未鑑定の${typeName}`;

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
    curseSuspected: meta.curseSuspected,
    unidentifiedName: meta.unidentifiedName,
    affixes
  };
}

export function generateRandomAccessory(floor, { forceRarity = null, rng = Math.random, party = null } = {}) {
  let baseCandidates = ACCESSORY_CANDIDATES_BY_FLOOR[floor] || ACCESSORY_CANDIDATES_BY_FLOOR[5];

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

  const baseId = baseCandidates[Math.floor(rng() * baseCandidates.length)];
  const baseItem = ITEMS[baseId];
  if (!baseItem) return null;

  let rarity = "magic";
  if (forceRarity) {
    rarity = forceRarity;
  } else {
    const roll = rng();
    let epicChance = 0.02;
    let rareChance = 0.16;
    if (floor === 4) {
      epicChance = 0.035;
      rareChance = 0.20;
    } else if (floor >= 5) {
      epicChance = 0.05;
      rareChance = 0.24;
    }
    if (roll < epicChance) rarity = "epic";
    else if (roll < rareChance) rarity = "rare";
  }

  const affixCount = { magic: 1, rare: 1, epic: 2 }[rarity] || 1;
  const statValue = floor >= 4 ? 2 : 1;
  const accessoryAffixPool = [
    { type: "hp", getVal: () => floor >= 4 ? 8 : 6, weight: 4 },
    { type: "mp", getVal: () => floor >= 4 ? 2 : 1, weight: 3 },
    { type: "str", getVal: () => statValue, weight: 2 },
    { type: "int", getVal: () => statValue, weight: 2 },
    { type: "pie", getVal: () => statValue, weight: 2 },
    { type: "vit", getVal: () => statValue, weight: 2 },
    { type: "agi", getVal: () => statValue, weight: 2 },
    { type: "luk", getVal: () => statValue, weight: 2 },
    { type: "trapBonus", getVal: () => floor >= 4 ? 10 : 5, weight: 2 },
    { type: "spellGuard", getVal: () => floor >= 4 ? 15 : 10, weight: 1 },
    { type: "antiDragon", getVal: () => 15, weight: floor >= 4 ? 1 : 0 },
    { type: "antiUndead", getVal: () => 15, weight: floor >= 3 ? 1 : 0 },
    { type: "poisonWard", getVal: () => floor >= 4 ? 25 : 15, weight: 1 },
    { type: "treasureSense", getVal: () => floor >= 4 ? 8 : 5, weight: 1 }
  ].filter(aff => aff.weight > 0);

  const affixes = rollAffixes(accessoryAffixPool, affixCount, rng);
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
      treasureSense: "search"
    };
    const tag = affixTags[aff.type];
    if (tag && !tags.includes(tag)) tags.push(tag);
  });

  let typeName = "装身具";
  if (baseId.includes("RING")) {
    typeName = "指輪";
  } else if (baseId.includes("BAND")) {
    typeName = "腕輪";
  } else if (baseId.includes("AMULET") || baseId.includes("CHARM")) {
    typeName = "護符";
  }

  const meta = buildUnidentifiedMeta(tags, rarity, typeName, rng, { curseEffectId: null });

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
    curseEffectId: null,
    curseSuspected: false,
    unidentifiedName: meta.unidentifiedName,
    affixes
  };
}
