import { state, addLog, saveAutosave } from "../state.js";
import { menuContext } from "../navigation.js";
import { hasUsableCombatActor, isUsableCombatScreen, isUsableSpellForActor } from "../state/view_state.js";
import { SPELLS, ITEMS, getSpellPayment } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "../ui.js";
import { chooseAutoCombatAction, getAutoHealTargetIdx } from "../combat_logic/auto_action.js";
import { combatSelection } from "./combat_state.js";
import { resolveCombatRound } from "./round_runner.js";
import { openCombatTargetMenu } from "./target_menu.js";
import { openCombatSpellMenu } from "./spell_menu.js";
import { openCombatItemMenu } from "./item_menu.js";
import { getItemAllyTargetIndices, getSpellAllyTargetIndices } from "../rules/spell_targeting.js";
import {
  trackCombatDecisionCancel,
  trackCombatDecisionPending
} from "../telemetry.js";

export { combatSelection };

function canActInCombat() {
  return !state.transitioning && isUsableCombatScreen(state, menuContext) &&
    state.combatState?.phase === "choose_actions" && hasUsableCombatActor(state.party) &&
    Number.isInteger(combatSelection.charIdx) && combatSelection.charIdx >= 0;
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
  if (!canActInCombat()) return;
  // Find next living character
  const livingIdxs = getLivingCharacters().map(({ index }) => index);
  if (livingIdxs.length === 0) return;
  
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
    openCombatTargetMenu("enemy", (targetIdx) => {
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
    openCombatSpellMenu(char, (spellName) => {
      if (!isUsableSpellForActor(state.party, charOriginalIdx, spellName)) return;
      const spell = SPELLS[spellName];
      if (!getSpellPayment(char, spell.cost).canCast) {
        addLog("MPもHPも足りません。");
        return;
      }
      
      // Determine targets
      if (spell.target === "single_enemy") {
        openCombatTargetMenu("enemy", (targetIdx) => {
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
    openCombatItemMenu((itemKey, itemIdx) => {
      const item = ITEMS[itemKey];
      if (item.type !== "usable" || item.campOnly) {
        addLog("戦闘中その道具は使用できません。");
        return;
      }
      const enqueueAllyItem = (targetIdx) => {
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
