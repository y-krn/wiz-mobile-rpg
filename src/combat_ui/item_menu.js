import { state } from "../state.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { bindCombatCallback, combatCallbacks } from "./combat_state.js";

export function openCombatItemMenu(callback) {
  // balance-impact: none — combat item callback context boundary only
  menuContext.targetType = "";
  menuContext.spellName = "";
  const actorIdx = menuContext.actorIdx;
  combatCallbacks.activeItemCallback = bindCombatCallback(callback, {
    type: "combat_item",
    actorIdx,
    actor: state.party?.[actorIdx],
    actorName: state.party?.[actorIdx]?.name,
    targetType: "",
    spellName: ""
  });
  openSubmenu("combat_item", "道具を使う");
}
