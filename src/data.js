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
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      }
      return { damage: dmg, log: `${caster.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！${target && target.magicResist ? "（呪文がレジストされた！）" : ""}` };
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
      targets.forEach(t => {
        if (t.hp > 0 && Math.random() < 0.6) {
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
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 21) + 15;
        let isResisted = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          isResisted = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => `${r.name}に${r.dmg}のダメージ${r.isResisted ? "(半減)" : ""}`).join(", ");
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
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      }
      return { damage: dmg, log: `${caster.name}はマハリトを唱えた！${target.name}に${dmg}の熱線ダメージ！${target && target.magicResist ? "（呪文がレジストされた！）" : ""}` };
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
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 31) + 30;
        let isResisted = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          isResisted = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => `${r.name}に${r.dmg}のダメージ${r.isResisted ? "(半減)" : ""}`).join(", ");
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
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        let dmg = Math.floor(Math.random() * 51) + 50;
        let isResisted = false;
        if (t.magicResist) {
          dmg = Math.max(0, Math.round(dmg * (1 - t.magicResist)));
          isResisted = true;
        }
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg, isResisted };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => `${r.name}に${r.dmg}のダメージ${r.isResisted ? "(半減)" : ""}`).join(", ");
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
      const heal = Math.floor(Math.random() * 11) + 10;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return { heal, log: `${caster.name}はディオスを唱えた！${target.name}のHPを${heal}回復した。` };
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
      if (target && target.magicResist) {
        dmg = Math.max(0, Math.round(dmg * (1 - target.magicResist)));
      }
      return { damage: dmg, log: `${caster.name}はバディオスを唱えた！${target.name}に${dmg}の神聖ダメージ！${target && target.magicResist ? "（呪文がレジストされた！）" : ""}` };
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
      state.lightTurns = (state.lightTurns || 0) + 30;
      return { log: `${caster.name}はミルワを唱えた！周囲が明るくなり、ミニマップが30歩の間表示される。` };
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
      const heal = Math.floor(Math.random() * 36) + 35;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return { heal, log: `${caster.name}はマディオスを唱えた！${target.name}のHPを${heal}大幅に回復した。` };
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
      state.lightTurns = (state.lightTurns || 0) + 100;
      return { log: `${caster.name}はロミルワを唱えた！まばゆい光が暗闇を払い、ミニマップが100歩の間表示される。` };
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
      const heal = Math.floor(Math.random() * 51) + 70;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      return { heal, log: `${caster.name}はディアルマを唱えた！${target.name}のHPを${heal}大回復した。` };
    }
  },
  KADORTO: {
    name: "KADORTO",
    type: "priest",
    level: 9,
    cost: 6,
    target: "single_ally",
    desc: "神聖蘇生呪文 (死亡した仲間を蘇生)",
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
  ROBE: { id: "ROBE", name: "魔法使いのローブ", type: "armor", def: 1, price: 30, desc: "魔力を帯びたシルクの衣。防御力+1 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"] },
  MAGE_CLOAK: { id: "MAGE_CLOAK", name: "魔術師のクローク", type: "armor", def: 4, price: 380, desc: "魔力で守られた外套。防御力+4 [魔・司用]", classes: ["Mage", "Bishop"] },
  LEATHER_ARMOR: { id: "LEATHER_ARMOR", name: "レザーアーマー", type: "armor", def: 4, price: 120, desc: "なめし革の胸当て。防御力+4 [戦・盗・僧・侍・野用]", classes: ["Fighter", "Thief", "Priest", "Samurai", "Ranger"] },
  NINJA_SUIT: { id: "NINJA_SUIT", name: "忍者の装束", type: "armor", def: 5, price: 250, desc: "闇に紛れる防具。防御力+5 [盗・忍用]", classes: ["Thief", "Ninja"] },
  SCALE_MAIL: { id: "SCALE_MAIL", name: "スケイルメイル", type: "armor", def: 6, price: 220, desc: "金属片を魚の鱗状に重ねた鎧。防御力+6 [戦・僧・侍・野用]", classes: ["Fighter", "Priest", "Samurai", "Ranger"] },
  CHAIN_MAIL: { id: "CHAIN_MAIL", name: "チェインメイル", type: "armor", def: 8, price: 350, desc: "細かな鉄環を編み込んだ鎧。防御力+8 [戦・僧・侍用]", classes: ["Fighter", "Priest", "Samurai"] },

  PRIEST_ROBE: { id: "PRIEST_ROBE", name: "司祭の法衣", type: "armor", def: 8, price: 500, desc: "神聖な加護を得た法衣。防御力+8 [僧・司用]", classes: ["Priest", "Bishop"] },
  PLATE_MAIL: { id: "PLATE_MAIL", name: "プレートメイル", type: "armor", def: 16, price: 900, desc: "全身を包み込む鋼鉄の板金鎧。防御力+16 [戦・侍用]", classes: ["Fighter", "Samurai"] },

  // Potions / Quest items
  HEAL_POTION: { id: "HEAL_POTION", name: "傷薬 (ディオス薬)", type: "usable", price: 60, desc: "使用するとHPを15回復する。", effect: (char) => {
    char.hp = Math.min(char.maxHp, char.hp + 15);
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
      char.mp = Math.min(char.maxMp, char.mp + 3);
      return `${char.name}は魔力草を使用し、MPが3回復した。(MP:${char.mp}/${char.maxMp})`;
    }
    return `${char.name}は魔力草を使用したが、魔力を持たないため何も起こらなかった。`;
  }},
  HOLY_WATER: { id: "HOLY_WATER", name: "祝福の聖水", type: "usable", price: 180, desc: "使用するとHPを40回復し、毒状態も治療する。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage", "Samurai", "Bishop", "Ranger", "Ninja"], effect: (char) => {
    char.hp = Math.min(char.maxHp, char.hp + 40);
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
  ANTIGRAVITY_CRYSTAL: { id: "ANTIGRAVITY_CRYSTAL", name: "浮遊石 (クリスタル)", type: "quest", price: 0, desc: "青く浮かび上がる伝説の結晶。城に持ち帰ると勝利。" },
  DRAGON_KEY: { id: "DRAGON_KEY", name: "竜の鍵", type: "quest", price: 0, desc: "いにしえの竜の巣へと通じる刻印が刻まれた鍵。" }
};

