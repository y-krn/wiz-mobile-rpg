import { state, addLog, saveAutosave } from "../state.js";
import { menuContext } from "../navigation.js";
import { hasCombatRoundActor, hasUsableCombatActor, isActionableCombatContext, isActionableCombatScreen, isUsableCombatScreen, isUsableSpellForActor } from "../state/view_state.js";
import { SPELLS, ITEMS, getSpellPayment } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "../ui.js";
import { chooseAutoCombatAction, getAutoHealTargetIdx } from "../combat_logic/auto_action.js";
import { combatSelection } from "./combat_state.js";
import { resolveCombatRound } from "./round_runner.js";
import { openCombatTargetMenu } from "./target_menu.js";
import { openCombatSpellMenu } from "./spell_menu.js";
import { openCombatItemMenu } from "./item_menu.js";
import { openSubmenu } from "../navigation.js";
import { COMBAT_SPELL_TARGETS, getItemAllyTargetIndices, getSpellAllyTargetIndices } from "../rules/spell_targeting.js";
import { getItemBaseId } from "../rules/item_rules.js";
import {
  trackCombatDecisionCancel,
  trackCombatDecisionPending
} from "../telemetry.js";

// balance-impact: none — repeat is a UI input shortcut and reuses existing combat rules.

export { combatSelection };

function getCurrentSelectionActor() {
  const livingChars = getLivingCharacters();
  return livingChars[combatSelection.charIdx] || null;
}

function getLastActionForCurrentActor() {
  const current = getCurrentSelectionActor();
  if (!current || !Array.isArray(state.combatState?.lastActions)) return null;
  return state.combatState.lastActions.find(action => action?.actorIdx === current.index) || null;
}

function isRepeatableAction(action, actorIdx) {
  if (!action || action.actorIdx !== actorIdx) return false;
  if (action.type === "fight") {
    return isValidEnemyTarget(action.targetIdx);
  }
  if (action.type === "defend" || action.type === "run") return true;
  if (action.type === "spell") {
    const spell = SPELLS[action.spellName];
    if (!spell || !isUsableSpellForActor(state.party, actorIdx, action.spellName, COMBAT_SPELL_TARGETS) ||
        !getSpellPayment(state.party[actorIdx], spell.cost).canCast) return false;
    if (spell.target === "single_enemy") return isValidEnemyTarget(action.targetIdx);
    if (spell.target === "single_ally") {
      return isValidAllyTarget(action.targetIdx, getSpellAllyTargetIndices(action.spellName, state.party));
    }
    if (spell.target === "all_enemies") {
      return state.combatState?.monsters?.some(monster => monster.hp > 0) === true;
    }
    return getSpellAllyTargetIndices(action.spellName, state.party).length > 0;
  }
  if (action.type === "item") {
    const itemKey = state.inventory?.[action.itemIdx];
    if (getItemBaseId(itemKey) !== getItemBaseId(action.itemKey)) return false;
    const item = ITEMS[getItemBaseId(itemKey)];
    if (!item || item.type !== "usable" || item.campOnly || getItemBaseId(itemKey) === "TOWN_PORTAL") return false;
    return isValidAllyTarget(action.targetIdx, getItemAllyTargetIndices(state.party));
  }
  return false;
}

export function getRepeatActionStatus() {
  if (!canActInCombat()) return { available: false, reason: "戦闘中ではありません" };
  const current = getCurrentSelectionActor();
  const action = getLastActionForCurrentActor();
  if (!current || !action) return { available: false, reason: "前回の行動がありません" };
  if (!isRepeatableAction(action, current.index)) {
    return { available: false, reason: "前回の行動は現在の条件では成立しません" };
  }
  return { available: true, action, actorIdx: current.index };
}

export function repeatLastCombatAction() {
  const status = getRepeatActionStatus();
  if (!status.available) return false;
  combatSelection.actions.push({ ...status.action, actorIdx: status.actorIdx });
  combatSelection.charIdx++;
  advanceActionSelection();
  return true;
}

function canActInCombat() {
  return isActionableCombatScreen(state, menuContext) && hasUsableCombatActor(state.party) &&
    Number.isInteger(combatSelection.charIdx) && combatSelection.charIdx >= 0;
}

function canCommitCombatAction() {
  return isActionableCombatContext(state, menuContext);
}

function canAdvanceCombatRound() {
  return !state.transitioning && isUsableCombatScreen(state, menuContext) &&
    state.combatState?.phase === "choose_actions" && hasCombatRoundActor(state.party);
}

