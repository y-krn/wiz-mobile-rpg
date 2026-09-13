import { state } from "../state/state_core.js";
import { getCharMaxHp, getCharMaxMp, getItemData } from "../data.js";
import { canUseManaItems } from "./magic_rules.js";

export function getItemUseStatus(char, itemKey) {
  const item = getItemData(itemKey);
  if (!item || item.type !== "usable") return { usable: true, reason: "" };
  const canRestoreMp = canUseManaItems(char);

  if (item.combatOnly && !state.combatState) {
    return { usable: false, reason: "戦闘中のみ使用できます" };
  }

  if (itemKey === "ESCAPE_SCROLL" && state.combatState && (state.combatState.isBoss || state.combatState.isMidboss)) {
    return { usable: false, reason: "ボス戦では使用できません" };
  }

  if (char.status === "dead") {
    return { usable: false, reason: "死亡中はアイテムを使用できません" };
  }
  if ((itemKey === "HEAL_POTION" || itemKey === "GREATER_HEAL") && char.hp >= getCharMaxHp(char)) {
    return { usable: false, reason: "HPはすでに満タンです" };
  }
  if (itemKey === "ANTIDOTE" && char.status !== "poisoned") {
    return { usable: false, reason: "毒状態ではありません" };
  }
  if (itemKey === "EYE_DROPS" && char.status !== "blind") {
    return { usable: false, reason: "盲目状態ではありません" };
  }
  if (itemKey === "PARALYZE_CURE" && char.status !== "paralyzed" && char.status !== "paralyze") {
    return { usable: false, reason: "麻痺状態ではありません" };
  }
  if (itemKey === "WAKE_POWDER" && char.status !== "sleep") {
    return { usable: false, reason: "睡眠状態ではありません" };
  }
  if (itemKey === "PANACEA" && !["poisoned", "blind", "paralyzed", "paralyze", "sleep"].includes(char.status)) {
    return { usable: false, reason: "治療できる状態異常ではありません" };
  }
  if ((itemKey === "MANA_POTION" || itemKey === "ETHER") && (!canRestoreMp || char.mp >= getCharMaxMp(char))) {
    return { usable: false, reason: canRestoreMp ? "MPはすでに満タンです" : "現在のBuildではMPを使えません" };
  }
  return { usable: true, reason: "" };
}
