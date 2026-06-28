import { menuContext, openSubmenu } from "../navigation.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatTargetMenu(type, callback, spellName = null) {
  menuContext.targetType = type;
  menuContext.spellName = spellName;
  combatCallbacks.activeTargetCallback = callback;
  const title = type === "enemy" ? "攻撃対象を選択" : "対象を選択";
  openSubmenu("combat_target", title);
}
