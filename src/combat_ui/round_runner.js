import { state } from "../state.js";
import { runCombatRoundCalculation } from "../combat_logic.js";
import { combatSelection } from "./combat_state.js";
import { playBattleLogs } from "./battle_log_player.js";

export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  const backBtn = document.getElementById("btn-submenu-back");
  if (backBtn) {
    backBtn.style.display = "none";
  }
  
  const { logQueue, state: nextState } = runCombatRoundCalculation(state, combatSelection);
  
  // Apply state mutations calculated in pure combat_logic
  state.party = nextState.party;
  state.combatState.monsters = nextState.combatState.monsters;
  state.inventory = nextState.inventory;
  state.firstKills = nextState.firstKills;
  state.codex = nextState.codex;
  state.currentRun = nextState.currentRun;
  state.roamingMonsters = nextState.roamingMonsters;
  state.floorChestsTotal = nextState.floorChestsTotal;
  state.gold = nextState.gold;
  
  playBattleLogs(logQueue, 0);
}
