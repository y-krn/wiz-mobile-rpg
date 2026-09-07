import { state } from "../state.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { bindCombatCallback, combatCallbacks } from "./combat_state.js";

export function openCombatTargetMenu(type, callback, spellName = null) {
  // balance-impact: none — combat target callback context boundary only
  menuContext.targetType = type;
  menuContext.spellName = typeof spellName === "string" ? spellName : "";
  const actorIdx = menuContext.actorIdx;
  combatCallbacks.activeTargetCallback = bindCombatCallback(callback, {
    type: "combat_target",
    actorIdx,
    actor: state.party?.[actorIdx],
    actorName: state.party?.[actorIdx]?.name,
    targetType: type,
    spellName: menuContext.spellName
  });
  const title = type === "enemy" ? "攻撃対象を選択" : "対象を選択";
  openSubmenu("combat_target", title);
}
