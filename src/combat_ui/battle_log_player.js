import { state, saveAutosave, addLog } from "../state.js";
import { playSound } from "../audio.js";
import { dungeonRenderer as renderer } from "../renderer.js";
import { updateUI } from "../ui.js";
import { openGuardedSubmenu, resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { setupChestState } from "../chest.js";
import { checkCombatStatus } from "./combat_status.js";
import { triggerGameOver } from "./game_over.js";
import { applyPendingOutcomeRewards } from "./outcome_rewards.js";

function cleanupCombatState() {
  state.combatState = null;
  state.party.forEach(char => {
    delete char.buffs;
  });
}

function clearPendingOutcome() {
  if (state.combatState) {
    state.combatState.pendingOutcome = null;
  }
}

function savePendingOutcomeCheckpoint() {
  const livePhase = state.combatState?.phase;
  if (state.combatState) {
    state.combatState.phase = "choose_actions";
  }
  saveAutosave();
  if (state.combatState) {
    state.combatState.phase = livePhase;
  }
}

function applyOutcomeRewards() {
  const pendingOutcome = state.combatState?.pendingOutcome;
  if (!pendingOutcome) return;
  applyPendingOutcomeRewards(state, pendingOutcome).forEach(addLog);
  state.combatState.pendingOutcome = {
    ...pendingOutcome,
    rewardsApplied: true
  };
  savePendingOutcomeCheckpoint();
}

function openBossExitSubmenu() {
  const cell = state.map?.[state.y]?.[state.x];
  if (cell?.type !== "stairs-down" || cell.event) return;
  openGuardedSubmenu("stairs_down", `B${state.floor + 1}Fへの下り階段`);
}

export function playBattleLogs(queue, index) {
  if (index >= queue.length) {
    state.transitioning = false;
    checkCombatStatus();
    return;
  }

  const log = queue[index];
  const isAuto = state.combatState && state.combatState.isAuto;

  if (log.sound) playSound(log.sound);
  if (log.shake && renderer) renderer.triggerShake(log.shake, 250);
  if (log.flash && renderer) renderer.triggerFlash(200);
  if (log.floatText && renderer) renderer.addDamageText(log.floatText, log.floatColor);

  addLog(log.msg);
  updateUI();

  if (log.runEscape) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        clearPendingOutcome();
        triggerGameOver();
      } else {
        state.gameState = "explore";
        clearPendingOutcome();
        cleanupCombatState();
        resetSubmenuBackButton();
        state.transitioning = false;
        saveAutosave();
        updateUI();
      }
    }, isAuto ? 150 : 1200);
    return;
  }

  if (log.escapeToTown) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        clearPendingOutcome();
        triggerGameOver();
      } else {
        clearPendingOutcome();
        cleanupCombatState();
        resetSubmenuBackButton();
        state.transitioning = false;
        triggerRunResult("escape_scroll");
      }
    }, isAuto ? 150 : 1200);
    return;
  }

  if (log.fleeCombat) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        clearPendingOutcome();
        triggerGameOver();
      } else {
        if (state.combatState && state.combatState.isRoamingFlack) {
          state.x = state.prevX;
          state.y = state.prevY;
        }
        state.gameState = "explore";
        clearPendingOutcome();
        cleanupCombatState();
        resetSubmenuBackButton();
        state.transitioning = false;
        saveAutosave();
        updateUI();
      }
    }, isAuto ? 150 : 1200);
    return;
  }

  if (log.milestoneVictory) {
    state.transitioning = true;
    applyOutcomeRewards();

    setTimeout(() => {
      state.gameState = "explore";
      clearPendingOutcome();
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
      openBossExitSubmenu();
    }, isAuto ? 300 : 3000);
    return;
  }

  if (log.giveKey) {
    state.transitioning = true;
    applyOutcomeRewards();

    setTimeout(() => {
      state.gameState = "explore";
      clearPendingOutcome();
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 300 : 3000);
    return;
  }

  if (log.triggerChest) {
    state.transitioning = true;
    setTimeout(() => {
      state.gameState = "chest";
      clearPendingOutcome();
      cleanupCombatState();
      state.transitioning = false;
      setupChestState(null, null, null, null, { fromDrop: true });
      saveAutosave();
    }, isAuto ? 150 : 1500);
    return;
  }

  if (log.endCombat) {
    state.transitioning = true;
    setTimeout(() => {
      state.gameState = "explore";
      clearPendingOutcome();
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 150 : 1200);
    return;
  }

  const delay = isAuto ? 50 : (log.msg.startsWith("[!]") || log.msg.includes("[★]") ? 1200 : 700);
  setTimeout(() => {
    playBattleLogs(queue, index + 1);
  }, delay);
}
