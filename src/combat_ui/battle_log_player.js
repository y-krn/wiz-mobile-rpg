import { state, saveAutosave, addEventLog, addLog, clearEventObservations } from "../state.js";
import { playSound } from "../audio.js";
import { dungeonRenderer as renderer } from "../renderer_runtime.js";
import { updateUI } from "../ui.js";
import { openGuardedSubmenu, resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";

// balance-impact: none — combat result presentation only; resolution remains in combat_logic.
import { setupPostCombatChest } from "../chest.js";
import { checkCombatStatus } from "./combat_status.js";
import { triggerGameOver } from "./game_over.js";
import { applyPendingOutcomeRewards } from "./outcome_rewards.js";
import {
  COMBAT_LOG_SIDES,
  getCombatLogDelay,
  getCombatLogSide,
  groupCombatLogEntries,
  isImportantCombatResult
} from "./combat_log_presentation.js";
import { showSoloHudHit } from "../ui/solo_hud.js";
import { showVictoryToast } from "../ui/victory_toast.js";
import { recordRoundEnemyAction, resetRoundEnemyActions } from "./round_enemy_actions.js";
import { formatFloorCode, isDungeonBottomFloor } from "../rules/dungeons.js";
import { noteFightNoise } from "../systems/dungeon_noise.js";

// The mine's rule (#2063): a fight that ran long is heard down the tunnels.
function noteLongFight() {
  if (noteFightNoise(state)) addLog("長引いた戦いの音が坑道に響いた…");
}

function cleanupCombatState() {
  clearEventObservations({ scopePrefix: "combat:" });
  state.combatState = null;
  resetRoundEnemyActions();
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
  // The menu retitles itself; a dungeon's fifth floor has nothing below (#2060).
  openGuardedSubmenu("stairs_down", isDungeonBottomFloor(state.floor)
    ? "封じられた下り階段"
    : `${formatFloorCode(state.floor + 1)}への下り階段`);
}

export function playBattleLogs(queue, index) {
  if (index === 0) {
    queue = groupCombatLogEntries(queue);
    resetRoundEnemyActions(state.combatState);
  }
  if (index >= queue.length) {
    state.transitioning = false;
    checkCombatStatus();
    return;
  }

  const log = queue[index];
  const isAuto = state.combatState && state.combatState.isAuto;

  const effects = log.effects || [log];
  effects.forEach(effect => {
    if (effect.sound) playSound(effect.sound);
    // Ordinary hits use actor-local rings, flashes, and floating damage text.
    // Reserve viewport shake for explicitly heavy impacts only.
    if (effect.shake >= 15 && renderer) renderer.triggerShake(Math.min(effect.shake, 20), 180);
    if (effect.flash && renderer) renderer.triggerFlash(200);
    if (!effect.floatText) return;
    // A plain number from the enemy side is damage to the party: show it on
    // the HUD and the view edge instead of over the enemies.
    const side = effect.side || getCombatLogSide(effect.msg);
    if (side === COMBAT_LOG_SIDES.ENEMY && /^\d+$/.test(effect.floatText)) {
      showSoloHudHit(effect.floatText);
      renderer?.triggerPartyHit?.();
      return;
    }
    if (renderer) renderer.addDamageText(effect.floatText, effect.floatColor, { target: effect.floatTarget });
    if (renderer?.triggerHitFeedback) renderer.triggerHitFeedback(220, effect.floatTarget);
  });
  if (log.side === COMBAT_LOG_SIDES.ENEMY) recordRoundEnemyAction(log.msg, state.combatState);
  if (log.victorySummary) showVictoryToast(log.victorySummary);

  if (isImportantCombatResult(log.msg)) {
    addEventLog(log.msg, {
      key: `combat-result:${state.combatState?.roundNumber ?? "unknown"}:${index}`,
      scope: `combat:${state.combatState?.roundNumber ?? "unknown"}`,
      kind: "result",
      side: log.side,
      presentationKind: log.presentationKind
    });
  } else {
    addLog(log.msg, { side: log.side, presentationKind: log.presentationKind });
  }
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
    }, getCombatLogDelay(log, { isAuto }));
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
    }, getCombatLogDelay(log, { isAuto }));
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
        noteLongFight();
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
    }, getCombatLogDelay(log, { isAuto }));
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
    }, getCombatLogDelay(log, { isAuto }));
    return;
  }

  if (log.giveKey) {
    state.transitioning = true;
    applyOutcomeRewards();

    setTimeout(() => {
      noteLongFight();
      state.gameState = "explore";
      clearPendingOutcome();
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, getCombatLogDelay(log, { isAuto }));
    return;
  }

  if (log.triggerChest) {
    state.transitioning = true;
    const mimicChest = state.combatState?.mimicChest ?? null;
    setTimeout(() => {
      noteLongFight();
      state.gameState = "chest";
      clearPendingOutcome();
      cleanupCombatState();
      state.transitioning = false;
      setupPostCombatChest(mimicChest);
      saveAutosave();
    }, getCombatLogDelay(log, { isAuto }));
    return;
  }

  if (log.endCombat) {
    state.transitioning = true;
    setTimeout(() => {
      noteLongFight();
      state.gameState = "explore";
      clearPendingOutcome();
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, getCombatLogDelay(log, { isAuto }));
    return;
  }

  const delay = getCombatLogDelay(log, { isAuto });
  setTimeout(() => {
    playBattleLogs(queue, index + 1);
  }, delay);
}