function isValidEnemyTarget(targetIdx) {
  const monsters = state.combatState?.monsters;
  if (!Array.isArray(monsters) || !Number.isInteger(targetIdx) || targetIdx < 0 || !Object.hasOwn(monsters, targetIdx)) return false;
  const monster = monsters[targetIdx];
  return Boolean(monster) && typeof monster === "object" && !Array.isArray(monster) && monster.hp > 0;
}

function isValidAllyTarget(targetIdx, allowedIndices) {
  if (!Array.isArray(state.party) || !Number.isInteger(targetIdx) || !allowedIndices.includes(targetIdx) || !Object.hasOwn(state.party, targetIdx)) return false;
  const actor = state.party[targetIdx];
  return Boolean(actor) && typeof actor === "object" && !Array.isArray(actor) &&
    ["ok", "poisoned", "blind"].includes(actor.status);
}

function getLivingCharacters() {
  if (!Array.isArray(state.party)) return [];
  return state.party
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => char && typeof char === "object" && !Array.isArray(char) && ["ok", "poisoned", "blind"].includes(char.status));
}

export function toggleCombatAuto() {
  if (!canActInCombat()) return;
  const wasAuto = state.combatState.isAuto;
  state.combatState.isAuto = !state.combatState.isAuto;
  playSound("move");
  
  if (wasAuto) {
    addLog("オート戦闘を停止しました。");
  } else {
    addLog("オート戦闘をオンにしました。");
  }
  
  if (state.combatState.isAuto && state.combatState.phase === "choose_actions") {
    advanceActionSelection();
  } else {
    updateUI();
  }
}

export function advanceActionSelection() {
  if (!canAdvanceCombatRound()) return;
  // Find next living character
  const livingIdxs = getLivingCharacters().map(({ index }) => index);
  if (livingIdxs.length === 0) {
    // Incapacitated characters are intentionally absent from the action UI,
    // but their round turn still needs to reach round.js for status recovery.
    resolveCombatRound();
    return;
  }
  
  if (state.combatState && state.combatState.isAuto) {
    while (combatSelection.charIdx < livingIdxs.length) {
      const charOriginalIdx = livingIdxs[combatSelection.charIdx];
      const character = state.party[charOriginalIdx];
      const autoAction = chooseAutoCombatAction({
        character,
        monsters: state.combatState.monsters,
        roundNumber: state.combatState.roundNumber,
        healingTargetIdx: getAutoHealTargetIdx(character),
        canCastSpell: (spellName, reserveMp) => {
          const spell = SPELLS[spellName];
          if (!spell) return false;
          const payment = getSpellPayment(character, spell.cost);
          return payment.canCast &&
            (payment.resource !== "mp" || character.mp - reserveMp >= payment.cost);
        }
      });
      combatSelection.actions.push({
        ...(autoAction || { type: "fight", targetIdx: 0 }),
        actorIdx: charOriginalIdx
      });
      combatSelection.charIdx++;
    }
  }

  if (combatSelection.charIdx >= livingIdxs.length) {
    // All characters chose actions! Run turn resolution.
    resolveCombatRound();
  } else {
    saveAutosave();
    updateUI();
  }
}

