import { state } from "../state.js";
import { ITEMS } from "../data.js";
import { menuContext } from "../navigation.js";
import { updateUI } from "../ui.js";
import { combatCallbacks } from "./combat_state.js";

export function openCombatItemMenu(callback) {
  state.gameState = "submenu";
  menuContext.type = "combat_item";
  combatCallbacks.activeItemCallback = callback;

  const optGrid = document.getElementById("submenu-options");
  if (optGrid) optGrid.innerHTML = "";

  if (state.inventory.length === 0) {
    const info = document.createElement("div");
    info.style.color = "var(--text-muted)";
    info.style.textAlign = "center";
    info.style.marginTop = "20px";
    info.style.fontFamily = "var(--font-mono)";
    info.style.fontSize = "11px";
    info.textContent = "共有バッグは空っぽです。";
    if (optGrid) optGrid.appendChild(info);
  } else {
    state.inventory.forEach((itemKey, idx) => {
      const item = ITEMS[itemKey];
      const btn = document.createElement("button");
      btn.className = "btn btn-neon btn-select-item";
      btn.textContent = item.name;

      const usableCheck = item.type !== "usable";
      if (usableCheck) {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      } else {
        btn.addEventListener("click", () => {
          state.gameState = "combat";
          if (combatCallbacks.activeItemCallback) combatCallbacks.activeItemCallback(itemKey, idx);
        });
      }
      if (optGrid) optGrid.appendChild(btn);
    });
  }

  const titleEl = document.getElementById("submenu-title");
  if (titleEl) {
    titleEl.textContent = "道具使用";
  }

  updateUI();
}
