import { state, saveAutosave, addLog, addInventoryItem, markMapChanged } from "../state.js";
import { generateRandomAccessory, generateRandomEquipment } from "../data.js";
import { playSound } from "../audio.js";
import { dungeonRenderer as renderer } from "../renderer.js";
import { updateUI } from "../ui.js";
import { resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { setupChestState } from "../chest.js";
import { recordMilestoneVictory } from "../state/run_state.js";
import { checkCombatStatus } from "./combat_status.js";
import { triggerGameOver } from "./game_over.js";

function cleanupCombatState() {
  state.combatState = null;
  state.party.forEach(char => {
    delete char.buffs;
  });
}

export function playBattleLogs(queue, index) {
  if (index >= queue.length) {
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
        triggerGameOver();
      } else {
        state.gameState = "explore";
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
        triggerGameOver();
      } else {
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
        triggerGameOver();
      } else {
        if (state.combatState && state.combatState.isRoamingFlack) {
          state.x = state.prevX;
          state.y = state.prevY;
        }
        state.gameState = "explore";
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
    if (state.map[state.y]?.[state.x]?.event === "boss") {
      state.map[state.y][state.x].event = null;
      markMapChanged();
    }
    recordMilestoneVictory(state, log.milestoneVictory);
    addLog(`B${log.milestoneVictory}F開始を恒久アンロックした。`);

    setTimeout(() => {
      state.gameState = "explore";
      cleanupCombatState();
      resetSubmenuBackButton();
      state.transitioning = false;
      saveAutosave();
      updateUI();
    }, isAuto ? 300 : 3000);
    return;
  }

  if (log.giveKey) {
    state.transitioning = true;
    if (state.map[state.y]?.[state.x]?.event === "midboss") {
      state.map[state.y][state.x].event = null;
      markMapChanged();
    }
    if (!state.inventory.some(item => (typeof item === "object" ? item.baseId : item) === "DRAGON_KEY")) {
      addInventoryItem("DRAGON_KEY");
      if (state.currentRun) {
        state.currentRun.itemsFound.push("DRAGON_KEY");
      }
    }
    
    // 中ボス報酬: Rare装備（未鑑定） + 黒角x2
    const rewardEquip = generateRandomEquipment(4, "rare", Math.random, state.party);
    if (rewardEquip) {
      rewardEquip.identified = false;
      const added = addInventoryItem(rewardEquip);
      if (added && state.currentRun) {
        state.currentRun.equipmentFound.push(rewardEquip);
      }
    }
    if (Math.random() < 0.25) {
      const rewardAccessory = generateRandomAccessory(4, "rare", Math.random, state.party);
      if (rewardAccessory) {
        const added = addInventoryItem(rewardAccessory);
        if (added && state.currentRun) {
          state.currentRun.equipmentFound.push(rewardAccessory);
        }
      }
    }

    if (state.currentRun) {
      state.currentRun.materials ||= {};
      state.currentRun.materials["黒角"] = (state.currentRun.materials["黒角"] || 0) + 2;
    }
    
    addLog("迷宮の守護者を撃破した！お宝: [未鑑定のレア装備] と [黒角 x2] を手に入れた！");

    setTimeout(() => {
      state.gameState = "explore";
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
      cleanupCombatState();
      state.transitioning = false;
      setupChestState();
      saveAutosave();
    }, isAuto ? 150 : 1500);
    return;
  }

  if (log.endCombat) {
    state.transitioning = true;
    setTimeout(() => {
      state.gameState = "explore";
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
