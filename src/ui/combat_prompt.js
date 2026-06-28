import { state } from "../state.js";
import { getClassJpName } from "../data.js";
import { combatSelection } from "../combat.js";

export function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!prompt || !state.combatState) return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const currentSelect = livingChars[combatSelection.charIdx];
  if (state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
  } else if (currentSelect) {
    const classJp = getClassJpName(currentSelect.c.class);
    prompt.textContent = `${currentSelect.c.name} (${classJp}) の行動を選択：`;
  } else {
    prompt.textContent = "ターン解決中...";
  }
}
