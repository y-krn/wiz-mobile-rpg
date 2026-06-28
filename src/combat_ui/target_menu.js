import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { updateUI } from "../ui.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatTargetMenu(type, callback, spellName = null) {
  state.gameState = "submenu";
  menuContext.type = "combat_target";
  menuContext.targetType = type;
  menuContext.spellName = spellName;
  combatCallbacks.activeTargetCallback = callback;
  updateUI();
}
