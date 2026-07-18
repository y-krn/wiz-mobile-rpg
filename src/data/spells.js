export const SPELLS = {
  // Mage Spells
  HALITO: {
    name: "HALITO",
    type: "mage",
    level: 1,
    cost: 1,
    target: "single_enemy",
    desc: "火の玉 (8-18 DMG)"
  },
  KATINO: {
    name: "KATINO",
    type: "mage",
    level: 3,
    cost: 2,
    target: "all_enemies",
    desc: "睡眠の呪文 (敵全体を眠らせる)"
  },
  LAHALITO: {
    name: "LAHALITO",
    type: "mage",
    level: 2,
    cost: 3,
    target: "all_enemies",
    desc: "炎の嵐 (敵全体に15-35 DMG)"
  },
  DUMAPIC: {
    name: "DUMAPIC",
    type: "mage",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "座標探知 (位置・階段方向・周囲の気配を読む)"
  },
  MAHALITO: {
    name: "MAHALITO",
    type: "mage",
    level: 3,
    cost: 3,
    target: "single_enemy",
    desc: "中級炎魔法 (30-50 DMG)"
  },
  MASFEAL: {
    name: "MASFEAL",
    type: "mage",
    level: 4,
    cost: 4,
    target: "utility",
    desc: "魔除け (30歩の間、敵の遭遇を回避する)"
  },
  MADALTO: {
    name: "MADALTO",
    type: "mage",
    level: 6,
    cost: 4,
    target: "all_enemies",
    desc: "氷結呪文 (30-60 DMG)"
  },
  TILTOWAIT: {
    name: "TILTOWAIT",
    type: "mage",
    level: 8,
    cost: 6,
    target: "all_enemies",
    desc: "極大爆裂呪文 (50-100 DMG)"
  },

  // Priest Spells
  DIOS: {
    name: "DIOS",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    desc: "軽微な治療 (10-20 HP回復)"
  },
  DIURCO: {
    name: "DIURCO",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    desc: "盲目治療呪文 (盲目を治療する)"
  },
  BADIOS: {
    name: "BADIOS",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_enemy",
    desc: "不浄への一撃 (8-18 HPダメージ)"
  },
  MILWA: {
    name: "MILWA",
    type: "priest",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "明かりの呪文 (30歩: 不意打ち・罠調査を軽減)"
  },
  DIALKO: {
    name: "DIALKO",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "状態異常治療 (睡眠・麻痺の回復)"
  },
  MADIOS: {
    name: "MADIOS",
    type: "priest",
    level: 2,
    cost: 3,
    target: "single_ally",
    desc: "中度の治療 (35-70 HP回復)"
  },
  LATUMOFIS: {
    name: "LATUMOFIS",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "解毒呪文 (毒状態を治療する)"
  },
  LOMILWA: {
    name: "LOMILWA",
    type: "priest",
    level: 3,
    cost: 4,
    target: "utility",
    desc: "永続の明かり (100歩: 探索補助を大きく強化)"
  },
  DIALMA: {
    name: "DIALMA",
    type: "priest",
    level: 8,
    cost: 4,
    target: "single_ally",
    desc: "高度の治療 (70-120 HP回復)"
  },
  MADI: {
    name: "MADI",
    type: "priest",
    level: 5,
    cost: 5,
    target: "all_allies",
    desc: "味方全体の治療 (25-40 HP回復)"
  },
  MABARRIER: {
    name: "MABARRIER",
    type: "priest",
    level: 4,
    cost: 3,
    target: "all_allies",
    desc: "魔力障壁 (3ターン、味方全体の呪文・ブレス被ダメージを30%軽減)"
  },
  MONTINO: {
    name: "MONTINO",
    type: "mage",
    level: 4,
    cost: 3,
    target: "all_enemies",
    desc: "沈黙の呪文 (2ターン、敵全体の呪文行動を封じる)"
  },
  MORLIS: {
    name: "MORLIS",
    type: "mage",
    level: 5,
    cost: 3,
    target: "all_enemies",
    desc: "魔防低下の呪文 (3ターン、敵全体の魔法耐性を20%低下させる)"
  },
  WEAKEN: {
    name: "WEAKEN",
    type: "priest",
    level: 4,
    cost: 3,
    target: "all_enemies",
    desc: "虚脱の呪文 (3ターン、敵全体の物理攻撃力を3低下させる)"
  }
};
