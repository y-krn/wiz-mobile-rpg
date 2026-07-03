import { ITEMS, CURSE_EFFECTS } from "../data/items.js";
import { EQUIPMENT_CANDIDATES_BY_FLOOR, RESTRICTED_CHEST_BASES } from "../data/equipment_tables.js";

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

  const isMpEligible = baseId === "WAND" || baseId === "ROBE" || baseId === "PRIEST_ROBE" || baseId === "MAGE_CLOAK" || baseId === "ARCANE_ROBE";
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
  
  const isTrapEligible = baseId === "DAGGER" || baseId === "NINJA_DAGGER" || baseId === "RAPIER" || baseId === "LEATHER_ARMOR" || baseId === "NINJA_SUIT" || baseId === "EXPLORER_CLOAK" || baseId === "BUCKLER";
  if (isTrapEligible) {
    addAffix(1, "trapBonus", () => {
      if (floor >= 5) return 15;
      if (floor >= 3) return 10;
      return 5;
    }, 2);
  }

  const isFollowUpEligible = ["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "DAGGER", "NINJA_DAGGER", "SHORT_SWORD", "RAPIER", "BATTLE_GARB"].includes(baseId);
  if (isFollowUpEligible) {
    addAffix(2, "followUp", () => Math.floor(rng() * 6) + 10, 2); // 10-15%
  }
  const isArcaneEligible = ["WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "MAGIC_SHIELD"].includes(baseId);
  if (isArcaneEligible) {
    addAffix(2, "arcane", () => 15, 2); // +15%
  }
  const isDevotionEligible = ["MACE", "PRIEST_ROBE", "SACRED_MACE"].includes(baseId);
  if (isDevotionEligible) {
    addAffix(2, "devotion", () => 15, 2); // +15%
  }
  const isGuardianEligible = ["SMALL_SHIELD", "LARGE_SHIELD", "KNIGHT_SHIELD", "LEGENDARY_SHIELD", "PLATE_MAIL", "CHAIN_MAIL", "SCALE_MAIL", "BUCKLER", "MAGIC_SHIELD", "DRAGON_SCALE"].includes(baseId);
  if (isGuardianEligible) {
    addAffix(3, "guardian", () => 15, 2); // -15%
  }
  const isTreasureSenseEligible = ["LEATHER_ARMOR", "NINJA_SUIT", "DAGGER", "NINJA_DAGGER", "SHORT_SWORD", "RAPIER", "BUCKLER", "EXPLORER_CLOAK"].includes(baseId);
  if (isTreasureSenseEligible) {
    addAffix(3, "treasureSense", () => 8, 1); // +8%
  }
  if (["SACRED_MACE", "MACE"].includes(baseId)) {
    addAffix(3, "antiUndead", () => 30, 1);
  }
  if (baseId === "DRAGON_SCALE") {
    addAffix(4, "antiDragon", () => 30, 1);
  }
  if (["MAGIC_SHIELD", "ARCANE_ROBE", "DRAGON_SCALE"].includes(baseId)) {
    addAffix(3, "spellGuard", () => 20, 1);
  }
  if (baseId === "EXPLORER_CLOAK") {
    addAffix(2, "poisonWard", () => {
      if (floor >= 5) return 50;
      if (floor >= 3) return 35;
      return 20;
    }, 1);
  }
  if (["RAPIER", "BATTLE_GARB"].includes(baseId)) {
    addAffix(4, "firstStrike", () => {
      if (floor >= 5 && rarity === "epic") return 10;
      if (floor >= 5) return 8;
      return 5;
    }, 1);
  }
  
  const affixes = [];
  const selectedTypes = new Set();
  
  for (let i = 0; i < affixCount; i++) {
    const available = possibleAffixes.filter(aff => !selectedTypes.has(aff.type));
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

  const curseSuspected = curseEffectId ? true : (rng() < 0.20);

  let prefix = "古びた";
  if (rarity === "magic") {
    const isMagicAura = ["WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "MAGIC_SHIELD"].includes(baseId);
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
    const isRobe = ["ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE"].includes(baseId);
    typeName = isRobe ? "ローブ" : (baseId === "EXPLORER_CLOAK" ? "外套" : (baseId === "BATTLE_GARB" ? "戦装束" : (baseId === "DRAGON_SCALE" ? "鱗鎧" : "鎧")));
  } else if (baseItem.type === "weapon") {
    if (baseId === "WAND") typeName = "杖";
    else if (baseId === "RAPIER") typeName = "細剣";
    else if (baseId === "SACRED_MACE") typeName = "聖器";
    else if (["DAGGER", "NINJA_DAGGER", "SHORT_SWORD"].includes(baseId)) typeName = "短剣";
    else if (["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA"].includes(baseId)) typeName = "剣";
    else if (baseId === "MACE") typeName = "メイス";
  }
  const unidentifiedName = `${prefix}未鑑定の${typeName}`;

  return {
    kind: "equipment",
    instanceId,
    baseId,
    rarity,
    level: floor,
    identified: false,
    halfIdentified: false,
    tags,
    hintTags,
    curseEffectId,
    curseSuspected,
    unidentifiedName,
    affixes
  };
}