export function selectCombatAction(type) {
  if (!canActInCombat() || state.combatState.phase !== "choose_actions") return;

  const livingChars = getLivingCharacters();
  const currentCharacter = livingChars[combatSelection.charIdx];
  if (!currentCharacter) return;
  const char = currentCharacter.char;
  const charOriginalIdx = currentCharacter.index;

  if (type === "fight") {
    // Let player choose target monster
    menuContext.actorIdx = charOriginalIdx;
    openCombatTargetMenu("enemy", (targetIdx) => {
      if (!canCommitCombatAction() || !isValidEnemyTarget(targetIdx)) return;
      state.gameState = "combat";
      combatSelection.actions.push({
        type: "fight",
        actorIdx: charOriginalIdx,
        targetIdx
      });
      trackCombatDecisionPending("attack", {
        state,
        character: char,
        combat: state.combatState,
        actorIdx: charOriginalIdx,
        targetIdx
      });
      combatSelection.charIdx++;
      advanceActionSelection();
    });
  } else if (type === "spell") {
    // Show available caster spells
    if (!Array.isArray(char.spells) || char.spells.length === 0) {
      addLog(`${char.name}は唱えられる呪文を持っていません。`);
      return;
    }
    menuContext.actorIdx = charOriginalIdx;
    openCombatSpellMenu(char, (spellName) => {
      if (!canCommitCombatAction() || !isUsableSpellForActor(state.party, charOriginalIdx, spellName, COMBAT_SPELL_TARGETS)) return;
      const spell = SPELLS[spellName];
      if (!getSpellPayment(char, spell.cost).canCast) {
        addLog("MPもHPも足りません。");
        return;
      }
      
      // Determine targets
      if (spell.target === "single_enemy") {
        openCombatTargetMenu("enemy", (targetIdx) => {
          if (!canCommitCombatAction() || !isValidEnemyTarget(targetIdx)) return;
          state.gameState = "combat";
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          trackCombatDecisionPending("spell", {
            state,
            character: char,
            combat: state.combatState,
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        }, spellName);
      } else if (spell.target === "single_ally") {
        const enqueueAllySpell = (targetIdx) => {
          if (!canCommitCombatAction() || !isUsableSpellForActor(state.party, charOriginalIdx, spellName, "single_ally") ||
              !isValidAllyTarget(targetIdx, getSpellAllyTargetIndices(spellName, state.party))) return;
          state.gameState = "combat";
          combatSelection.actions.push({
            type: "spell",
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          trackCombatDecisionPending("spell", {
            state,
            character: char,
            combat: state.combatState,
            actorIdx: charOriginalIdx,
            targetIdx,
            spellName
          });
          combatSelection.charIdx++;
          advanceActionSelection();
        };
        const targetIndices = getSpellAllyTargetIndices(spellName, state.party);
        if (targetIndices.length === 1) {
          state.gameState = "combat";
          enqueueAllySpell(targetIndices[0]);
        } else {
          openCombatTargetMenu("ally", enqueueAllySpell, spellName);
        }
      } else {
        // All enemies / all allies
        if (!canCommitCombatAction()) return;
        state.gameState = "combat";
        combatSelection.actions.push({
          type: "spell",
          actorIdx: charOriginalIdx,
          targetIdx: -1, // targets all
          spellName
        });
        trackCombatDecisionPending("spell", {
          state,
          character: char,
          combat: state.combatState,
          actorIdx: charOriginalIdx,
          targetIdx: -1,
          spellName
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      }
    });
  } else if (type === "item") {
    // Open item selection
    if (state.inventory.length === 0) {
      addLog("共有バッグは空っぽです。");
      return;
    }
    menuContext.actorIdx = charOriginalIdx;
    openCombatItemMenu((itemKey, itemIdx) => {
      if (!canCommitCombatAction()) return;
      const item = ITEMS[itemKey];
      if (!item || item.type !== "usable" || item.campOnly) {
        addLog("戦闘中その道具は使用できません。");
        return;
      }
      if (itemKey === "TOWN_PORTAL") {
        menuContext.itemKey = itemKey;
        menuContext.itemIdx = itemIdx;
        openSubmenu("item_target_select", "帰還の翼：救出する戦果を選択");
        return;
      }
      const enqueueAllyItem = (targetIdx) => {
        if (!canCommitCombatAction() || !isValidAllyTarget(targetIdx, getItemAllyTargetIndices(state.party))) return;
        state.gameState = "combat";
        combatSelection.actions.push({
          type: "item",
          actorIdx: charOriginalIdx,
          targetIdx,
          itemKey,
          itemIdx
        });
        trackCombatDecisionPending("item", {
          state,
          character: char,
          combat: state.combatState,
          actorIdx: charOriginalIdx,
          targetIdx,
          itemKey
        });
        combatSelection.charIdx++;
        advanceActionSelection();
      };
      const targetIndices = getItemAllyTargetIndices(state.party);
      if (targetIndices.length === 1) {
        if (!canCommitCombatAction()) return;
        state.gameState = "combat";
        enqueueAllyItem(targetIndices[0]);
      } else {
        openCombatTargetMenu("ally", enqueueAllyItem);
      }
    });
  } else if (type === "defend") {
    combatSelection.actions.push({
      type: "defend",
      actorIdx: charOriginalIdx
    });
    trackCombatDecisionPending("defend", {
      state,
      character: char,
      combat: state.combatState,
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  } else if (type === "run") {
    combatSelection.actions.push({
      type: "run",
      actorIdx: charOriginalIdx
    });
    trackCombatDecisionPending("flee", {
      state,
      character: char,
      combat: state.combatState,
      actorIdx: charOriginalIdx
    });
    combatSelection.charIdx++;
    advanceActionSelection();
  }
}

export function cancelCombatAction() {
  if (!canActInCombat() || state.combatState.phase !== "choose_actions") return;
  if (combatSelection.charIdx > 0) {
    combatSelection.actions.pop();
    trackCombatDecisionCancel();
    combatSelection.charIdx--;
    playSound("move");
    updateUI();
  }
}
