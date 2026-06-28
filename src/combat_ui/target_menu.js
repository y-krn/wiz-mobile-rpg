import { state } from "../state.js";
import { getCharMaxHp } from "../data.js";
import { menuContext } from "../navigation.js";
import { updateUI } from "../ui.js";
import { combatCallbacks } from "./combat_state.js";
import { getEnemyRow } from "./encounter.js";
import { canMeleeTargetEnemy } from "../combat_logic/targeting.js";

export function openCombatTargetMenu(type, callback, spellName = null) {
  state.gameState = "submenu";
  menuContext.type = "combat_target";
  menuContext.targetType = type;
  menuContext.spellName = spellName;
  combatCallbacks.activeTargetCallback = callback;

  const optGrid = document.getElementById("submenu-options");
  if (optGrid) optGrid.innerHTML = "";

  if (type === "enemy") {
    const monsters = state.combatState.monsters;
    const isMeleeTarget = !spellName;
    monsters.forEach((m, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-target-enemy";
      const rowLabel = getEnemyRow(m) === "front" ? "前" : "後";
      btn.textContent = `[${rowLabel}] ${m.name} (${m.hp}/${m.maxHp})`;

      const blocked = isMeleeTarget && !canMeleeTargetEnemy(monsters, m);
      if (m.hp <= 0 || blocked) {
        btn.disabled = true;
        btn.style.opacity = blocked ? "0.55" : "0.3";
        if (blocked) btn.title = "前列に阻まれている";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (combatCallbacks.activeTargetCallback) combatCallbacks.activeTargetCallback(idx);
        });
      }
      if (optGrid) optGrid.appendChild(btn);
    });
  } else {
    state.party.forEach((char, idx) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-target-ally";
      btn.textContent = `${idx + 1}.${char.name} (${char.hp}/${getCharMaxHp(char)})`;
      
      let disabled = false;
      if (spellName === "KADORTO") {
        if (char.status !== "dead") disabled = true;
      } else {
        if (char.status === "dead") disabled = true;
      }

      if (disabled) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (combatCallbacks.activeTargetCallback) combatCallbacks.activeTargetCallback(idx);
        });
      }
      if (optGrid) optGrid.appendChild(btn);
    });
  }

  const titleEl = document.getElementById("submenu-title");
  if (titleEl) {
    titleEl.textContent = type === "enemy" ? "攻撃対象選択" : "対象選択";
  }

  updateUI();
}
