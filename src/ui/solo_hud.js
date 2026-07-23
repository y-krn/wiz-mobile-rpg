import { state } from "../state.js";
import { getCharMaxHp, getCharMaxMp, getClassJpName, isSpellcaster } from "../data.js";

export function updateSoloHUD() {
  const hud = document.getElementById("character-hud");
  if (!hud) return;
  hud.replaceChildren();

  const char = state.party[0];
  if (!char) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "クラス未選択";
    hud.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "character-card";
  const maxHp = getCharMaxHp(char);
  const maxMp = getCharMaxMp(char);
  const hpPct = maxHp > 0 ? (char.hp / maxHp) * 100 : 0;
  const mpPct = maxMp > 0 ? (char.mp / maxMp) * 100 : 0;

  card.innerHTML = `
    <div class="character-identity">
      <strong>${char.name}</strong>
      <span>${getClassJpName(char.class)} Lv.${char.level}</span>
    </div>
    <div class="character-vitals">
      <div class="bar-container hp-row">
        <span class="bar-label">HP</span>
        <div class="bar"><div class="bar-fill hp" style="width: ${hpPct}%"></div></div>
        <span class="bar-value">${char.hp}/${maxHp}</span>
      </div>
      <div class="bar-container mp-row" ${isSpellcaster(char) ? "" : "hidden"}>
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
