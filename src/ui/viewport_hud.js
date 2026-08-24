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

  const isDumapic = state.dumapicTurns > 0;
  if (isDumapic) {
    hud.innerHTML = `
      <div class="hud-dir dumapic-active">B${state.floor}F X:${state.x} Y:${state.y} ${dirLabel} | DUMAPIC ${state.dumapicTurns}</div>
    `;
  } else if (state.lightTurns > 0) {
    const lightName = state.lightPower === "lomilwa" ? "LOMILWA強光" : "MILWA明かり";
    hud.innerHTML = `
      <div class="hud-dir">${lightName}: 残り${state.lightTurns}歩 / 方角: ${dirLabel}</div>
    `;
  } else {
    hud.innerHTML = `
      <div class="hud-dir">方角: ${dirLabel}</div>
    `;
  }
}
