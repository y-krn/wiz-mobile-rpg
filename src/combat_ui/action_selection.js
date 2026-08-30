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
import { COMBAT_SPELL_TARGETS, getItemAllyTargetIndices, getSpellAllyTargetIndices } from "../rules/spell_targeting.js";
import {
  trackCombatDecisionCancel,
  trackCombatDecisionPending
} from "../telemetry.js";

export { combatSelection };

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
