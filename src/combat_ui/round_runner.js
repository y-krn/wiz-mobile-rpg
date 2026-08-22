import { state, saveAutosave } from "../state.js";
import { runCombatRoundCalculation } from "../combat_logic.js";
import { combatSelection } from "./combat_state.js";
import { playBattleLogs } from "./battle_log_player.js";
import { trackCombatEnd } from "../telemetry.js";

function resolvePendingOutcome(logQueue) {
  for (const log of logQueue) {
    if (log.runEscape) return { kind: "runEscape" };
    if (log.escapeToTown) return { kind: "escapeToTown" };
    if (log.fleeCombat) return { kind: "fleeCombat" };
    if (log.milestoneVictory) {
      return {
        kind: "milestoneVictory",
        floor: log.milestoneVictory,
        rewardsApplied: false
      };
    }
    if (log.giveKey) return { kind: "giveKey", rewardsApplied: false };
    if (log.triggerChest) return { kind: "triggerChest" };
    if (log.endCombat) return { kind: "endCombat" };
  }
  return null;
}

export function resolveCombatRound() {
  state.gameState = "combat";
  state.combatState.phase = "resolving";
  const backBtn = document.getElementById("btn-submenu-back");
  if (backBtn) {
    backBtn.style.display = "none";
  }
  
  const { logQueue, state: nextState } = runCombatRoundCalculation(state, combatSelection);
  
  // Apply state mutations calculated in pure combat_logic
  state.party = nextState.party.slice(0, 1);
  state.combatState = nextState.combatState;
  state.inventory = nextState.inventory;
  state.firstKills = nextState.firstKills;
  state.codex = nextState.codex;
  state.currentRun = nextState.currentRun;
  state.metaMaterials = nextState.metaMaterials;
  state.roamingMonsters = nextState.roamingMonsters;
  state.floorChestsTotal = nextState.floorChestsTotal;
  state.mapRevision = nextState.mapRevision;
  state.x = nextState.x;
  state.y = nextState.y;

  state.combatState.phase = "choose_actions";
  state.combatState.pendingOutcome = resolvePendingOutcome(logQueue);
  if (state.combatState.pendingOutcome) {
    const pendingKind = state.combatState.pendingOutcome.kind;
    const combatResult = pendingKind === "runEscape" && state.party.every(char => char.status === "dead")
      ? "gameover"
      : pendingKind;
    trackCombatEnd(combatResult, {
      floor: state.floor,
      turns: state.combatState.roundNumber,
      player: state.party[0],
      monsters: state.combatState.monsters
    });
  }
  saveAutosave();

  state.combatState.phase = "resolving";
  state.transitioning = true;
  playBattleLogs(logQueue, 0);
}
