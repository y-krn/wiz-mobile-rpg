import { ITEMS } from "../data/items.js";
import { getClassPassiveBonus } from "./class_rules.js";

export function getItemBaseId(item) {
  if (!item) return "";
  if (typeof item === "object") {
    return item.baseId || item.key || item.id || "";
  }
  return item;
}

export function isSpecialOrQuestItem(itemId) {
  return itemId === "ANTIGRAVITY_CRYSTAL" || 
         itemId === "DRAGON_KEY" || 
         itemId === "LEGENDARY_SWORD" || 
         itemId === "LEGENDARY_SHIELD";
}

export function getEffectiveHealAmount(target, amount) {
  if (target?.antiHealTurns > 0) {
    return Math.max(1, Math.round(amount * 0.5));
  }
  return amount;
}

export function getCharAffixSum(char, affixType) {
  if (!char || !char.equipment) return 0;
  let sum = 0;
  Object.values(char.equipment).forEach(eqKey => {
    if (!eqKey) return;
    if (typeof eqKey === "object") {
      if (eqKey.identified) {
        if (eqKey.affixes) {
          eqKey.affixes.forEach(aff => {
            if (aff.type === affixType) {
              sum += aff.value;
            }
          });
        }
        if (eqKey.inscription && eqKey.inscription.type === affixType) {
          sum += eqKey.inscription.value;
        }
      }
    }
  });
  if (affixType === "arcane") {
    const weaponIdStr = getItemBaseId(char.equipment.weapon);
    if (weaponIdStr === "WAND") {
      sum += 10;
    }
  }
  if (affixType === "antiUndead" || affixType === "antiDemon") {
    const weaponIdStr = getItemBaseId(char.equipment.weapon);
    if (weaponIdStr === "HOLY_BLADE") {
      sum += 20;
    }
  }
  if (affixType === "antiDragon") {
    const shieldIdStr = getItemBaseId(char.equipment.shield);
    if (shieldIdStr === "DRAGON_CHARM") {
      sum += 30;
    }
  }
  const total = sum + getClassPassiveBonus(char, affixType);
  const caps = {
    poisonWard: 75,
    firstStrike: 15,
    guardian: 50,
    spellGuard: 50,
    arcane: 50,
    devotion: 50,
    followUp: 50
  };
  return caps[affixType] ? Math.min(caps[affixType], total) : total;
}

