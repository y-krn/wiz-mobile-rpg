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
      const dmg = Math.floor(Math.random() * 11) + 5;
      return { damage: dmg, log: `${caster.name}はハリトを唱えた！${target.name}に${dmg}の炎ダメージ！` };
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
        const dmg = Math.floor(Math.random() * 21) + 15;
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => `${r.name}に${r.dmg}のダメージ`).join(", ");
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
  TILTOWAIT: {
    name: "TILTOWAIT",
    type: "mage",
    level: 3,
    cost: 5,
    target: "all_enemies",
    desc: "極大爆裂呪文 (50-100 DMG)",
    effect: (caster, targets) => {
      const results = targets.map(t => {
        if (t.hp <= 0) return 0;
        const dmg = Math.floor(Math.random() * 51) + 50;
        t.hp = Math.max(0, t.hp - dmg);
        return { name: t.name, dmg };
      }).filter(r => r !== 0);
      
      const logDetails = results.map(r => `${r.name}に${r.dmg}のダメージ`).join(", ");
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
      if (target.status === "dead") target.status = "ok";
      return { heal, log: `${caster.name}はディオスを唱えた！${target.name}のHPを${heal}回復した。` };
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
      if (target.status === "sleep" || target.status === "paralyze") {
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
  }
};

// Item Database
export const ITEMS = {
  // Weapons
  DAGGER: { id: "DAGGER", name: "ダガー", type: "weapon", atk: 3, price: 50, desc: "シンプルな短剣。攻撃力+3 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage"] },
  SHORT_SWORD: { id: "SHORT_SWORD", name: "ショートソード", type: "weapon", atk: 6, price: 150, desc: "使いやすい鉄の小太刀。攻撃力+6 [戦・盗用]", classes: ["Fighter", "Thief"] },
  LONG_SWORD: { id: "LONG_SWORD", name: "ロングソード", type: "weapon", atk: 12, price: 400, desc: "両刃の美しい鋼鉄長剣。攻撃力+12 [戦士用]", classes: ["Fighter"] },
  KATANA: { id: "KATANA", name: "名刀ムラマサ", type: "weapon", atk: 25, price: 1500, desc: "伝説の妖刀。攻撃力+25 [戦士用]", classes: ["Fighter"] },

  // Shields
  SMALL_SHIELD: { id: "SMALL_SHIELD", name: "スモールシールド", type: "shield", def: 2, price: 80, desc: "木製の丸い小盾。防御力+2 [戦・盗・僧用]", classes: ["Fighter", "Thief", "Priest"] },
  LARGE_SHIELD: { id: "LARGE_SHIELD", name: "ラージシールド", type: "shield", def: 5, price: 250, desc: "鉄製の頑丈な大盾。防御力+5 [戦士用]", classes: ["Fighter"] },

  // Armor
  ROBE: { id: "ROBE", name: "魔法使いのローブ", type: "armor", def: 1, price: 30, desc: "魔力を帯びたシルクの衣。防御力+1 [全員用]", classes: ["Fighter", "Thief", "Priest", "Mage"] },
  LEATHER_ARMOR: { id: "LEATHER_ARMOR", name: "レザーアーマー", type: "armor", def: 4, price: 120, desc: "なめし革の胸当て。防御力+4 [戦・盗・僧用]", classes: ["Fighter", "Thief", "Priest"] },
  CHAIN_MAIL: { id: "CHAIN_MAIL", name: "チェインメイル", type: "armor", def: 8, price: 350, desc: "細かな鉄環を編み込んだ鎧。防御力+8 [戦・僧用]", classes: ["Fighter", "Priest"] },
  PLATE_MAIL: { id: "PLATE_MAIL", name: "PLATE_MAIL", type: "armor", def: 16, price: 900, desc: "全身を包み込む鋼鉄の板金鎧。防御力+16 [戦士用]", classes: ["Fighter"] },

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
  TOWN_PORTAL: { id: "TOWN_PORTAL", name: "帰還のスクロール", type: "usable", price: 100, desc: "使用すると一瞬で街に戻る。[全員用]", classes: ["Fighter", "Thief", "Priest", "Mage"], effect: (char) => {
    return `${char.name}は帰還のスクロールを読んだ！`;
  }},
  ANTIGRAVITY_CRYSTAL: { id: "ANTIGRAVITY_CRYSTAL", name: "浮遊石 (クリスタル)", type: "quest", price: 0, desc: "青く浮かび上がる伝説の結晶。城に持ち帰ると勝利。" }
};

// Monsters Database
export const MONSTERS = [
  { name: "かみつき蟲", level: 1, hp: 6, atk: 4, def: 1, exp: 40, gold: 15, color: "#00ff66" },
  { name: "コボルトの斥候", level: 1, hp: 8, atk: 5, def: 2, exp: 60, gold: 30, color: "#00ff66" },
  { name: "ゾンビ", level: 2, hp: 16, atk: 7, def: 3, exp: 120, gold: 60, color: "#8a2be2" },
  { name: "ガイコツ戦士", level: 2, hp: 20, atk: 9, def: 4, exp: 180, gold: 100, color: "#dcdcdc" },
  { name: "オークの戦士", level: 3, hp: 28, atk: 12, def: 6, exp: 280, gold: 150, color: "#ff8c00" },
  { name: "はぐれ魔術師", level: 3, hp: 22, atk: 8, def: 4, exp: 360, gold: 240, spell: "HALITO", color: "#da70d6" },
  { name: "いにしえの竜", level: 5, hp: 120, atk: 22, def: 12, exp: 4000, gold: 1500, spell: "LAHALITO", isBoss: true, color: "#ff3b30" }
];

// Dungeon Map Grid 16x16
// Coordinate axes: X goes right (0..15), Y goes down (0..15)
// 'walls' represents whether a wall exists in [North, East, South, West] directions.
// 'type': 'empty', 'door', 'stairs-up', 'stairs-down'
// 'event': null or type of event.
export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

export const START_X = 1;
export const START_Y = 14;



