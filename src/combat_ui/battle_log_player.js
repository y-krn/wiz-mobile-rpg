import { state, saveAutosave, addLog, addInventoryItem } from "../state.js";
import { generateRandomEquipment } from "../data.js";
import { playSound } from "../audio.js";
import { dungeonRenderer as renderer } from "../renderer.js";
import { updateUI } from "../ui.js";
import { resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { setupChestState } from "../chest.js";
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
        if (state.combatState && state.combatState.isRoamingFlack) {
          // Push player back to prevX, prevY
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

  if (log.escapeToTown) {
    state.transitioning = true;
    setTimeout(() => {
      const allPartyDead = state.party.every(c => c.status === "dead");
      if (allPartyDead) {
        state.transitioning = false;
        triggerGameOver();
      } else {
        state.lastReturnedFloor = Math.min(4, state.sessionMaxFloor);
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

  if (log.giveCrystal) {
    state.transitioning = true;
    if (state.map[state.y]?.[state.x]?.event === "boss") {
      state.map[state.y][state.x].event = null;
    }
    addInventoryItem("ANTIGRAVITY_CRYSTAL");
    if (state.currentRun) {
      state.currentRun.itemsFound.push("ANTIGRAVITY_CRYSTAL");
    }
    
    // ボス報酬: Epic装備（未鑑定） + 竜鱗x3
    const rewardEquip = generateRandomEquipment(5, "epic", Math.random, state.party);
    if (rewardEquip) {
      rewardEquip.identified = false;
      const added = addInventoryItem(rewardEquip);
      if (added && state.currentRun) {
        state.currentRun.equipmentFound.push(rewardEquip);
      }
    }
    
    if (!state.materials) state.materials = {};
    state.materials["竜鱗"] = (state.materials["竜鱗"] || 0) + 3;
    if (state.currentRun) {
      if (!state.currentRun.materialsFound) state.currentRun.materialsFound = {};
      state.currentRun.materialsFound["竜鱗"] = (state.currentRun.materialsFound["竜鱗"] || 0) + 3;
    }
    
    addLog("巨大な魔物を撃破した！お宝: [未鑑定のエピック装備] と [竜鱗 x3] を手に入れた！");

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

    if (!state.materials) state.materials = {};
    state.materials["黒角"] = (state.materials["黒角"] || 0) + 2;
    if (state.currentRun) {
      if (!state.currentRun.materialsFound) state.currentRun.materialsFound = {};
      state.currentRun.materialsFound["黒角"] = (state.currentRun.materialsFound["黒角"] || 0) + 2;
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
