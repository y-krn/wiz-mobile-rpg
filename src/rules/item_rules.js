import { ITEMS, CURSE_EFFECTS } from "../data/items.js";
import { getClassPassiveBonus } from "./class_rules.js";
import { formatAffixText } from "../data/affixes.js";

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
  if (amount <= 0) return amount;
  let mult = 1;
  if (target?.antiHealTurns > 0) {
    mult *= 0.5;
  }
  mult = Math.max(0.25, mult);
  return Math.max(1, Math.round(amount * mult));
}

export function getCharAffixSum(char, affixType) {
  if (!char || !char.equipment) return 0;
  let sum = 0;
  Object.values(char.equipment).forEach(eqKey => {
    if (!eqKey) return;
    const eqData = getItemData(eqKey);
    if ((typeof eqKey !== "object" || eqKey.identified) && eqData?.affixBonus?.[affixType] !== undefined) {
      sum += eqData.affixBonus[affixType];
    }
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
        // 完全鑑定済みかつ呪われ装備の場合、呪いの全効果を適用
        if (eqKey.curseEffectId) {
          const curse = CURSE_EFFECTS[eqKey.curseEffectId];
          if (curse && curse.mod && curse.mod[affixType] !== undefined) {
            sum += curse.mod[affixType];
          }
        }
      } else {
        // 未鑑定で装備している場合、呪いのデメリット（負の補正値）のみ適用するリスク
        if (eqKey.curseEffectId) {
          const curse = CURSE_EFFECTS[eqKey.curseEffectId];
          if (curse && curse.mod && curse.mod[affixType] !== undefined) {
            const val = curse.mod[affixType];
            if (val < 0) {
              sum += val;
            }
          }
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

export function getPartyMaxAffix(party, affixType) {
  if (!Array.isArray(party)) return 0;
  return party.reduce((max, char) => {
    if (!char || char.hp <= 0 || char.status === "dead") return max;
    return Math.max(max, getCharAffixSum(char, affixType));
  }, 0);
}

export function getItemData(itemOrKey) {
  if (!itemOrKey) return null;
  const baseId = getItemBaseId(itemOrKey);
  const base = ITEMS[baseId];
  if (!base) return null;

  if (typeof itemOrKey === "object") {
    
    // 未鑑定状態
    if (!itemOrKey.identified) {
      let curseAtk = 0;
      let curseDef = 0;
      let curseHp = 0;
      let curseMp = 0;
      if (itemOrKey.curseEffectId) {
        const curse = CURSE_EFFECTS[itemOrKey.curseEffectId];
        if (curse && curse.mod) {
          if (curse.mod.atk !== undefined && curse.mod.atk < 0) curseAtk = curse.mod.atk;
          if (curse.mod.def !== undefined && curse.mod.def < 0) curseDef = curse.mod.def;
          if (curse.mod.hp !== undefined && curse.mod.hp < 0) curseHp = curse.mod.hp;
          if (curse.mod.mp !== undefined && curse.mod.mp < 0) curseMp = curse.mod.mp;
        }
      }

      if (itemOrKey.halfIdentified) {
        const hintLabels = {
          fire_rite: "火葬", holy: "聖", spirit: "霊", poison: "毒",
          dragon: "竜", iron: "鉄", blood: "血", curse: "呪",
          ward: "守勢", appraisal: "鑑定", beast: "獣", ambush: "奇襲",
          blade: "刃", trap: "罠", search: "探索", exorcism: "退魔",
          analysis: "解析", follow_up: "連撃", record: "記録", evasion: "回避"
        };
        const hints = itemOrKey.hintTags ? itemOrKey.hintTags.map(t => hintLabels[t] || t).join("・") : "なし";
        const curseText = itemOrKey.curseSuspected ? "呪いの疑いあり。" : "呪いの兆候なし。";
        const unidentName = itemOrKey.unidentifiedName || "簡易鑑定された装備品";
        return {
          ...base,
          id: itemOrKey,
          name: `${unidentName} (簡易鑑定済)`,
          desc: `${unidentName}。気配: ${hints}。${curseText} 完全鑑定で真価が確定します。`,
          price: base.price,
          atk: curseAtk,
          def: curseDef,
          affixes: [],
          hpBonus: curseHp,
          mpBonus: curseMp,
          statsBonus: {},
          trapBonus: 0,
          affixBonus: {},
          classes: base.classes,
          type: base.type
        };
      } else {
        const unidentName = itemOrKey.unidentifiedName || "未鑑定の装備品";
        return {
          ...base,
          id: itemOrKey,
          name: unidentName,
          desc: `${unidentName}。商店で鑑定できます。未鑑定のまま装備可能ですが、能力ボーナスは得られず、呪いのデメリットだけを受けるリスクがあります。`,
          price: base.price,
          atk: curseAtk,
          def: curseDef,
          affixes: [],
          hpBonus: curseHp,
          mpBonus: curseMp,
          statsBonus: {},
          trapBonus: 0,
          affixBonus: {},
          classes: base.classes,
          type: base.type
        };
      }
    }
    
    // 鑑定済み状態
    let baseAtk = base.atk || 0;
    let baseDef = base.def || 0;
    
    let atkBonus = 0;
    let defBonus = 0;
    let hpBonus = base.hpBonus || 0;
    let mpBonus = base.mpBonus || 0;

    if (itemOrKey.curseEffectId) {
      const curse = CURSE_EFFECTS[itemOrKey.curseEffectId];
      if (curse && curse.mod) {
        if (curse.mod.atk !== undefined) atkBonus += curse.mod.atk;
        if (curse.mod.def !== undefined) defBonus += curse.mod.def;
        if (curse.mod.hp !== undefined) hpBonus += curse.mod.hp;
        if (curse.mod.mp !== undefined) mpBonus += curse.mod.mp;
      }
    }
    const statsBonus = {
      str: base.statsBonus?.str || 0,
      int: base.statsBonus?.int || 0,
      pie: base.statsBonus?.pie || 0,
      vit: base.statsBonus?.vit || 0,
      agi: base.statsBonus?.agi || 0,
      luk: base.statsBonus?.luk || 0
    };
    let trapBonus = base.trapBonus || 0;
    
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
      else if (primaryAff.type === "hearRange") prefix = "地獄耳の";
      else if (primaryAff.type === "arcaneSense") prefix = "霊視の";
      else if (primaryAff.type === "traceRead") prefix = "追跡者の";
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
    
    let affixDesc = (itemOrKey.affixes || []).map(aff => {
      return formatAffixText(aff, "");
    }).join(" / ");
    
    let desc = `${base.desc} [${affixDesc}]`;
    if (itemOrKey.tags && itemOrKey.tags.length > 0) {
      const hintLabels = {
        fire_rite: "火葬", holy: "聖", spirit: "霊", poison: "毒",
        dragon: "竜", iron: "鉄", blood: "血", curse: "呪",
        ward: "守勢", appraisal: "鑑定", beast: "獣", ambush: "奇襲",
        blade: "刃", trap: "罠", search: "探索", exorcism: "退魔",
        analysis: "解析", follow_up: "連撃", record: "記録", evasion: "回避"
      };
      const tagList = itemOrKey.tags.map(t => hintLabels[t] || t).join("・");
      desc = `<タグ: ${tagList}> ${desc}`;
    }
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
