import { state } from "../state.js";
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { captureException } from "../sentry.js";

const reportedStatFallbacks = new Set();

function reportStatFallback(error, stat) {
  if (reportedStatFallbacks.has(stat)) return;
  reportedStatFallbacks.add(stat);
  captureException(error, {
    level: "warning",
    tags: {
      subsystem: "ui",
      op: "solo-hud-stat",
      recovery: "use-stored-stat",
      stat
    }
  });
}

export function updateSoloHUD() {
  const hud = document.getElementById("character-hud");
  if (!hud) return;
  hud.replaceChildren();

  const char = Array.isArray(state.party) ? state.party[0] : null;
  if (!char) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "冒険者未選択";
    hud.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "character-card";
  let maxHp;
  let maxMp;
  try {
    maxHp = getCharMaxHp(char);
  } catch (error) {
    reportStatFallback(error, "maxHp");
    maxHp = Math.max(1, Number(char.maxHp) || 1);
  }
  try {
    maxMp = getCharMaxMp(char);
  } catch (error) {
    reportStatFallback(error, "maxMp");
    maxMp = Math.max(0, Number(char.maxMp) || 0);
  }
  const hpPct = maxHp > 0 ? (char.hp / maxHp) * 100 : 0;
  const mpPct = maxMp > 0 ? (char.mp / maxMp) * 100 : 0;

  card.innerHTML = `
    <div class="character-identity">
      <strong>${char.name}</strong>
      <span>Lv.${char.level}</span>
    </div>
    <div class="character-vitals">
      <div class="bar-container hp-row">
        <span class="bar-label">HP</span>
        <div class="bar"><div class="bar-fill hp" style="width: ${hpPct}%"></div></div>
        <span class="bar-value">${char.hp}/${maxHp}</span>
      </div>
      <div class="bar-container mp-row" ${maxMp > 0 ? "" : "hidden"}>
        <span class="bar-label">MP</span>
        <div class="bar"><div class="bar-fill mp" style="width: ${mpPct}%"></div></div>
        <span class="bar-value">${char.mp}/${maxMp}</span>
      </div>
    </div>
  `;

  if (char.status !== "ok") {
    const status = document.createElement("span");
    status.className = `character-status ${char.status}`;
    status.textContent = char.status.toUpperCase();
    card.appendChild(status);
  }
  hud.appendChild(card);
}
