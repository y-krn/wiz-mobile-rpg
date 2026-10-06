// `name` is the internal key (saves, telemetry, simulations). `label` is the
// name shown to the player (#2046).
export const SPELLS = {
  // Mage Spells
  HALITO: {
    name: "HALITO",
    label: "火矢",
    type: "mage",
    level: 1,
    cost: 1,
    target: "single_enemy",
    desc: "火の玉（12〜22ダメージ）"
  },
  KATINO: {
    name: "KATINO",
    label: "眠り霧",
    type: "mage",
    level: 3,
    cost: 2,
    target: "all_enemies",
    desc: "眠りの霧（敵全体を眠らせる）"
  },
  LAHALITO: {
    name: "LAHALITO",
    label: "炎嵐",
    type: "mage",
    level: 2,
    cost: 3,
    target: "all_enemies",
    desc: "炎の嵐（敵全体に15〜35ダメージ）"
  },
  DUMAPIC: {
    name: "DUMAPIC",
    label: "測量",
    type: "mage",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "その場の測量（座標と方角、迷宮の造りの気配を読む）"
  },
  MAHALITO: {
    name: "MAHALITO",
    label: "炎槍",
    type: "mage",
    level: 3,
    cost: 3,
    target: "single_enemy",
    desc: "炎の槍（30〜50ダメージ）"
  },
  MASFEAL: {
    name: "MASFEAL",
    label: "魔物よけ",
    type: "mage",
    level: 4,
    cost: 4,
    target: "utility",
    desc: "魔物よけ（30手番のあいだ、魔物との遭遇を避ける）"
  },
  MADALTO: {
    name: "MADALTO",
    label: "氷嵐",
    type: "mage",
    level: 6,
    cost: 4,
    target: "all_enemies",
    desc: "氷結呪文（30〜60ダメージ）"
  },
  TILTOWAIT: {
    name: "TILTOWAIT",
    label: "大爆裂",
    type: "mage",
    level: 8,
    cost: 6,
    target: "all_enemies",
    desc: "極大爆裂呪文（50〜100ダメージ）"
  },

  // Priest Spells
  DIOS: {
    name: "DIOS",
    label: "癒し",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    healMin: 10,
    healMax: 20,
    desc: "小さな治療（HPを10〜20回復）"
  },
  DIURCO: {
    name: "DIURCO",
    label: "開眼",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_ally",
    desc: "盲目を治す"
  },
  BADIOS: {
    name: "BADIOS",
    label: "聖撃",
    type: "priest",
    level: 1,
    cost: 1,
    target: "single_enemy",
    intrinsicTagBonus: { undead: 50, spirit: 30, demon: 30 },
    desc: "聖なる一撃（8〜18ダメージ）"
  },
  MILWA: {
    name: "MILWA",
    label: "灯り",
    type: "priest",
    level: 1,
    cost: 1,
    target: "utility",
    desc: "明かりの呪文（30手番、不意打ちと罠の調査を助ける）"
  },
  DIALKO: {
    name: "DIALKO",
    label: "解縛",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "眠りと麻痺を治す"
  },
  MADIOS: {
    name: "MADIOS",
    label: "大癒し",
    type: "priest",
    level: 2,
    cost: 3,
    target: "single_ally",
    healMin: 35,
    healMax: 70,
    desc: "治療（HPを35〜70回復）"
  },
  LATUMOFIS: {
    name: "LATUMOFIS",
    label: "解毒",
    type: "priest",
    level: 2,
    cost: 2,
    target: "single_ally",
    desc: "毒を治す"
  },
  LOMILWA: {
    name: "LOMILWA",
    label: "大灯り",
    type: "priest",
    level: 3,
    cost: 4,
    target: "utility",
    desc: "長く続く明かり（100手番、探索の助けが大きい）"
  },
  DIALMA: {
    name: "DIALMA",
    label: "極癒し",
    type: "priest",
    level: 8,
    cost: 4,
    target: "single_ally",
    healMin: 70,
    healMax: 120,
    desc: "大きな治療（HPを70〜120回復）"
  },
  MADI: {
    name: "MADI",
    label: "自癒",
    type: "priest",
    level: 5,
    cost: 3,
    target: "single_ally",
    healMin: 60,
    healMax: 90,
    desc: "自分の治療（HPを60〜90回復）"
  },
  MABARRIER: {
    name: "MABARRIER",
    label: "障壁",
    type: "priest",
    level: 4,
    cost: 3,
    target: "all_allies",
    combatOnly: true,
    desc: "魔力の障壁（3ターン、自分が受ける呪文とブレスの被害を30%減らす）"
  },
  MONTINO: {
    name: "MONTINO",
    label: "沈黙",
    type: "mage",
    level: 4,
    cost: 3,
    target: "all_enemies",
    desc: "沈黙（2ターン、敵全体の呪文を封じる）"
  },
  MORLIS: {
    name: "MORLIS",
    label: "魔破り",
    type: "mage",
    level: 5,
    cost: 3,
    target: "all_enemies",
    desc: "魔破り（3ターン、敵全体の魔法耐性を20%下げる）"
  },
  VULNERA: {
    name: "VULNERA",
    label: "脆化",
    type: "mage",
    level: 5,
    cost: 2,
    target: "single_enemy",
    desc: "脆化（3ターン、次の直接攻撃が強まる）"
  },
  WEAKEN: {
    name: "WEAKEN",
    label: "虚脱",
    type: "priest",
    level: 4,
    cost: 3,
    target: "all_enemies",
    desc: "虚脱（3ターン、敵全体の物理攻撃力を3下げる）"
  }
};

export function getSpellLabel(spellKey) {
  return SPELLS[spellKey]?.label || String(spellKey ?? "");
}
