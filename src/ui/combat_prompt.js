import { state } from "../state.js";
import { getClassJpName } from "../data.js";
import { combatSelection } from "../combat.js";
import { getScreenViewState } from "../state/view_state.js";
import { menuContext } from "../navigation.js";

export function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!prompt) return;
  const view = getScreenViewState(state, menuContext);
  if (view.gameState !== "combat" || !view.hasCombat || !view.hasUsableCombatActor) {
    prompt.textContent = "";
    return;
  }

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const currentSelect = livingChars[combatSelection.charIdx];
  if (!view.isActionableCombat || state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
  } else if (currentSelect) {
    const classJp = getClassJpName(currentSelect.c.class);
    prompt.textContent = `${currentSelect.c.name} (${classJp}) の行動を選択：`;
  } else {
    prompt.textContent = "ターン解決中...";
  }
}
