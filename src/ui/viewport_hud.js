import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { getScreenViewState } from "../state/view_state.js";

export function updateViewportHUD() {
  const hud = document.getElementById("viewport-hud");
  if (!hud) return;

  const view = getScreenViewState(state, menuContext);
  const isCombatContext = view.hasCombat && (view.gameState === "combat" || view.isCombatOverlaySubmenu);
  if (view.gameState !== "explore" && !isCombatContext) {
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

  hud.replaceChildren();
  if (isCombatContext) {
    const enemyStatus = document.createElement("div");
    enemyStatus.className = "combat-enemy-semantic sr-only";
    enemyStatus.setAttribute("aria-label", "敵の状態");
    state.combatState.monsters.filter(monster => monster.hp > 0).forEach(monster => {
      const status = document.createElement("span");
      status.className = "sr-only";
      status.textContent = `${monster.name}、HP ${monster.hp}/${monster.maxHp}`;
      enemyStatus.appendChild(status);
    });
    hud.appendChild(enemyStatus);
    return;
  }
  const direction = document.createElement("div");
  direction.className = "hud-dir";
  direction.textContent = state.lightTurns > 0
    ? `${state.lightPower === "lomilwa" ? "LOMILWA強光" : "MILWA明かり"}: 残り${state.lightTurns}歩 / 方角: ${dirLabel}`
    : `方角: ${dirLabel}`;
  hud.appendChild(direction);
}
