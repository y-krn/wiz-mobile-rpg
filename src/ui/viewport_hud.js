import { state } from "../state.js";
import { menuContext } from "../navigation.js";
import { getScreenViewState } from "../state/view_state.js";
import { getEnemyHpState } from "../rules/enemy_hp_state.js";
import { getHuntStatus } from "../systems/round_trip.js";

// Round-trip prototype (#2066, #2069): the hunter comes from behind, where the
// view never shows it, so its distance stays on screen for the whole way back.
function describeHunt(status) {
  if (status.phase === "arriving") return `${status.name}：あと${status.actions}手で現れる`;
  if (status.phase === "shaken") return `${status.name}：振り切った（あと${status.actions}手）`;
  if (status.phase === "lost") return `${status.name}：こちらへ来られない`;
  return `${status.name}：あと${status.distance}歩`;
}

function createHuntChip() {
  const status = getHuntStatus(state);
  if (!status) return null;
  const chip = document.createElement("div");
  chip.className = "hud-hunter";
  chip.dataset.phase = status.phase;
  chip.dataset.level = String(status.level);
  if (Number.isFinite(status.distance)) chip.dataset.distance = String(status.distance);
  // The log announces the approach; the live region need not repeat every step.
  chip.setAttribute("aria-hidden", "true");
  chip.textContent = describeHunt(status);
  return chip;
}

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
      status.textContent = `${monster.name}、${getEnemyHpState(monster)}、攻撃対象`;
      enemyStatus.appendChild(status);
    });
    hud.appendChild(enemyStatus);
    return;
  }
  const direction = document.createElement("div");
  direction.className = "hud-dir";
  direction.textContent = state.lightTurns > 0
    ? `${state.lightPower === "lomilwa" ? "大灯り" : "灯り"}: 残り${state.lightTurns}手番 / 方角: ${dirLabel}`
    : `方角: ${dirLabel}`;
  hud.appendChild(direction);
  const huntChip = createHuntChip();
  if (huntChip) hud.appendChild(huntChip);
}
