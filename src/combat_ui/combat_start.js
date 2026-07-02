import { state, saveAutosave, addLog } from "../state.js";
import { menuContext, menuHistory } from "../navigation.js";
import { combatSelection } from "./combat_state.js";
import { generateEncounter } from "./encounter.js";
import { advanceActionSelection } from "./action_selection.js";
import { getOmenForFloor, isMatchedMonster, triggerOmenMatch } from "../systems/omens.js";
import { getActiveSynergies, recordSynergyDiscovery } from "../data/tags.js";

export function startCombat(isBoss, isMidboss = false, isRoamingFlack = false) {
  state.gameState = "combat";
  if (state.currentRun) {
    state.currentRun.battles++;
  }

  const { monsters, isRare } = generateEncounter(state, isBoss, isMidboss, isRoamingFlack);

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

  const omen = getOmenForFloor(state.seed, state.floor);
  if (omen) {
    let matched = false;
    if (isRare && omen.id === "dry_bell") {
      matched = true;
    } else if (isMatchedMonster(omen.id, monsters)) {
      matched = true;
    }
    if (matched) {
      triggerOmenMatch(omen.id);
    }
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
    isAuto: false,
    allParalyzedTurns: 0
  };
  state.chestState = null;

  combatSelection.charIdx = 0;
  combatSelection.actions = [];
  menuContext.prevGameState = null;
  menuContext.type = "";
  menuHistory.length = 0;

  addLog(`戦闘開始！敵が現れた：${monsters.map(m => m.name).join(", ")}`);
  
  const activeSyns = getActiveSynergies(state.party);
  activeSyns.forEach(syn => {
    const isNew = !state.codex.synergies || !state.codex.synergies[syn.id];
    recordSynergyDiscovery(syn.id);
    if (isNew || Math.random() < 0.3) {
      addLog(syn.log);
    }
  });
  
  if (state.codex) {
    if (!state.codex.monsters) state.codex.monsters = {};
    monsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = { encountered: 0, killed: 0, firstKilled: false };
      }
      state.codex.monsters[baseName].encountered++;
    });
  }
  
  advanceActionSelection();
  saveAutosave();
}
