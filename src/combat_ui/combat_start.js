import { state, addLog, saveAutosave, createMonsterCodexRecord } from "../state.js";
import { menuContext, menuHistory } from "../navigation.js";
import { combatSelection } from "./combat_state.js";
import { generateEncounter } from "./encounter.js";
import { advanceActionSelection } from "./action_selection.js";
import { triggerGameOver } from "./game_over.js";
import { getCharCoreParams, getCoreLogText, getEquippedCurseCount } from "../data.js";
import { updateUI } from "../ui.js";
import { resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { setupChestState } from "../chest.js";
import { applyPendingOutcomeRewards } from "./outcome_rewards.js";
import { trackCombatStart } from "../telemetry.js";

function getRetreatPosition() {
  const { x, y, prevX, prevY, map } = state;
  if (![x, y, prevX, prevY].every(Number.isInteger)) return null;
  if (Math.abs(x - prevX) + Math.abs(y - prevY) !== 1) return null;
  if (!map?.[y]?.[x] || !map?.[prevY]?.[prevX]) return null;

  const retreatDir = prevY < y ? 0 : prevX > x ? 1 : prevY > y ? 2 : 3;
  if (map[y][x].walls?.[retreatDir]) return null;
  return { x: prevX, y: prevY };
}

export function startCombat(isBoss, isMidboss = false, isRoamingFlack = false, roamingMonster = null) {
  state.gameState = "combat";
  if (state.currentRun) {
    state.currentRun.battles++;
  }

  state.party.forEach(char => {
    char.buffs = [];
  });

  const { monsters, isRare } = generateEncounter(state, isBoss, isMidboss, isRoamingFlack, roamingMonster);

  if (state.alarmActive) {
    const mult = state.alarmWeakened ? 1.10 : 1.20;
    monsters.forEach(m => {
      m.hp = Math.round(m.hp * mult);
      m.maxHp = Math.round(m.maxHp * mult);
      if (m.str) m.str = Math.round(m.str * mult);
      if (m.int) m.int = Math.round(m.int * mult);
    });
    addLog(`【⚠️警告】警報により魔物が活性化している！(HP/攻撃力+${Math.round((mult - 1) * 100)}%)`);
    state.alarmActive = false;
    state.alarmWeakened = false;
  }



  if (isBoss || isMidboss || isRoamingFlack) {
    addLog("【⚠️強敵遭遇！】周囲の空気が張り詰める...！");
  } else if (isRare) {
    addLog("【✨希少遭遇！】珍しい魔物が現れた！");
  }

  state.combatState = {
    monsters,
    phase: "choose_actions",
    isBoss,
    isMidboss,
    isRoamingFlack,
    roamingMonsterId: roamingMonster?.id ?? null,
    isAuto: false,
    allParalyzedTurns: 0,
    roundNumber: 1,
    retreatPosition: getRetreatPosition(),
    loggedCoreActivations: [],
    pendingOutcome: null
  };
  trackCombatStart({
    floor: state.floor,
    player: state.party[0],
    monsters,
    isBoss,
    isMidboss,
    isRoamingFlack
  });
  state.chestState = null;

  combatSelection.charIdx = 0;
  combatSelection.actions = [];
  menuContext.prevGameState = null;
  menuContext.type = "";
  menuHistory.length = 0;

  addLog(`戦闘開始！敵が現れた：${monsters.map(m => m.name).join(", ")}`);
  state.party.forEach(char => {
    if (getCharCoreParams(char, "CORE_CURSE_KEEPER") && getEquippedCurseCount(char) > 0) {
      addLog(getCoreLogText("CORE_CURSE_KEEPER"));
    }
    if (char.runTrapAttackBonus > 0 && getCharCoreParams(char, "CORE_TRAP_EATER")) {
      addLog(getCoreLogText("CORE_TRAP_EATER"));
    }
  });
  
  if (state.codex) {
    if (!state.codex.monsters) state.codex.monsters = {};
    monsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = createMonsterCodexRecord();
      }
      state.codex.monsters[baseName].encountered++;
    });
  }
  
  advanceActionSelection();
}

export function resumeCombat() {
  if (!state.combatState) return;

  state.combatState.phase = "choose_actions";
  combatSelection.charIdx = 0;
  combatSelection.actions = [];

  const pendingOutcome = state.combatState.pendingOutcome ?? null;
  if (pendingOutcome) {
    if (pendingOutcome.rewardsApplied === false) {
      applyPendingOutcomeRewards(state, pendingOutcome).forEach(addLog);
      state.combatState.pendingOutcome = {
        ...pendingOutcome,
        rewardsApplied: true
      };
      saveAutosave();
    }

    if (
      ["runEscape", "escapeToTown", "fleeCombat"].includes(pendingOutcome.kind)
      && state.party.every(char => char.status === "dead")
    ) {
      state.combatState.pendingOutcome = null;
      triggerGameOver();
      return;
    }

    if (pendingOutcome.kind === "fleeCombat" && state.combatState.isRoamingFlack) {
      state.x = state.prevX;
      state.y = state.prevY;
    }

    if (pendingOutcome.kind === "escapeToTown") {
      state.combatState.pendingOutcome = null;
      state.combatState = null;
      state.party.forEach(char => {
        delete char.buffs;
      });
      resetSubmenuBackButton();
      triggerRunResult("escape_scroll");
      return;
    }

    if (pendingOutcome.kind === "triggerChest") {
      state.gameState = "chest";
      state.combatState.pendingOutcome = null;
      state.combatState = null;
      state.party.forEach(char => {
        delete char.buffs;
      });
      setupChestState(null, null, null, null, { fromDrop: true });
      saveAutosave();
      updateUI();
      return;
    }

    state.gameState = "explore";
    state.combatState.pendingOutcome = null;
    state.combatState = null;
    state.party.forEach(char => {
      delete char.buffs;
    });
    resetSubmenuBackButton();
    saveAutosave();
    updateUI();
    return;
  }

  if (state.party.every(char => char.status === "dead")) {
    triggerGameOver();
    return;
  }

  if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
    state.gameState = "explore";
    state.combatState = null;
    saveAutosave();
    updateUI();
    return;
  }

  advanceActionSelection();
}
