// Directions: 0 = North, 1 = East, 2 = South, 3 = West
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const DIR_NAMES = ["北", "東", "南", "西"];

// Spells Database
export const SPELLS = {
  // Mage Spells
  HALITO: {
    name: "HALITO",
    type: "mage",
    level: 1,
    cost: 1,
    target: "single_enemy",
    desc: "火の玉 (5-15 DMG)",
    effect: (caster, target) => {
      let dmg = Math.floor(Math.random() * 11) + 5;
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus);
      let suffix = "";
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
        if (target.magicResist > 0) {
          suffix = "【レジスト！】呪文がレジストされた…";
        } else if (target.magicResist < 0) {
          suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
        }
      }
      return { damage: dmg, log: `${caster.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${suffix}` };
    }
  },
  KATINO: {
    name: "KATINO",
    type: "mage",
    level: 1,
    cost: 2,
    target: "all_enemies",
    desc: "睡眠の呪文 (敵全体を眠らせる)",
    effect: (caster, targets) => {
      let sleptCount = 0;
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = Math.min(0.10, Math.max(0, (intVal - 10) * 0.005));
      const chance = 0.6 + bonus;
      targets.forEach(t => {
        if (t.hp > 0 && Math.random() < chance) {
          t.status = "sleep";
          sleptCount++;
        }
      });
      return { log: `${caster.name}はカティノを唱えた！敵${sleptCount}体を眠らせた。` };
    }
  },
  LAHALITO: {
    name: "LAHALITO",
    type: "mage",
    level: 2,
    cost: 3,
    target: "all_enemies",
    desc: "炎の嵐 (敵全体に15-35 DMG)",
    effect: (caster, targets) => {
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 21) + 15;
        const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
        dmg = Math.round(dmg * bonus * arcaneBonus);
        let isResisted = false;
        let isWeakness = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          if (t.magicResist > 0) isResisted = true;
          if (t.magicResist < 0) isWeakness = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted, isWeakness };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => {
        let suffix = "";
        if (r.isResisted) suffix = "【レジスト】";
        if (r.isWeakness) suffix = "【弱点直撃！】";
        return `${r.name}に${r.dmg}のダメージ${suffix}`;
      }).join(", ");
      return { log: `${caster.name}はラハリトを唱えた！激しい炎が敵全体を焼き尽くす！(${logDetails})` };
    }
  },
  DUMAPIC: {
    name: "DUMAPIC",
    type: "mage",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "座標表示 (位置と方角を表示)",
    effect: (caster, state) => {
      return { log: `${caster.name}はデュマピックを唱えた！現在位置: 地下${state.floor}階 X:${state.x}, Y:${state.y}, 方角: ${DIR_NAMES[state.dir]}` };
    }
  },
  MAHALITO: {
    name: "MAHALITO",
    type: "mage",
    level: 3,
    cost: 3,
    target: "single_enemy",
    desc: "中級炎魔法 (20-35 DMG)",
    effect: (caster, target) => {
      let dmg = Math.floor(Math.random() * 16) + 20;
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus);
      let suffix = "";
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
        if (target.magicResist > 0) {
          suffix = "【レジスト！】呪文がレジストされた…";
        } else if (target.magicResist < 0) {
          suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
        }
      }
      return { damage: dmg, log: `${caster.name}はマハリトを唱えた！${target.name}に${dmg}の熱線ダメージ！${suffix}` };
    }
  },
  MASFEAL: {
    name: "MASFEAL",
    type: "mage",
    level: 4,
    cost: 4,
    target: "utility",
    desc: "魔除け (30歩の間、敵の遭遇を回避する)",
    effect: (caster, state) => {
      const intVal = caster ? getCharInt(caster) : 10;
      const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const steps = Math.round(30 * durationBonus);
      state.repelTurns = steps;
      return { log: `${caster.name}はマスペアルを唱えた！気配が消え、魔物を寄せ付けなくなった。(${steps}歩の間有効)` };
    }
  },
  MADALTO: {
    name: "MADALTO",
    type: "mage",
    level: 6,
    cost: 4,
    target: "all_enemies",
    desc: "氷結呪文 (30-60 DMG)",
    effect: (caster, targets) => {
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 31) + 30;
        const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
        dmg = Math.round(dmg * bonus * arcaneBonus);
        let isResisted = false;
        let isWeakness = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          if (t.magicResist > 0) isResisted = true;
          if (t.magicResist < 0) isWeakness = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted, isWeakness };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => {
        let suffix = "";
        if (r.isResisted) suffix = "【レジスト】";
        if (r.isWeakness) suffix = "【弱点直撃！】";
        return `${r.name}に${r.dmg}のダメージ${suffix}`;
      }).join(", ");
      return { log: `${caster.name}はマダルトを唱えた！氷の嵐が敵全体を凍りつかせる！(${logDetails})` };
    }
  },
  TILTOWAIT: {
    name: "TILTOWAIT",
    type: "mage",
    level: 8,
    cost: 6,
    target: "all_enemies",
    desc: "極大爆裂呪文 (50-100 DMG)",
    effect: (caster, targets) => {
      const intVal = caster ? getCharInt(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (intVal - 10) * 0.01));
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 51) + 50;
        const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
        dmg = Math.round(dmg * bonus * arcaneBonus);
        let isResisted = false;
        let isWeakness = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          if (t.magicResist > 0) isResisted = true;
          if (t.magicResist < 0) isWeakness = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted, isWeakness };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => {
        let suffix = "";
        if (r.isResisted) suffix = "【レジスト】";
        if (r.isWeakness) suffix = "【弱点直撃！】";
        return `${r.name}に${r.dmg}のダメージ${suffix}`;
      }).join(", ");
      return { log: `${caster.name}はティルトウェイトを唱えた！極大爆裂の光が敵全体を消滅させる！(${logDetails})` };
    }
  },

  // Priest Spells
  DIOS: {
    name: "DIOS",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    desc: "軽微な治療 (10-20 HP回復)",
    effect: (caster, target) => {
      let heal = Math.floor(Math.random() * 11) + 10;
      const pieVal = caster ? getCharPie(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
      heal = Math.round(heal * bonus * devotionBonus);
      const oldHp = target.hp;
      const maxHp = getCharMaxHp(target);
      target.hp = Math.min(maxHp, target.hp + heal);
      const actualHeal = target.hp - oldHp;
      if (actualHeal === 0) {
        return { heal: 0, log: `${caster.name}はディオスを唱えたが、${target.name}のHPは最大だった。` };
      }
      return { heal: actualHeal, log: `${caster.name}はディオスを唱えた！${target.name}のHPを${actualHeal}回復した。` };
    }
  },
  DIURCO: {
    name: "DIURCO",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    desc: "盲目治療呪文 (盲目を治療する)",
    effect: (caster, target) => {
      let cured = false;
      if (target.status === "blind") {
        target.status = "ok";
        cured = true;
      }
      return { log: `${caster.name}は${target.name}にディウルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
    }
  },
  BADIOS: {
    name: "BADIOS",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_enemy",
    desc: "不浄への一撃 (5-15 HPダメージ)",
    effect: (caster, target) => {
      let dmg = Math.floor(Math.random() * 11) + 5;
      const pieVal = caster ? getCharPie(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      const arcaneBonus = caster ? (1.0 + getCharAffixSum(caster, "arcane") / 100) : 1.0;
      dmg = Math.round(dmg * bonus * arcaneBonus);
      let suffix = "";
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
        if (target.magicResist > 0) {
          suffix = "【レジスト！】呪文がレジストされた…";
        } else if (target.magicResist < 0) {
          suffix = "【弱点直撃！】呪文が弱点に大ダメージ！";
        }
      }
      return { damage: dmg, log: `${caster.name}はバディオスを唱えた！${target.name}に${dmg}の神聖ダメージ！${suffix}` };
    }
  },
  MILWA: {
    name: "MILWA",
    type: "priest",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "明かりの呪文 (30歩の間、地図を表示)",
    effect: (caster, state) => {
      const pieVal = caster ? getCharPie(caster) : 10;
      const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      const steps = Math.round(30 * durationBonus);
      state.lightTurns = (state.lightTurns || 0) + steps;
      return { log: `${caster.name}はミルワを唱えた！周囲が明るくなり、ミニマップが${steps}歩の間表示される。` };
    }
  },
  DIALKO: {
    name: "DIALKO",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "状態異常治療 (睡眠・麻痺の回復)",
    effect: (caster, target) => {
      let cured = false;
      if (target.status === "sleep" || target.status === "paralyze" || target.status === "paralyzed") {
        target.status = "ok";
        cured = true;
      }
      return { log: `${caster.name}は${target.name}にディアルコを唱えた。${cured ? "状態異常が回復した！" : "しかし効果がなかった。"}` };
    }
  },
  MADIOS: {
    name: "MADIOS",
    type: "priest",
    level: 2,
    cost: 3,
    target: "single_ally",
    desc: "中度の治療 (35-70 HP回復)",
    effect: (caster, target) => {
      let heal = Math.floor(Math.random() * 36) + 35;
      const pieVal = caster ? getCharPie(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      heal = Math.round(heal * bonus);
      const oldHp = target.hp;
      const maxHp = getCharMaxHp(target);
      target.hp = Math.min(maxHp, target.hp + heal);
      const actualHeal = target.hp - oldHp;
      if (actualHeal === 0) {
        return { heal: 0, log: `${caster.name}はマディオスを唱えたが、${target.name}のHPは最大だった。` };
      }
      return { heal: actualHeal, log: `${caster.name}はマディオスを唱えた！${target.name}のHPを${actualHeal}大幅に回復した。` };
    }
  },
  LATUMOFIS: {
    name: "LATUMOFIS",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "解毒呪文 (毒状態を治療する)",
    effect: (caster, target) => {
      let cured = false;
      if (target.status === "poisoned") {
        target.status = "ok";
        cured = true;
      }
      return { log: `${caster.name}は${target.name}にラツモフィスを唱えた。${cured ? "毒が消え去った！" : "しかし効果がなかった。"}` };
    }
  },
  LOMILWA: {
    name: "LOMILWA",
    type: "priest",
    level: 3,
    cost: 4,
    target: "utility",
    desc: "永続の明かり (100歩の間、地図を表示)",
    effect: (caster, state) => {
      const pieVal = caster ? getCharPie(caster) : 10;
      const durationBonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      const steps = Math.round(100 * durationBonus);
      state.lightTurns = (state.lightTurns || 0) + steps;
      return { log: `${caster.name}はロミルワを唱えた！まばゆい光が暗闇を払い、ミニマップが${steps}歩の間表示される。` };
    }
  },
  DIALMA: {
    name: "DIALMA",
    type: "priest",
    level: 8,
    cost: 4,
    target: "single_ally",
    desc: "高度の治療 (70-120 HP回復)",
    effect: (caster, target) => {
      let heal = Math.floor(Math.random() * 51) + 70;
      const pieVal = caster ? getCharPie(caster) : 10;
      const bonus = 1.0 + Math.min(0.20, Math.max(0, (pieVal - 10) * 0.01));
      const devotionBonus = caster ? (1.0 + getCharAffixSum(caster, "devotion") / 100) : 1.0;
      heal = Math.round(heal * bonus * devotionBonus);
      const oldHp = target.hp;
      const maxHp = getCharMaxHp(target);
      target.hp = Math.min(maxHp, target.hp + heal);
      const actualHeal = target.hp - oldHp;
      if (actualHeal === 0) {
        return { heal: 0, log: `${caster.name}はディアルマを唱えたが、${target.name}のHPは最大だった。` };
      }
      return { heal: actualHeal, log: `${caster.name}はディアルマを唱えた！${target.name}のHPを${actualHeal}大回復した。` };
    }
  },
  KADORTO: {
    name: "KADORTO",
    type: "priest",
    level: 9,
    cost: 8,
    target: "single_ally",
    desc: "神聖蘇生呪文 (死亡した仲間をキャンプ中に蘇生)",
    campOnly: true,
    effect: (caster, target) => {
      let cured = false;
      if (target.status === "dead") {
        target.status = "ok";
        target.hp = 1;
        cured = true;
      }
      return { log: `${caster.name}は${target.name}にカドルトを唱えた。${cured ? "奇跡が起き、息を吹き返した！" : "しかし効果がなかった。"}` };
    }
  }

};

// Item Database
export const ITEMS = {
  // Weapons
  DAGGER: { id: "DAGGER", name: "ダガー", type: "weapon", atk: 3, price: 50, desc: "シンプルな短剣。攻撃力+3 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  WAND: { id: "WAND", name: "魔術師の杖", type: "weapon", atk: 4, price: 120, desc: "神秘的な魔力を宿した木の杖。攻撃力+4 [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"] },
  SHORT_SWORD: { id: "SHORT_SWORD", name: "ショートソード", type: "weapon", atk: 6, price: 150, desc: "使いやすい鉄の小太刀。攻撃力+6 [戦・盗・侍・野用]", classes: ["Fighter", "Thief", "Samurai", "Ranger"] },
  NINJA_DAGGER: { id: "NINJA_DAGGER", name: "忍びの短刀", type: "weapon", atk: 9, price: 300, desc: "暗殺用の鋭い短刀。攻撃力+9 [盗・忍用]", classes: ["Thief", "Ninja"] },
  LONG_SWORD: { id: "LONG_SWORD", name: "ロングソード", type: "weapon", atk: 12, price: 400, desc: "両刃 of 美しい鋼鉄長剣。攻撃力+12 [戦・侍・野用]", classes: ["Fighter", "Samurai", "Ranger"] },
  CLAYMORE: { id: "CLAYMORE", name: "クレイモア", type: "weapon", atk: 18, price: 750, desc: "重量のある両手大剣。攻撃力+18 [戦・侍用]", classes: ["Fighter", "Samurai"] },
  KATANA: { id: "KATANA", name: "名刀ムラマサ", type: "weapon", atk: 25, price: 1500, desc: "伝説の妖刀。攻撃力+25 [戦・侍用]", classes: ["Fighter", "Samurai"] },
  MACE: { id: "MACE", name: "メイス", type: "weapon", atk: 5, price: 100, desc: "打撃用の重い金属槌。攻撃力+5 [戦・僧・司・野用]", classes: ["Fighter", "Priest", "Bishop", "Ranger"] },

  // Shields
  SMALL_SHIELD: { id: "SMALL_SHIELD", name: "スモールシールド", type: "shield", def: 2, price: 80, desc: "木製の丸い小盾。防御力+2 [戦・盗・僧・侍・野用]", classes: ["Fighter", "Thief", "Priest", "Samurai", "Ranger"] },
  LARGE_SHIELD: { id: "LARGE_SHIELD", name: "ラージシールド", type: "shield", def: 5, price: 250, desc: "鉄製の頑丈な大盾。防御力+5 [戦・侍用]", classes: ["Fighter", "Samurai"] },
  KNIGHT_SHIELD: { id: "KNIGHT_SHIELD", name: "ナイトシールド", type: "shield", def: 8, price: 450, desc: "騎士用の鋼鉄盾。防御力+8 [戦・侍用]", classes: ["Fighter", "Samurai"] },

  // Armor
  ROBE: { id: "ROBE", name: "魔法使いのローブ", type: "armor", def: 1, price: 30, desc: "魔力を帯びたシルクの衣。防御力+1 [僧・魔・司用]", classes: ["Priest", "Mage", "Bishop"] },
  MAGE_CLOAK: { id: "MAGE_CLOAK", name: "魔術師のクローク", type: "armor", def: 4, price: 380, desc: "魔力で守られた外套。防御力+4 [魔・司用]", classes: ["Mage", "Bishop"] },
  LEATHER_ARMOR: { id: "LEATHER_ARMOR", name: "レザーアーマー", type: "armor", def: 4, price: 120, desc: "なめし革の胸当て。防御力+4 [戦・盗・僧・侍・野用]", classes: ["Fighter", "Thief", "Priest", "Samurai", "Ranger"] },
  NINJA_SUIT: { id: "NINJA_SUIT", name: "忍者の装束", type: "armor", def: 5, price: 250, desc: "闇に紛れる防具。防御力+5 [盗・忍用]", classes: ["Thief", "Ninja"] },
  SCALE_MAIL: { id: "SCALE_MAIL", name: "スケイルメイル", type: "armor", def: 6, price: 220, desc: "金属片を魚の鱗状に重ねた鎧。防御力+6 [戦・僧・侍・野用]", classes: ["Fighter", "Priest", "Samurai", "Ranger"] },
  CHAIN_MAIL: { id: "CHAIN_MAIL", name: "チェインメイル", type: "armor", def: 8, price: 350, desc: "細かな鉄環を編み込んだ鎧。防御力+8 [戦・僧・侍用]", classes: ["Fighter", "Priest", "Samurai"] },

  PRIEST_ROBE: { id: "PRIEST_ROBE", name: "司祭の法衣", type: "armor", def: 8, price: 500, desc: "神聖な加護を得た法衣。防御力+8 [僧・司用]", classes: ["Priest", "Bishop"] },
  PLATE_MAIL: { id: "PLATE_MAIL", name: "プレートメイル", type: "armor", def: 16, price: 900, desc: "全身を包み込む鋼鉄の板金鎧。防御力+16 [戦・侍用]", classes: ["Fighter", "Samurai"] },

  // Potions / Quest items
  HEAL_POTION: { id: "HEAL_POTION", name: "傷薬 (ディオス薬)", type: "usable", price: 60, desc: "使用するとHPを15回復する。", effect: (char) => {
    char.hp = Math.min(getCharMaxHp(char), char.hp + 15);
    return `${char.name}は傷薬を使い、HPが15回復した。`;
  }},
  ANTIDOTE: { id: "ANTIDOTE", name: "解毒薬 (Antidote)", type: "usable", price: 80, desc: "使用すると毒状態を解除する。", effect: (char) => {
    if (char.status === "poisoned") {
      char.status = "ok";
      return `${char.name}は解毒薬を使い、毒が消え去った。`;
    }
    return `${char.name}は解毒薬を使ったが、何も起こらなかった。`;
  }},
  MANA_POTION: { id: "MANA_POTION", name: "魔力草", type: "usable", price: 200, desc: "使用するとMPを3回復する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], effect: (char) => {
    if (canUsePriestSpells(char) || canUseMageSpells(char)) {
      char.mp = Math.min(getCharMaxMp(char), char.mp + 3);
      return `${char.name}は魔力草を使用し、MPが3回復した。(MP:${char.mp}/${getCharMaxMp(char)})`;
    }
    return `${char.name}は魔力草を使用したが、魔力を持たないため何も起こらなかった。`;
  }},
  HOLY_WATER: { id: "HOLY_WATER", name: "祝福の聖水", type: "usable", price: 100, desc: "使用するとHPを40回復し、毒状態も治療する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], effect: (char) => {
    char.hp = Math.min(getCharMaxHp(char), char.hp + 40);
    let cured = false;
    if (char.status === "poisoned") {
      char.status = "ok";
      cured = true;
    }
    return `${char.name}は祝福の聖水を使い、HPが40回復した。${cured ? "毒も綺麗に消え去った！" : ""}`;
  }},
  TOWN_PORTAL: { id: "TOWN_PORTAL", name: "帰還のスクロール", type: "usable", price: 100, desc: "使用すると一瞬で街に戻る。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], effect: (char) => {
    return `${char.name}は帰還のスクロールを読んだ！`;
  }},
  ELIXIR: { id: "ELIXIR", name: "エリクサー", type: "usable", price: 500, desc: "HP・MPが全回復し、毒・麻痺・盲目も治療する究極 of 霊薬。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], effect: (char) => {
    char.hp = getCharMaxHp(char);
    char.mp = getCharMaxMp(char);
    if (char.status === "poisoned" || char.status === "blind" || char.status === "paralyzed" || char.status === "paralyze" || char.status === "sleep") {
      char.status = "ok";
    }
    return `${char.name}はエリクサーを飲んだ！HP・MPが全回復し、全ての状態異常が消え去った！`;
  }},
  SACRED_ASHES: { id: "SACRED_ASHES", name: "聖灰", type: "usable", price: 1000, desc: "死亡した仲間をキャンプ中にHP1で蘇生させる（所持制限：バッグに1個まで）。", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], campOnly: true, effect: (char) => {
    let cured = false;
    if (char.status === "dead") {
      char.status = "ok";
      char.hp = 1;
      cured = true;
    }
    return `${char.name}に聖灰を振りかけると、${cured ? "奇跡が起き、HP1で息を吹き返した！" : "しかし何も起こらなかった。"}`;
  }},
  LEGENDARY_SWORD: { id: "LEGENDARY_SWORD", name: "神剣エクスカリバー", type: "weapon", atk: 40, price: 3000, desc: "聖なる光を放つ伝説の神剣。攻撃力+40 [戦・侍用]", classes: ["Fighter", "Samurai"] },
  LEGENDARY_SHIELD: { id: "LEGENDARY_SHIELD", name: "イージスの盾", type: "shield", def: 15, price: 2000, desc: "あらゆる厄災を払う神の盾。防御力+15 [戦・侍用]", classes: ["Fighter", "Samurai"] },
  ANTIGRAVITY_CRYSTAL: { id: "ANTIGRAVITY_CRYSTAL", name: "浮遊石 (クリスタル)", type: "quest", price: 0, desc: "青く浮かび上がる伝説の結晶。城に持ち帰ると勝利。" },
  DRAGON_KEY: { id: "DRAGON_KEY", name: "竜の鍵", type: "quest", price: 0, desc: "いにしえの竜の巣へと通じる刻印が刻まれた鍵。" }
};

// Monsters Database
export const MONSTERS = [
  { name: "かみつき蟲", level: 1, hp: 6, atk: 4, def: 1, exp: 40, gold: 5, spriteType: "biter", color: "#00ff66" },
  { name: "ゴブリンの呪術師", level: 1, hp: 10, atk: 4, def: 2, exp: 50, gold: 12, spriteType: "kobold", spell: "HALITO", spellChance: 0.3, color: "#00ff66" },
  { name: "コボルトの斥候", level: 1, hp: 8, atk: 5, def: 2, exp: 60, gold: 10, spriteType: "kobold", color: "#00ff66" },
  { name: "ゾンビ", level: 2, hp: 16, atk: 7, def: 3, exp: 120, gold: 20, spriteType: "zombie", isParalyzing: true, color: "#8a2be2" },
  { name: "ガイコツ戦士", level: 2, hp: 20, atk: 9, def: 4, exp: 180, gold: 35, spriteType: "skeleton", isParalyzing: true, color: "#dcdcdc" },
  { name: "キラーラビット", level: 2, hp: 16, atk: 12, def: 4, exp: 120, gold: 20, spriteType: "rabbit", color: "#ff8c00" },
  { name: "マッドゴースト", level: 2, hp: 14, atk: 6, def: 2, exp: 140, gold: 15, spriteType: "spirit", isParalyzing: true, physResist: 0.5, color: "#8a2be2" },
  { name: "オークの戦士", level: 3, hp: 28, atk: 12, def: 6, exp: 280, gold: 50, spriteType: "orc", color: "#ff8c00" },
  { name: "はぐれ魔術師", level: 3, hp: 22, atk: 8, def: 4, exp: 360, gold: 80, spriteType: "mage", spell: "HALITO", spellChance: 0.3, color: "#da70d6" },
  { name: "ワーウルフ", level: 3, hp: 36, atk: 14, def: 5, exp: 340, gold: 60, spriteType: "orc", isPoisonous: true, color: "#ff8c00" },
  { name: "バンシー", level: 3, hp: 28, atk: 9, def: 3, exp: 360, gold: 45, spriteType: "spirit", isParalyzing: true, magicResist: 0.6, physResist: 0.2, statusChance: 0.2, color: "#da70d6" },
  
  // 既存モンスターの再調整
  { name: "スピリット", level: 2, hp: 18, atk: 6, def: 2, exp: 180, gold: 25, spriteType: "spirit", physResist: 0.6, magicResist: -0.2, color: "#00e5ff" },
  { name: "ウィル・オー・ウィスプ", level: 3, hp: 24, atk: 7, def: 2, exp: 260, gold: 40, spriteType: "wisp", magicResist: 0.8, color: "#ffffff" },
  { name: "ジャイアントスパイダー", level: 2, hp: 18, atk: 7, def: 3, exp: 150, gold: 25, spriteType: "spider", isPoisonous: true, color: "#bf5af2" },
  { name: "フラッシュバット", level: 2, hp: 12, atk: 5, def: 2, exp: 100, gold: 15, spriteType: "bat", isBlinding: true, color: "#e5ff00" },

  { name: "マスターメイジ", level: 4, hp: 38, atk: 9, def: 5, exp: 650, gold: 100, spriteType: "mage", spell: "LAHALITO", spellChance: 0.35, magicResist: 0.3, color: "#ff3b30" },
  { name: "ポイズンジャイアント", level: 4, hp: 65, atk: 19, def: 7, exp: 600, gold: 120, spriteType: "zombie", isPoisonous: true, color: "#bf5af2" },
  
  { name: "デーモンガード", level: 5, hp: 90, atk: 18, def: 8, exp: 2000, gold: 300, spriteType: "flack", spell: "LAHALITO", isBoss: true, isMidboss: true, color: "#ff8c00" },
  { name: "アースジャイアント", level: 6, hp: 72, atk: 18, def: 10, exp: 1500, gold: 150, spriteType: "zombie", magicResist: -0.25, color: "#8a2be2" },
  { name: "マスターデーモン", level: 7, hp: 70, atk: 16, def: 8, exp: 1800, gold: 200, spriteType: "flack", spell: "MADALTO", spellChance: 0.3, magicResist: 0.3, color: "#ff3b30" },
  
  { name: "フラック", level: 4, hp: 130, atk: 23, def: 11, exp: 3000, gold: 350, spriteType: "flack", spell: "LAHALITO", spellChance: 0.25, physResist: 0.2, magicResist: 0.2, isRare: true, dangerRare: true, color: "#ff3b30" },
  { name: "ドラゴンパピー", level: 4, hp: 45, atk: 12, def: 5, exp: 600, gold: 60, spriteType: "dragon", spell: "HALITO", color: "#ffc0cb" },
  { name: "ワイバーン", level: 5, hp: 65, atk: 17, def: 7, exp: 1200, gold: 120, spriteType: "dragon", spell: "LAHALITO", color: "#ffa500" },
  { name: "レッドドラゴン", level: 7, hp: 100, atk: 22, def: 10, exp: 3500, gold: 400, spriteType: "dragon", spell: "MADALTO", color: "#ff3b30" },
  { name: "アイアンゴーレム", level: 3, hp: 32, atk: 10, def: 14, exp: 500, gold: 50, spriteType: "zombie", physResist: 0.5, magicResist: -0.5, color: "#8e8e93" },
  { name: "マッドスライム", level: 1, hp: 28, atk: 4, def: 1, exp: 120, gold: 20, spriteType: "biter", physResist: 0.4, magicResist: -0.5, color: "#ff9500" },
  { name: "メタルパピー", level: 3, hp: 8, atk: 5, def: 10, exp: 2000, gold: 500, spriteType: "biter", fleeChance: 0.50, color: "#ffd700", isRare: true, treasureRare: true },
  { name: "オークの呪医", level: 2, hp: 22, atk: 5, def: 3, exp: 200, gold: 35, spriteType: "orc", spell: "DIOS", spellChance: 0.3, color: "#34c759" },
  { name: "プリーストデーモン", level: 5, hp: 60, atk: 12, def: 6, exp: 900, gold: 150, spriteType: "flack", spell: "DIALMA", spellChance: 0.3, color: "#34c759" },
  { name: "スケルトンアーチャー", level: 2, hp: 16, atk: 9, def: 3, exp: 150, gold: 30, spriteType: "skeleton", isSniper: true, color: "#af52de" },
  { name: "ダークアサシン", level: 3, hp: 28, atk: 14, def: 4, exp: 350, gold: 60, spriteType: "kobold", isSniper: true, color: "#ff3b30" },
  { name: "いにしえの竜", level: 8, hp: 320, atk: 26, def: 16, exp: 7000, gold: 1000, spriteType: "dragon", spell: "TILTOWAIT", magicResist: 0.25, isBoss: true, color: "#ff3b30" },

  // 追加モンスター
  { name: "リビングアーマー", level: 2, hp: 26, atk: 8, def: 10, exp: 260, gold: 40, spriteType: "zombie", magicResist: -0.25, color: "#8e8e93" },
  { name: "呪文喰い", level: 3, hp: 34, atk: 10, def: 4, exp: 420, gold: 60, spriteType: "spirit", magicResist: 0.75, color: "#4cd964" },
  { name: "ストーンガード", level: 5, hp: 55, atk: 15, def: 16, exp: 1200, gold: 140, spriteType: "zombie", magicResist: -0.4, color: "#708090" },
  { name: "カースドハンド", level: 3, hp: 20, atk: 7, def: 3, exp: 320, gold: 45, spriteType: "zombie", isParalyzing: true, statusChance: 0.25, color: "#5856d6" },
  { name: "ブラッドバット群", level: 2, hp: 10, atk: 5, def: 1, exp: 90, gold: 10, spriteType: "bat", color: "#ff3b30" },
  { name: "ドラゴンワーム", level: 5, hp: 42, atk: 14, def: 6, exp: 850, gold: 80, spriteType: "dragon", color: "#ff9500" }
];

// Dungeon Map Grid 24x24
export const MAP_WIDTH = 24;
export const MAP_HEIGHT = 24;

export const START_X = 1;
export const START_Y = 22;

export function canUsePriestSpells(char) {
  if (!char) return false;
  if (char.class === "Priest" || char.class === "Bishop") return true;
  if (char.class === "Ranger" && char.level >= 3) return true;
  return false;
}

export function canUseMageSpells(char) {
  if (!char) return false;
  if (char.class === "Mage" || char.class === "Bishop") return true;
  if (char.class === "Samurai" && char.level >= 3) return true;
  return false;
}

export function isSpellcaster(char) {
  return canUsePriestSpells(char) || canUseMageSpells(char);
}

export function getClassJpName(cls) {
  const mapping = {
    Fighter: "戦士",
    Thief: "盗賊",
    Priest: "僧侶",
    Mage: "魔術師",
    Samurai: "侍",
    Bishop: "司祭",
    Ranger: "野伏",
    Ninja: "忍者"
  };
  return mapping[cls] || cls;
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
        const isMagicAura = ["WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE"].includes(base.id);
        prefix = isMagicAura ? "青く光る" : "古びた";
      } else if (rarity === "rare") {
        prefix = "金紋の";
      } else if (rarity === "epic") {
        prefix = "紫光を放つ";
      }

      let typeName = "武器";
      if (base.type === "shield") {
        typeName = "盾";
      } else if (base.type === "armor") {
        const isRobe = ["ROBE", "MAGE_CLOAK", "PRIEST_ROBE"].includes(base.id);
        typeName = isRobe ? "ローブ" : "鎧";
      } else if (base.type === "weapon") {
        if (base.id === "WAND") {
          typeName = "杖";
        } else if (["DAGGER", "NINJA_DAGGER", "SHORT_SWORD"].includes(base.id)) {
          typeName = "短剣";
        } else if (["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA"].includes(base.id)) {
          typeName = "剣";
        } else if (base.id === "MACE") {
          typeName = "メイス";
        }
      }
      
      const unidentName = `${prefix}未鑑定の${typeName}`;
      
      return {
        ...base,
        id: itemOrKey,
        name: unidentName,
        desc: `${unidentName}。街の商店で鑑定できます。`,
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
    }
    
    const name = prefix ? `${prefix}${base.name}` : base.name;
    
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
        treasureSense: "宝探"
      }[aff.type];
      const sign = aff.value >= 0 ? "+" : "";
      const unit = ["trapBonus", "followUp", "arcane", "devotion", "guardian", "treasureSense"].includes(aff.type) ? "%" : "";
      return `${label}${sign}${aff.value}${unit}`;
    }).join(" / ");
    
    let desc = `${base.desc} [${affixDesc}]`;
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

export function generateRandomEquipment(floor, forceRarity = null, rng = Math.random) {
  let baseCandidates = [];
  if (floor === 1) {
    baseCandidates = ["DAGGER", "WAND", "MACE", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR"];
  } else if (floor === 2) {
    baseCandidates = ["DAGGER", "WAND", "SHORT_SWORD", "MACE", "SMALL_SHIELD", "ROBE", "LEATHER_ARMOR", "SCALE_MAIL", "MAGE_CLOAK"];
  } else if (floor === 3) {
    baseCandidates = ["SHORT_SWORD", "NINJA_DAGGER", "LONG_SWORD", "MACE", "SMALL_SHIELD", "LARGE_SHIELD", "LEATHER_ARMOR", "NINJA_SUIT", "SCALE_MAIL", "CHAIN_MAIL"];
  } else if (floor === 4) {
    baseCandidates = ["CLAYMORE", "KATANA", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "NINJA_DAGGER", "NINJA_SUIT", "CHAIN_MAIL"];
  } else {
    baseCandidates = ["CLAYMORE", "PLATE_MAIL", "PRIEST_ROBE", "KNIGHT_SHIELD", "KATANA", "NINJA_DAGGER", "NINJA_SUIT"];
  }
  
  // Smart Drop (70%): Select base items usable by the current party
  if (rng() < 0.70 && globalState && globalState.party && globalState.party.length > 0) {
    const usableCandidates = baseCandidates.filter(baseId => {
      const item = ITEMS[baseId];
      if (!item) return false;
      return globalState.party.some(char => {
        if (char.status === "dead") return false;
        return !item.classes || item.classes.includes(char.class);
      });
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
    if (roll < 0.05) rarity = "epic";
    else if (roll < 0.30) rarity = "rare";
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
  
  if (baseItem.type === "weapon") {
    possibleAffixes.push({ type: "atk", getVal: () => Math.floor(rng() * maxWpBonus) + 1 });
  }
  if (baseItem.type === "armor" || baseItem.type === "shield") {
    possibleAffixes.push({ type: "def", getVal: () => Math.floor(rng() * maxArBonus) + 1 });
  }
  possibleAffixes.push({ type: "hp", getVal: () => {
    const minHp = floor + 1;
    const maxHp = floor * 2 + 2;
    return Math.floor(rng() * (maxHp - minHp + 1)) + minHp;
  }});
  
  const isMpEligible = baseId === "WAND" || baseId === "ROBE" || baseId === "PRIEST_ROBE" || baseId === "MAGE_CLOAK";
  if (isMpEligible) {
    possibleAffixes.push({ type: "mp", getVal: () => {
      const maxMpBonus = floor >= 5 ? 4 : (floor >= 3 ? 2 : 1);
      return Math.floor(rng() * maxMpBonus) + 1;
    }});
  }
  
  const stats = ["str", "int", "pie", "vit", "agi", "luk"];
  stats.forEach(stat => {
    possibleAffixes.push({ type: stat, getVal: () => {
      const maxStat = floor >= 5 ? 3 : (floor >= 3 ? 2 : 1);
      return Math.floor(rng() * maxStat) + 1;
    }});
  });
  
  const isTrapEligible = baseId === "DAGGER" || baseId === "NINJA_DAGGER" || baseId === "LEATHER_ARMOR" || baseId === "NINJA_SUIT";
  if (isTrapEligible) {
    possibleAffixes.push({ type: "trapBonus", getVal: () => {
      if (floor >= 5) return 15;
      if (floor >= 3) return 10;
      return 5;
    }});
  }

  // New build-specific affixes
  const isFollowUpEligible = ["LONG_SWORD", "CLAYMORE", "LEGENDARY_SWORD", "KATANA", "DAGGER", "NINJA_DAGGER", "SHORT_SWORD"].includes(baseId);
  if (isFollowUpEligible) {
    possibleAffixes.push({ type: "followUp", getVal: () => Math.floor(rng() * 5) + 8 }); // 8-12%
  }
  const isArcaneEligible = ["WAND", "ROBE", "MAGE_CLOAK", "PRIEST_ROBE"].includes(baseId);
  if (isArcaneEligible) {
    possibleAffixes.push({ type: "arcane", getVal: () => 10 }); // +10%
  }
  const isDevotionEligible = ["MACE", "PRIEST_ROBE"].includes(baseId);
  if (isDevotionEligible) {
    possibleAffixes.push({ type: "devotion", getVal: () => 10 }); // +10%
  }
  const isGuardianEligible = ["SMALL_SHIELD", "LARGE_SHIELD", "KNIGHT_SHIELD", "LEGENDARY_SHIELD", "PLATE_MAIL", "CHAIN_MAIL", "SCALE_MAIL"].includes(baseId);
  if (isGuardianEligible) {
    possibleAffixes.push({ type: "guardian", getVal: () => 10 }); // -10%
  }
  const isTreasureSenseEligible = ["LEATHER_ARMOR", "NINJA_SUIT", "DAGGER", "NINJA_DAGGER", "SHORT_SWORD"].includes(baseId);
  if (isTreasureSenseEligible) {
    possibleAffixes.push({ type: "treasureSense", getVal: () => 5 }); // +5%
  }
  
  const affixes = [];
  const selectedTypes = new Set();
  
  for (let i = 0; i < affixCount; i++) {
    const available = possibleAffixes.filter(aff => !selectedTypes.has(aff.type));
    if (available.length === 0) break;
    const chosen = available[Math.floor(rng() * available.length)];
    affixes.push({
      type: chosen.type,
      value: chosen.getVal()
    });
    selectedTypes.add(chosen.type);
  }
  
  const instanceId = `eq_${rng().toString(36).substr(2, 9)}`;
  
  return {
    kind: "equipment",
    instanceId,
    baseId,
    rarity,
    level: floor,
    identified: false,
    affixes
  };
}

export function getCharStr(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.str) {
          bonus += eqData.statsBonus.str;
        }
      }
    });
  }
  return char.str + bonus;
}

export function getCharInt(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.int) {
          bonus += eqData.statsBonus.int;
        }
      }
    });
  }
  return char.int + bonus;
}

export function getCharPie(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.pie) {
          bonus += eqData.statsBonus.pie;
        }
      }
    });
  }
  return char.pie + bonus;
}

export function getCharVit(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.vit) {
          bonus += eqData.statsBonus.vit;
        }
      }
    });
  }
  return char.vit + bonus;
}

export function getCharAgi(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.agi) {
          bonus += eqData.statsBonus.agi;
        }
      }
    });
  }
  return char.agi + bonus;
}

export function getCharLuk(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.statsBonus && eqData.statsBonus.luk) {
          bonus += eqData.statsBonus.luk;
        }
      }
    });
  }
  return char.luk + bonus;
}

export function getCharMaxHp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.hpBonus) {
          bonus += eqData.hpBonus;
        }
      }
    });
  }
  return char.maxHp + bonus;
}

export function getCharMaxMp(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.mpBonus) {
          bonus += eqData.mpBonus;
        }
      }
    });
  }
  return char.maxMp + bonus;
}

export function getCharTrapBonus(char) {
  if (!char) return 0;
  let bonus = 0;
  if (char.equipment) {
    Object.values(char.equipment).forEach(eqKey => {
      if (eqKey) {
        const eqData = getItemData(eqKey);
        if (eqData && eqData.trapBonus) {
          bonus += eqData.trapBonus / 100;
        }
      }
    });
  }
  return bonus;
}

export const EVENT_TYPES = {
  CHEST: "chest",
  SPRING: "event_spring",
  TABLET: "event_tablet",
  MERCHANT: "event_merchant",
  MIDBOSS: "midboss",
  BOSS: "boss"
};

export function getItemBaseId(item) {
  if (!item) return "";
  if (typeof item === "object") {
    return item.baseId || item.key || item.id || "";
  }
  return item;
}

export const EXP_LEVELS = [0, 0, 200, 800, 2000, 4500, 9000, 16000, 25000, 40000, 60000];

// Get Weapon Atk
export function getCharWeaponAtk(char) {
  const wpId = char.equipment.weapon;
  if (!wpId) {
    if (char.class === "Ninja") {
      return 3 * char.level; // Ninja bare hands damage scaling
    }
    return 0;
  }
  return getItemData(wpId)?.atk || 0;
}

// Get Total Armor Def
export function getCharDef(char) {
  let def = 0;
  if (char.equipment.shield) {
    def += getItemData(char.equipment.shield)?.def || 0;
  }
  if (char.equipment.armor) {
    def += getItemData(char.equipment.armor)?.def || 0;
  }
  return def;
}

// Check Level Up
export function checkCharLevelUp(char) {
  const nextLvl = char.level + 1;
  if (nextLvl >= EXP_LEVELS.length) return false; // Max level reached

  // Ninja requires 1.5x EXP
  const req = char.class === "Ninja" ? Math.floor(EXP_LEVELS[nextLvl] * 1.5) : EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;
    
    // Gain HP
    let hpGain = 0;
    if (char.class === "Fighter") hpGain = Math.floor(Math.random() * 8) + 8; // 8-15
    else if (char.class === "Thief") hpGain = Math.floor(Math.random() * 5) + 6; // 6-10
    else if (char.class === "Priest") hpGain = Math.floor(Math.random() * 5) + 5; // 5-9
    else if (char.class === "Mage") hpGain = Math.floor(Math.random() * 4) + 4; // 4-7
    else if (char.class === "Samurai") hpGain = Math.floor(Math.random() * 8) + 7; // 7-14
    else if (char.class === "Bishop") hpGain = Math.floor(Math.random() * 5) + 5; // 5-9
    else if (char.class === "Ranger") hpGain = Math.floor(Math.random() * 7) + 6; // 6-13
    else if (char.class === "Ninja") hpGain = Math.floor(Math.random() * 9) + 6; // 6-14
    
    char.maxHp += hpGain;
    char.hp = getCharMaxHp(char);

    // Gain MP
    if (char.class === "Priest") {
      const mpGain = Math.floor(Math.random() * 2) + 2; // 2-3
      char.maxMp += mpGain;
      char.mp = getCharMaxMp(char);
    } else if (char.class === "Mage") {
      const mpGain = Math.floor(Math.random() * 2) + 3; // 3-4
      char.maxMp += mpGain;
      char.mp = getCharMaxMp(char);
    } else if (char.class === "Bishop") {
      const mpGain = Math.floor(Math.random() * 2) + 1; // 1-2
      char.maxMp += mpGain;
      char.mp = getCharMaxMp(char);
    } else if (char.class === "Samurai" || char.class === "Ranger") {
      if (char.level >= 3) {
        if (char.maxMp === 0) {
          char.maxMp = 3; // Initialize at level 3
        } else {
          char.maxMp += Math.floor(Math.random() * 2) + 1; // 1-2
        }
        char.mp = getCharMaxMp(char);
      }
    }

    // Gain Stats
    if (Math.random() < 0.6) char.str += 1;
    if (Math.random() < 0.6) char.vit += 1;
    if (Math.random() < 0.6) char.agi += 1;
    if (Math.random() < 0.6) char.luk += 1;
    if ((char.class === "Mage" || char.class === "Bishop") && Math.random() < 0.8) char.int += 1;
    if ((char.class === "Priest" || char.class === "Bishop" || char.class === "Ranger") && Math.random() < 0.8) char.pie += 1;
    if ((char.class === "Samurai" || char.class === "Ninja") && Math.random() < 0.8) char.str += 1;
    if ((char.class === "Samurai" || char.class === "Ninja") && Math.random() < 0.8) char.vit += 1;
    if (char.class === "Ninja" && Math.random() < 0.8) char.agi += 1;

    // Learn spells
    if (!char.spells) char.spells = [];
    if (char.class === "Priest") {
      if (char.level === 2 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 3 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Mage") {
      if (char.level === 2 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 3) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 4 && !char.spells.includes("MASFEAL")) {
        char.spells.push("MASFEAL");
      }
      if (char.level === 6 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 8 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Samurai") {
      if (char.level === 3) {
        char.spells.push("HALITO", "DUMAPIC");
      }
      if (char.level === 4 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 5) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 7 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 9 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Ranger") {
      if (char.level === 3) {
        char.spells.push("DIOS", "MILWA", "DIURCO", "BADIOS");
      }
      if (char.level === 4 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 5 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 10 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Bishop") {
      if (char.level === 2) {
        ["MILWA", "DIURCO", "BADIOS", "DUMAPIC"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 3) {
        ["MADIOS", "DIALKO", "LATUMOFIS", "LAHALITO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 4) {
        ["LOMILWA", "KATINO", "MASFEAL"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 5 && !char.spells.includes("MAHALITO")) {
        char.spells.push("MAHALITO");
      }
      if (char.level === 7) {
        ["DIALMA", "MADALTO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
      if (char.level === 10 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    }
    return true;
  }
  return false;
}

let globalState = null;
export function registerState(stateObj) {
  globalState = stateObj;
}

export function getCharAffixSum(char, affixType) {
  if (!char || !char.equipment) return 0;
  let sum = 0;
  Object.values(char.equipment).forEach(eqKey => {
    if (eqKey && typeof eqKey === "object" && eqKey.identified && eqKey.affixes) {
      eqKey.affixes.forEach(aff => {
        if (aff.type === affixType) {
          sum += aff.value;
        }
      });
    }
  });
  return sum;
}



