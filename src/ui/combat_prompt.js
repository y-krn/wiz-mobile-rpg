import { state } from "../state.js";
import { combatSelection } from "../combat.js";
import { getScreenViewState } from "../state/view_state.js";
import { menuContext } from "../navigation.js";

function setPromptPhase(prompt, phase) {
  if (!prompt.dataset) return;
  if (phase) prompt.dataset.phase = phase;
  else delete prompt.dataset.phase;
}

export function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!prompt) return;
  const view = getScreenViewState(state, menuContext);
  if (view.gameState !== "combat" || !view.hasCombat || !view.hasUsableCombatActor) {
    prompt.textContent = "";
    setPromptPhase(prompt, null);
    return;
  }

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const currentSelect = livingChars[combatSelection.charIdx];
  // data-phase lets the shell add the touch hint only while an action is
  // being chosen.
  if (!view.isActionableCombat || state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
    setPromptPhase(prompt, "resolving");
  } else if (currentSelect) {
    prompt.textContent = `${currentSelect.c.name} の行動を選択：`;
    setPromptPhase(prompt, "choose");
  } else {
    prompt.textContent = "ターン解決中...";
    setPromptPhase(prompt, "resolving");
  }
}