// Monsters Database
export const MONSTERS = [
  { name: "かみつき蟲", level: 1, hp: 6, atk: 4, def: 1, exp: 40, gold: 5, spriteType: "biter", color: "#00ff66" },
  { name: "ゴブリンの呪術師", level: 1, hp: 10, atk: 4, def: 2, exp: 50, gold: 12, spriteType: "kobold", spell: "HALITO", color: "#00ff66" },
  { name: "コボルトの斥候", level: 1, hp: 8, atk: 5, def: 2, exp: 60, gold: 10, spriteType: "kobold", color: "#00ff66" },
  { name: "ゾンビ", level: 2, hp: 16, atk: 7, def: 3, exp: 120, gold: 20, spriteType: "zombie", isParalyzing: true, color: "#8a2be2" },
  { name: "ガイコツ戦士", level: 2, hp: 20, atk: 9, def: 4, exp: 180, gold: 35, spriteType: "skeleton", isParalyzing: true, color: "#dcdcdc" },
  { name: "キラーラビット", level: 2, hp: 16, atk: 12, def: 4, exp: 120, gold: 20, spriteType: "rabbit", color: "#ff8c00" },
  { name: "マッドゴースト", level: 2, hp: 14, atk: 6, def: 2, exp: 140, gold: 15, spriteType: "spirit", isParalyzing: true, physResist: 0.5, color: "#8a2be2" },
  { name: "オークの戦士", level: 3, hp: 28, atk: 12, def: 6, exp: 280, gold: 50, spriteType: "orc", color: "#ff8c00" },
  { name: "はぐれ魔術師", level: 3, hp: 22, atk: 8, def: 4, exp: 360, gold: 80, spriteType: "mage", spell: "HALITO", color: "#da70d6" },
  { name: "ワーウルフ", level: 3, hp: 36, atk: 14, def: 5, exp: 340, gold: 60, spriteType: "orc", isPoisonous: true, color: "#ff8c00" },
  { name: "バンシー", level: 3, hp: 26, atk: 9, def: 3, exp: 300, gold: 45, spriteType: "spirit", isParalyzing: true, magicResist: 0.5, color: "#da70d6" },
  
  // 新しいモンスター
  { name: "スピリット", level: 2, hp: 15, atk: 5, def: 2, exp: 160, gold: 25, spriteType: "spirit", physResist: 0.7, color: "#00e5ff" },
  { name: "ウィル・オー・ウィスプ", level: 3, hp: 30, atk: 8, def: 2, exp: 300, gold: 40, spriteType: "wisp", magicResist: 0.8, color: "#ffffff" },
  { name: "ジャイアントスパイダー", level: 2, hp: 18, atk: 7, def: 3, exp: 150, gold: 25, spriteType: "spider", isPoisonous: true, color: "#bf5af2" },
  { name: "フラッシュバット", level: 2, hp: 12, atk: 5, def: 2, exp: 100, gold: 15, spriteType: "bat", isBlinding: true, color: "#e5ff00" },

  
  { name: "マスターメイジ", level: 4, hp: 32, atk: 10, def: 6, exp: 500, gold: 100, spriteType: "mage", spell: "LAHALITO", color: "#ff3b30" },
  { name: "ポイズンジャイアント", level: 4, hp: 65, atk: 19, def: 7, exp: 600, gold: 120, spriteType: "zombie", isPoisonous: true, color: "#bf5af2" },
  
  { name: "デーモンガード", level: 5, hp: 90, atk: 18, def: 8, exp: 2000, gold: 300, spriteType: "flack", spell: "LAHALITO", isBoss: true, isMidboss: true, color: "#ff8c00" },
  { name: "アースジャイアント", level: 6, hp: 75, atk: 22, def: 8, exp: 1200, gold: 150, spriteType: "zombie", color: "#8a2be2" },
  { name: "マスターデーモン", level: 7, hp: 60, atk: 15, def: 8, exp: 1500, gold: 200, spriteType: "flack", spell: "MADALTO", color: "#ff3b30" },
  
  { name: "フラック", level: 4, hp: 70, atk: 18, def: 8, exp: 1500, gold: 180, spriteType: "flack", spell: "LAHALITO", isRare: true, color: "#ff3b30" },
  { name: "いにしえの竜", level: 8, hp: 160, atk: 24, def: 14, exp: 6000, gold: 1000, spriteType: "dragon", spell: "TILTOWAIT", isBoss: true, color: "#ff3b30" }
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


