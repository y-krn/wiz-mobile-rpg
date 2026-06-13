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
      return { log: `${caster.name}はデュマピックを唱えた！現在位置: X:${state.x}, Y:${state.y}, 方角: ${DIR_NAMES[state.dir]}` };
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
  DAGGER: { id: "DAGGER", name: "ダガー", type: "weapon", atk: 3, price: 50, desc: "シンプルな短剣。攻撃力+3" },
  SHORT_SWORD: { id: "SHORT_SWORD", name: "ショートソード", type: "weapon", atk: 6, price: 150, desc: "使いやすい鉄の小太刀。攻撃力+6" },
  LONG_SWORD: { id: "LONG_SWORD", name: "ロングソード", type: "weapon", atk: 12, price: 400, desc: "両刃の美しい鋼鉄長剣。攻撃力+12" },
  KATANA: { id: "KATANA", name: "名刀ムラマサ", type: "weapon", atk: 25, price: 1500, desc: "伝説の妖刀。攻撃力+25" },

  // Shields
  SMALL_SHIELD: { id: "SMALL_SHIELD", name: "スモールシールド", type: "shield", def: 2, price: 80, desc: "木製の丸い小盾。防御力+2" },
  LARGE_SHIELD: { id: "LARGE_SHIELD", name: "ラージシールド", type: "shield", def: 5, price: 250, desc: "鉄製の頑丈な大盾。防御力+5" },

  // Armor
  ROBE: { id: "ROBE", name: "魔法使いのローブ", type: "armor", def: 1, price: 30, desc: "魔力を帯びたシルクの衣。防御力+1" },
  LEATHER_ARMOR: { id: "LEATHER_ARMOR", name: "レザーアーマー", type: "armor", def: 4, price: 120, desc: "なめし革の胸当て。防御力+4" },
  CHAIN_MAIL: { id: "CHAIN_MAIL", name: "チェインメイル", type: "armor", def: 8, price: 350, desc: "細かな鉄環を編み込んだ鎧。防御力+8" },
  PLATE_MAIL: { id: "PLATE_MAIL", name: "プレートメイル", type: "armor", def: 16, price: 900, desc: "全身を包み込む鋼鉄の板金鎧。防御力+16" },

  // Potions / Quest items
  HEAL_POTION: { id: "HEAL_POTION", name: "傷薬 (ディオス薬)", type: "usable", price: 60, desc: "使用するとHPを15回復する。", effect: (char) => {
    char.hp = Math.min(char.maxHp, char.hp + 15);
    return `${char.name}は傷薬を使い、HPが15回復した。`;
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

// Maze structure creation helper
const createEmptyCell = () => ({
  walls: [true, true, true, true], // N, E, S, W starts closed
  type: "empty", 
  event: null,
  message: null
});

const dungeonMap = Array.from({ length: MAP_HEIGHT }, () => 
  Array.from({ length: MAP_WIDTH }, () => createEmptyCell())
);

// Reinitialize and build explicit connections to prevent out-of-bounds paths.
for (let y = 0; y < MAP_HEIGHT; y++) {
  for (let x = 0; x < MAP_WIDTH; x++) {
    dungeonMap[y][x] = {
      walls: [true, true, true, true],
      type: "empty",
      event: null,
      message: null
    };
  }
}

// Define the valid passages (connections between cells) for 16x16 grid
const passages = [
  // --- Y=14 (Bottom row) ---
  { from: [14, 1], to: [14, 2] }, { from: [14, 2], to: [14, 3] },
  { from: [14, 4], to: [14, 5] }, { from: [14, 5], to: [14, 6], door: true }, { from: [14, 6], to: [14, 7] },
  { from: [14, 7], to: [14, 8] },
  { from: [14, 10], to: [14, 11] }, { from: [14, 11], to: [14, 12] }, { from: [14, 12], to: [14, 13] }, { from: [14, 13], to: [14, 14] },

  // --- Y=13 ---
  { from: [14, 1], to: [13, 1] }, { from: [14, 8], to: [13, 8] }, { from: [14, 14], to: [13, 14] },
  { from: [13, 3], to: [13, 4] }, { from: [13, 4], to: [13, 5] },
  { from: [13, 10], to: [13, 11] },

  // --- Y=12 ---
  { from: [13, 1], to: [12, 1] }, { from: [13, 8], to: [12, 8] }, { from: [13, 14], to: [12, 14] },
  { from: [12, 1], to: [12, 2] }, { from: [12, 2], to: [12, 3], door: true },
  { from: [12, 5], to: [12, 6] }, { from: [12, 6], to: [12, 7] }, { from: [12, 7], to: [12, 8] },
  { from: [12, 10], to: [12, 11] }, { from: [12, 11], to: [12, 12], door: true }, { from: [12, 12], to: [12, 13] },

  // --- Y=11 ---
  { from: [12, 1], to: [11, 1] }, { from: [12, 5], to: [11, 5] }, { from: [12, 10], to: [11, 10] }, { from: [12, 14], to: [11, 14] },
  { from: [11, 1], to: [11, 2] }, { from: [11, 2], to: [11, 3] }, { from: [11, 3], to: [11, 4] }, { from: [11, 4], to: [11, 5] },
  { from: [11, 7], to: [11, 8] }, { from: [11, 8], to: [11, 9] }, { from: [11, 9], to: [11, 10] },
  { from: [11, 12], to: [11, 13] }, { from: [11, 13], to: [11, 14] },

  // --- Y=10 ---
  { from: [11, 1], to: [10, 1] }, { from: [11, 5], to: [10, 5] }, { from: [11, 10], to: [10, 10] },
  { from: [10, 2], to: [10, 3] }, { from: [10, 3], to: [10, 4] },
  { from: [10, 7], to: [10, 8] }, { from: [10, 8], to: [10, 9] },
  { from: [10, 12], to: [10, 13] }, { from: [10, 13], to: [10, 14], door: true },

  // --- Y=9 ---
  { from: [10, 1], to: [9, 1] }, { from: [10, 5], to: [9, 5] }, { from: [10, 10], to: [9, 10] }, { from: [10, 14], to: [9, 14] },
  { from: [9, 1], to: [9, 2] }, { from: [9, 5], to: [9, 6] }, { from: [9, 6], to: [9, 7], door: true },
  { from: [9, 10], to: [9, 11] }, { from: [9, 11], to: [9, 12] },

  // --- Y=8 ---
  { from: [9, 1], to: [8, 1] }, { from: [9, 5], to: [8, 5] }, { from: [9, 10], to: [8, 10] }, { from: [9, 14], to: [8, 14] },
  { from: [8, 1], to: [8, 2], door: true }, { from: [8, 2], to: [8, 3] }, { from: [8, 3], to: [8, 4] }, { from: [8, 4], to: [8, 5] },
  { from: [8, 5], to: [8, 6] }, { from: [8, 6], to: [8, 7] }, { from: [8, 7], to: [8, 8] }, { from: [8, 8], to: [8, 9] }, { from: [8, 9], to: [8, 10] },
  { from: [8, 10], to: [8, 11] }, { from: [8, 11], to: [8, 12] }, { from: [8, 12], to: [8, 13] }, { from: [8, 13], to: [8, 14] },

  // --- Y=7 ---
  { from: [8, 1], to: [7, 1] }, { from: [8, 8], to: [7, 8] }, { from: [8, 14], to: [7, 14] },
  { from: [7, 3], to: [7, 4] }, { from: [7, 4], to: [7, 5] },
  { from: [7, 10], to: [7, 11] }, { from: [7, 11], to: [7, 12] },

  // --- Y=6 ---
  { from: [7, 1], to: [6, 1] }, { from: [7, 8], to: [6, 8] }, { from: [7, 14], to: [6, 14] },
  { from: [6, 1], to: [6, 2] }, { from: [6, 2], to: [6, 3] },
  { from: [6, 5], to: [6, 6] }, { from: [6, 6], to: [6, 7] }, { from: [6, 7], to: [6, 8] },
  { from: [6, 10], to: [6, 11] }, { from: [6, 11], to: [6, 12] }, { from: [6, 12], to: [6, 13] },

  // --- Y=5 ---
  { from: [6, 1], to: [5, 1] }, { from: [6, 5], to: [5, 5] }, { from: [6, 10], to: [5, 10] }, { from: [6, 14], to: [5, 14] },
  { from: [5, 1], to: [5, 2] }, { from: [5, 2], to: [5, 3] }, { from: [5, 3], to: [5, 4], door: true }, { from: [5, 4], to: [5, 5] },
  { from: [5, 7], to: [5, 8] }, { from: [5, 8], to: [5, 9] }, { from: [5, 9], to: [5, 10] },
  { from: [5, 12], to: [5, 13] }, { from: [5, 13], to: [5, 14] },

  // --- Y=4 ---
  { from: [5, 1], to: [4, 1] }, { from: [5, 5], to: [4, 5] }, { from: [5, 10], to: [4, 10] },
  { from: [4, 2], to: [4, 3] }, { from: [4, 3], to: [4, 4] },
  { from: [4, 7], to: [4, 8] }, { from: [4, 8], to: [4, 9] },
  { from: [4, 12], to: [4, 13] }, { from: [4, 13], to: [4, 14], door: true },

  // --- Y=3 ---
  { from: [4, 1], to: [3, 1] }, { from: [4, 5], to: [3, 5] }, { from: [4, 10], to: [3, 10] }, { from: [4, 14], to: [3, 14] },
  { from: [3, 1], to: [3, 2] }, { from: [3, 5], to: [3, 6] }, { from: [3, 6], to: [3, 7], door: true },
  { from: [3, 10], to: [3, 11] }, { from: [3, 11], to: [3, 12] },

  // --- Y=2 ---
  { from: [3, 1], to: [2, 1] }, { from: [3, 5], to: [2, 5] }, { from: [3, 10], to: [2, 10] }, { from: [3, 14], to: [2, 14] },
  { from: [2, 1], to: [2, 2], door: true }, { from: [2, 2], to: [2, 3] }, { from: [2, 3], to: [2, 4] }, { from: [2, 4], to: [2, 5] },
  { from: [2, 5], to: [2, 6] }, { from: [2, 6], to: [2, 7] }, { from: [2, 7], to: [2, 8] }, { from: [2, 8], to: [2, 9] }, { from: [2, 9], to: [2, 10] },
  { from: [2, 10], to: [2, 11] }, { from: [2, 11], to: [2, 12] }, { from: [2, 12], to: [2, 13] }, { from: [2, 13], to: [2, 14] },

  // --- Y=1 ---
  { from: [2, 1], to: [1, 1] }, { from: [2, 8], to: [1, 8] }, { from: [2, 14], to: [1, 14] },
  { from: [1, 1], to: [1, 2] }, { from: [1, 2], to: [1, 3] },
  { from: [1, 5], to: [1, 6] }, { from: [1, 6], to: [1, 7] },
  { from: [1, 10], to: [1, 11] }, { from: [1, 11], to: [1, 12] }, { from: [1, 12], to: [1, 13] }
];

// Apply passages
passages.forEach(p => {
  const [y1, x1] = p.from;
  const [y2, x2] = p.to;
  
  let dir = -1;
  if (y2 === y1 - 1 && x2 === x1) dir = DIR_N;
  else if (y2 === y1 && x2 === x1 + 1) dir = DIR_E;
  else if (y2 === y1 + 1 && x2 === x1) dir = DIR_S;
  else if (y2 === y1 && x2 === x1 - 1) dir = DIR_W;

  if (dir !== -1) {
    dungeonMap[y1][x1].walls[dir] = false;
    // Opposite wall is also open
    const oppDir = (dir + 2) % 4;
    dungeonMap[y2][x2].walls[oppDir] = false;

    if (p.door) {
      dungeonMap[y1][x1].type = "door";
      dungeonMap[y2][x2].type = "door";
    }
  }
});

// Set Stairs Up (Starting/Exit point)
dungeonMap[START_Y][START_X].type = "stairs-up";
dungeonMap[START_Y][START_X].message = "街へと戻る階段です。一歩進むとリルガミンの街に戻ります。";

// Set Boss room (X: 14, Y: 1)
dungeonMap[1][14].type = "empty";
dungeonMap[1][14].event = "boss";
dungeonMap[1][14].message = "周囲にただならぬ気配が漂っている…！いにしえの竜が姿を現した！";
// Connect boss room
dungeonMap[1][12].walls[DIR_E] = false;
dungeonMap[1][13].walls[DIR_W] = false;
dungeonMap[1][13].walls[DIR_E] = false;
dungeonMap[1][14].walls[DIR_W] = false;
dungeonMap[1][13].type = "door";
dungeonMap[1][14].type = "empty";

// Set Chest Events
dungeonMap[1][2].event = "chest"; // Left top corner
dungeonMap[14][8].event = "chest"; // Bottom middle
dungeonMap[14][14].event = "chest"; // Bottom right corner
dungeonMap[1][6].event = "chest"; // Top middle
dungeonMap[8][11].event = "chest"; // Center right
dungeonMap[8][2].event = "chest"; // Center left

export const MAP = dungeonMap;

