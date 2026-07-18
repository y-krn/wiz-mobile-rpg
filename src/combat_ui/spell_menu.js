import { state } from "../state.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatSpellMenu(char, callback) {
  // Find actor index
  const actorIdx = state.party.findIndex(c => c.name === char.name);
  menuContext.actorIdx = actorIdx;
  combatCallbacks.activeSpellCallback = callback;
  openSubmenu("combat_spell", "呪文を唱える");
}

export function getSpellCombatSummary(spellName) {
  const summaries = {
    HALITO: { tag: "単体", effect: "火 8-18", category: "single" },
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
    MADI: { tag: "全体", effect: "回復 25-40", category: "all" },
    MABARRIER: { tag: "補助", effect: "味方全体 魔法軽減", category: "buff" },
    MONTINO: { tag: "全体", effect: "沈黙 2T", category: "all" },
    MORLIS: { tag: "弱体", effect: "全体魔防低下", category: "debuff" }
  };
  return summaries[spellName] || { tag: "不明", effect: "", category: "unknown" };
}

export function isSpellTargetAvailable(spell) {
  // 1. 移動用（utility）呪文は戦闘中効果なしのため使用不可（戦闘不可）
  if (spell.target === "utility") return false;

  // 2. 敵対象呪文：生存している敵がいるか
  if (spell.target === "single_enemy" || spell.target === "all_enemies") {
    const hasLivingEnemy = state.combatState && state.combatState.monsters.some(m => m.hp > 0);
    if (!hasLivingEnemy) return false;
  }

  // 3. 味方対象呪文：生存している味方がいるか
  if (spell.target === "single_ally" || spell.target === "all_allies") {
    const hasLivingAlly = state.party.some(c => ["ok", "poisoned", "blind"].includes(c.status));
    if (!hasLivingAlly) return false;
  }

  // 4. 特定の状態異常治療呪文の対象不在チェック
  if (spell.name === "DIURCO") {
    return state.party.some(c => c.status === "blind");
  }
  if (spell.name === "DIALKO") {
    return state.party.some(c => c.status === "sleep" || c.status === "paralyze" || c.status === "paralyzed");
  }
  if (spell.name === "LATUMOFIS") {
    return state.party.some(c => c.status === "poisoned");
  }

  return true;
}