export function getItemData(itemOrKey) {
  if (!itemOrKey) return null;
  const baseId = getItemBaseId(itemOrKey);
  const base = ITEMS[baseId];
  if (!base) return null;

  if (typeof itemOrKey === "object") {
    
    // 未鑑定状態
    if (!itemOrKey.identified) {
      let prefix = "古びた";
      const rarity = itemOrKey.rarity || "magic";
      if (rarity === "magic") {
        const isMagicAura = ["WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE", "MAGIC_SHIELD"].includes(base.id);
        prefix = isMagicAura ? "青く光る" : "古びた";
      } else if (rarity === "rare") {
        prefix = "金紋の";
      } else if (rarity === "epic") {
        prefix = "紫光を放つ";
      }

      let typeName = "武器";
      if (base.type === "shield") {
        if (base.id === "BUCKLER") {
          typeName = "小盾";
        } else if (base.id === "MAGIC_SHIELD") {
          typeName = "魔盾";
        } else {
          typeName = "盾";
        }
      } else if (base.type === "armor") {
        const isRobe = ["ROBE", "MAGE_CLOAK", "PRIEST_ROBE", "ARCANE_ROBE"].includes(base.id);
        if (isRobe) typeName = "ローブ";
        else if (base.id === "EXPLORER_CLOAK") typeName = "外套";
        else if (base.id === "BATTLE_GARB") typeName = "戦装束";
        else if (base.id === "DRAGON_SCALE") typeName = "鱗鎧";
        else typeName = "鎧";
      } else if (base.type === "weapon") {
        if (base.id === "WAND") {
          typeName = "杖";
        } else if (base.id === "RAPIER") {
          typeName = "細剣";
        } else if (base.id === "SACRED_MACE") {
          typeName = "聖器";
        } else if (["DAGGER", "NINJA_DAGGER", "SHORT_SWORD"].includes(base.id)) {
          typeName = "短剣";
        } else if (["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA"].includes(base.id)) {
          typeName = "剣";
        } else if (base.id === "MACE") {
          typeName = "メイス";
        }
      }
      
      const unidentName = `${prefix}未鑑定の${typeName}`;
      const hintLabels = {
        followUp: "連撃",
        arcane: "秘術",
        devotion: "神聖",
        guardian: "守護",
        treasureSense: "宝探",
        trapBonus: "技巧",
        antiUndead: "不死祓い",
        antiDragon: "竜殺し",
        spellGuard: "魔除け",
        poisonWard: "毒避け",
        firstStrike: "先制",
        antiDemon: "悪魔祓い"
      };
      const hintAffix = itemOrKey.affixes?.find(aff => hintLabels[aff.type]);
      const hintText = hintAffix ? ` 気配: ${hintLabels[hintAffix.type]}。` : "";
      
      return {
        ...base,
        id: itemOrKey,
        name: unidentName,
        desc: `${unidentName}。街の商店で鑑定できます。${hintText}`,
        price: base.price,
        atk: 0,
        def: 0,
        affixes: [],
        classes: base.classes,
        type: base.type
      };
    }
    
    // 鑑定済み状態
    let baseAtk = base.atk || 0;
    let baseDef = base.def || 0;
    
    let atkBonus = 0;
    let defBonus = 0;
    let hpBonus = 0;
    let mpBonus = 0;
    const statsBonus = { str: 0, int: 0, pie: 0, vit: 0, agi: 0, luk: 0 };
    let trapBonus = 0;
    
    const enhanceLevel = itemOrKey.enhanceLevel || 0;
    if (enhanceLevel > 0) {
      if (base.type === "weapon") {
        atkBonus += enhanceLevel * 2;
      } else if (base.type === "shield" || base.type === "armor") {
        defBonus += enhanceLevel;
      }
    }
    
    if (itemOrKey.affixes) {
      itemOrKey.affixes.forEach(aff => {
        if (aff.type === "atk") atkBonus += aff.value;
        else if (aff.type === "def") defBonus += aff.value;
        else if (aff.type === "hp") hpBonus += aff.value;
        else if (aff.type === "mp") mpBonus += aff.value;
        else if (["str", "int", "pie", "vit", "agi", "luk"].includes(aff.type)) {
          statsBonus[aff.type] = (statsBonus[aff.type] || 0) + aff.value;
        }
        else if (aff.type === "trapBonus") {
          trapBonus += aff.value;
        }
      });
    }
    
    // prefix の決定
    let prefix = "";
    if (itemOrKey.affixes && itemOrKey.affixes.length > 0) {
      const primaryAff = itemOrKey.affixes[0];
      if (primaryAff.type === "atk") prefix = "鋭利な";
      else if (primaryAff.type === "def") prefix = "頑丈な";
      else if (primaryAff.type === "hp") prefix = "生命の";
      else if (primaryAff.type === "mp") prefix = "魔力の";
      else if (primaryAff.type === "str") prefix = "怪力の";
      else if (primaryAff.type === "int") prefix = "叡智の";
      else if (primaryAff.type === "pie") prefix = "信仰の";
      else if (primaryAff.type === "vit") prefix = "堅固な";
      else if (primaryAff.type === "agi") prefix = "疾風の";
      else if (primaryAff.type === "luk") prefix = "強運の";
      else if (primaryAff.type === "trapBonus") prefix = "技巧の";
      else if (primaryAff.type === "followUp") prefix = "連撃の";
      else if (primaryAff.type === "arcane") prefix = "秘術の";
      else if (primaryAff.type === "devotion") prefix = "神聖な";
      else if (primaryAff.type === "guardian") prefix = "守護の";
      else if (primaryAff.type === "treasureSense") prefix = "宝探しの";
      else if (primaryAff.type === "antiUndead") prefix = "退魔の";
      else if (primaryAff.type === "antiDragon") prefix = "竜殺しの";
      else if (primaryAff.type === "spellGuard") prefix = "魔除けの";
      else if (primaryAff.type === "poisonWard") prefix = "毒避けの";
      else if (primaryAff.type === "firstStrike") prefix = "先制の";
    }
    
    let name = prefix ? `${prefix}${base.name}` : base.name;
    if (enhanceLevel > 0) {
      name = `${name}+${enhanceLevel}`;
    }
    if (itemOrKey.inscription) {
      name = `${name} [${itemOrKey.inscription.name}]`;
    }
    
    let affixDesc = itemOrKey.affixes.map(aff => {
      const label = {
        atk: "攻撃",
        def: "防御",
        hp: "HP",
        mp: "MP",
        str: "力",
        int: "知恵",
        pie: "信仰",
        vit: "生命",
        agi: "素早さ",
        luk: "運",
        trapBonus: "罠解除",
        followUp: "追加攻撃",
        arcane: "呪文威力",
        devotion: "回復威力",
        guardian: "守護",
        treasureSense: "宝探",
        antiUndead: "不死祓い",
        antiDragon: "竜殺し",
        spellGuard: "魔除け",
        poisonWard: "毒避け",
        firstStrike: "先制",
        antiDemon: "悪魔対策"
      }[aff.type];
      const sign = aff.value >= 0 ? "+" : "";
      const unit = ["trapBonus", "followUp", "arcane", "devotion", "guardian", "treasureSense", "antiUndead", "antiDragon", "spellGuard", "poisonWard", "antiDemon"].includes(aff.type) ? "%" : "";
      return `${label || aff.type}${sign}${aff.value}${unit}`;
    }).join(" / ");
    
    let desc = `${base.desc} [${affixDesc}]`;
    if (itemOrKey.inscription) {
      const ins = itemOrKey.inscription;
      const label = {
        poisonWard: "毒避け",
        antiUndead: "不死特効",
        spellGuard: "魔除け",
        antiDemon: "悪魔対策",
        antiDragon: "竜特効"
      }[ins.type] || ins.type;
      desc += ` <刻印: ${ins.name} (${label}+${ins.value}%)>`;
    }
    if (itemOrKey.rarity) {
      const rarityLabel = {
        magic: "Magic",
        rare: "Rare",
        epic: "Epic"
      }[itemOrKey.rarity] || "Magic";
      desc = `[${rarityLabel}] ${desc}`;
    }
    
    const multiplier = { magic: 1.5, rare: 2.5, epic: 4.0 }[itemOrKey.rarity || "magic"] || 1.5;
    
    return {
      ...base,
      id: itemOrKey,
      name,
      desc,
      atk: baseAtk + atkBonus,
      def: baseDef + defBonus,
      hpBonus,
      mpBonus,
      statsBonus,
      trapBonus,
      price: Math.floor(base.price * multiplier),
      classes: base.classes,
      type: base.type
    };
  }
  return base;
}
