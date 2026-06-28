import { state } from "../state.js";
import { ITEMS } from "../data.js";
import { menuContext } from "../navigation.js";
import { updateUI } from "../ui.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatItemMenu(callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_item";
  combatCallbacks.activeItemCallback = callback;
  updateUI();
}
