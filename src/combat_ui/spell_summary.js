const SPELL_COMBAT_SUMMARIES = Object.freeze({
  HALITO: { tag: "単体", effect: "火 12-22", category: "single" },
  KATINO: { tag: "弱体", effect: "全体睡眠", category: "debuff" },
  LAHALITO: { tag: "全体", effect: "火 15-35", category: "all" },
  DUMAPIC: { tag: "探索", effect: "座標探知", category: "utility" },
  MAHALITO: { tag: "単体", effect: "火 30-50", category: "single" },
  MASFEAL: { tag: "探索", effect: "遭遇回避", category: "utility" },
  MADALTO: { tag: "全体", effect: "氷 30-60", category: "all" },
  TILTOWAIT: { tag: "全体", effect: "爆 50-100", category: "all" },
  DIOS: { tag: "単体", effect: "回復 10-20", category: "single" },
  DIURCO: { tag: "治療", effect: "単体 盲目", category: "cure" },
  BADIOS: { tag: "単体", effect: "聖 8-18", category: "single" },
  MILWA: { tag: "探索", effect: "明かり", category: "utility" },
  DIALKO: { tag: "治療", effect: "麻痺/睡眠", category: "cure" },
  MADIOS: { tag: "単体", effect: "回復 35-70", category: "single" },
  LATUMOFIS: { tag: "治療", effect: "毒", category: "cure" },
  LOMILWA: { tag: "探索", effect: "永続明かり", category: "utility" },
  DIALMA: { tag: "単体", effect: "回復 70-120", category: "single" },
  MADI: { tag: "単体", effect: "回復 60-90", category: "single" },
  MABARRIER: { tag: "補助", effect: "自分 魔法軽減", category: "buff" },
  MONTINO: { tag: "全体", effect: "沈黙 2T", category: "all" },
  MORLIS: { tag: "弱体", effect: "全体魔防低下", category: "debuff" },
  WEAKEN: { tag: "弱体", effect: "全体攻撃力 -3 3T", category: "debuff" }
});

export function getSpellCombatSummary(spellName) {
  return SPELL_COMBAT_SUMMARIES[spellName] || { tag: "不明", effect: "", category: "unknown" };
}
