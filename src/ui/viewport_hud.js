import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { getScreenViewState } from "../state/view_state.js";

export function updateViewportHUD() {
  const hud = document.getElementById("viewport-hud");
  if (!hud) return;

  const view = getScreenViewState(state, menuContext);
  const isUsableCombat = view.gameState === "combat" && view.hasCombat;
  if (view.gameState !== "explore" && !isUsableCombat) {
    hud.style.display = "none";
    return;
  }

  if (!view.hasMap || !view.hasCurrentCell) {
    hud.style.display = "none";
    return;
  }
  hud.style.display = "flex";
  const map = state.map;
  const cell = map[state.y]?.[state.x];
  if (!cell) return;

  // Directions: 0:N, 1:E, 2:S, 3:W
  const DIR_LABELS = ["北", "東", "南", "西"];
  const dirLabel = DIR_LABELS[state.dir];

  const direction = document.createElement("div");
  direction.className = "hud-dir";
  direction.textContent = state.lightTurns > 0
    ? `${state.lightPower === "lomilwa" ? "LOMILWA強光" : "MILWA明かり"}: 残り${state.lightTurns}歩 / 方角: ${dirLabel}`
    : `方角: ${dirLabel}`;
  hud.replaceChildren(direction);
}
