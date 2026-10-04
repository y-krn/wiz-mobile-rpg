import { state, addLog, saveAutosave, recordMonsterEncounter, clearEventObservations } from "../state.js";
import { menuContext, menuHistory } from "../navigation.js";
import { combatSelection } from "./combat_state.js";
import { generateEncounter } from "./encounter.js";
import { advanceActionSelection } from "./action_selection.js";
import { triggerGameOver } from "./game_over.js";
import { getCharCoreParams, getCoreLogText, getEquippedCurseCount } from "../data.js";
import { updateUI } from "../ui.js";
import { resetSubmenuBackButton } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { setupPostCombatChest } from "../chest.js";
import { applyPendingOutcomeRewards } from "./outcome_rewards.js";
import { trackCombatStart } from "../telemetry.js";
import { recordEliteGreedAction } from "../systems/roaming_elites.js";
import { dungeonRenderer as renderer } from "../renderer_runtime.js";
import { preparePhase4jBEncounter } from "../rules/phase4j_b_trial.js";
import { startArmorMendBattle, startForgeTemperBattle } from "../rules/special_rooms.js";

function getRetreatPosition() {
  const { x, y, prevX, prevY, map } = state;
  if (![x, y, prevX, prevY].every(Number.isInteger)) return null;
  if (Math.abs(x - prevX) + Math.abs(y - prevY) !== 1) return null;
  if (!map?.[y]?.[x] || !map?.[prevY]?.[prevX]) return null;

  const retreatDir = prevY < y ? 0 : prevX > x ? 1 : prevY > y ? 2 : 3;
  if (map[y][x].walls?.[retreatDir]) return null;
  return { x: prevX, y: prevY };
}

import { clearTechniqueCombatFlags } from "../rules/technique_rules.js";

export const POST_COMBAT_QUIET_STEPS = 4;

export function startCombat(isBoss, isMidboss = false, isRoamingFlack = false, roamingMonster = null, { mimicChest = null, broodChamber = false } = {}) {
  const isMimic = Boolean(mimicChest);
  // A brood chamber (#1965) is an elite-strength fight that leaves a chest.
  const isBrood = Boolean(broodChamber);
  state.encounterQuietSteps = POST_COMBAT_QUIET_STEPS;
  clearTechniqueCombatFlags(state.party);
  state.gameState = "combat";
  clearEventObservations({ scopePrefix: "combat:" });
  if (state.currentRun) {
    state.currentRun.battles++;
    if (!isBoss && !isMidboss && !isRoamingFlack && !isMimic && !isBrood) recordEliteGreedAction(state, "battle");
  }

  state.party.forEach(char => {
    char.buffs = [];
    delete char.mabarrierTurns;
    if (startForgeTemperBattle(char) === "cooled") addLog(`${char.name}の武器から炉の熱が抜けた。`);
    if (startArmorMendBattle(char) === "worn") addLog(`${char.name}の防具の繕いがほつれた。`);
  });

  const { monsters, isRare, trial, floorRole } = generateEncounter(
    state,
    isBoss,
    isMidboss,
    isRoamingFlack,
    isMimic ? { mimic: true } : isBrood ? { brood: true } : roamingMonster
  );
  const trialExp = preparePhase4jBEncounter(state, monsters, {
    boss: isBoss,
    elite: isRoamingFlack || isMimic || isBrood,
    midboss: isMidboss,
    rare: isRare
  });

  if (state.alarmActive) {
    const mult = state.alarmWeakened ? 1.10 : 1.20;
    monsters.forEach(m => {
      m.hp = Math.round(m.hp * mult);
      m.maxHp = Math.round(m.maxHp * mult);
    });
    addLog(`【⚠️警告】警報により魔物が活性化している！(HP/攻撃力+${Math.round((mult - 1) * 100)}%)`);
    state.alarmActive = false;
    state.alarmWeakened = false;
  }



  if (isBoss || isMidboss || isRoamingFlack || isMimic || isBrood) {
    addLog("【⚠️強敵遭遇！】周囲の空気が張り詰める...！");
    if (isBoss && trial) {
      addLog("【帯の決算】これまでに見た気配が、階層守護者に集約されている…！");
    }
    if (isRoamingFlack) {
      const traitLabels = monsters.map(monster => monster.combatTraitLabel).filter(Boolean);
      if (traitLabels.length > 0) addLog(`【個体特性】${traitLabels.join(" / ")}`);
    }
  } else if (isRare) {
    addLog("【✨希少遭遇！】珍しい魔物が現れた！");
  }

  state.combatState = {
    monsters,
    ...(trialExp.applied ? { trialExpInitialCount: trialExp.initialCount } : {}),
    phase: "choose_actions",
    isBoss,
    isMidboss,
    isRoamingFlack,
    isMimic,
    mimicChest,
    isBrood,
    enemyActionScheduling: !isBoss && !isMidboss && !isRoamingFlack && !isMimic && !isBrood
      ? "shared-normal-slot"
      : "independent",
    roamingMonsterId: roamingMonster?.id ?? null,
    isAuto: false,
    allParalyzedTurns: 0,
    roundNumber: 1,
    retreatPosition: getRetreatPosition(),
    loggedCoreActivations: [],
    // The last resolved turn is a one-turn repeat candidate. It is checked
    // against live actors, targets, resources, and inventory before reuse.
    lastActions: null,
    pendingOutcome: null,
    trialBand: trial ? {
      bandIndex: trial.bandIndex,
      mainId: trial.mainId,
      subId: trial.subId,
      floorRole
    } : null
  };
  trackCombatStart({
    floor: state.floor,
    player: state.party[0],
    monsters,
    isBoss,
    isMidboss,
    isRoamingFlack
  }, state);
  state.chestState = null;

  renderer?.triggerCombatEntry?.();

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
    monsters.forEach(m => recordMonsterEncounter(m, state));
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
      const mimicChest = state.combatState.mimicChest ?? null;
      state.gameState = "chest";
      state.combatState.pendingOutcome = null;
      state.combatState = null;
      state.party.forEach(char => {
        delete char.buffs;
      });
      setupPostCombatChest(mimicChest);
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
