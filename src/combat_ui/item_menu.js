import { openSubmenu } from "../navigation.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatItemMenu(callback) {
  combatCallbacks.activeItemCallback = callback;
  openSubmenu("combat_item", "道具を使う");
}
