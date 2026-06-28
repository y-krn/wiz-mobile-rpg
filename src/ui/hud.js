import { state } from "../state.js";
import { isSpellcaster, getCharMaxHp, getCharMaxMp } from "../data.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { combatSelection } from "../combat.js";

export function updatePartyHUD() {
  const grid = document.getElementById("party-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const selectingChar = state.gameState === "combat" && state.combatState?.phase === "choose_actions"
    ? state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status))[combatSelection.charIdx]
    : null;

  state.party.forEach((char, idx) => {
    const card = document.createElement("div");
    card.className = "party-card";
    
    // Highlight if selecting combat actions for this character
    if (selectingChar?.i === idx) {
      card.classList.add("selected");
    }
    
    // Interactive HUD when in town
    if (state.gameState === "town") {
      card.onclick = () => {
        menuContext.actorIdx = idx;
        openSubmenu("camp_status", "パーティの強さ");
      };
    } else {
      card.onclick = null;
    }
    
    // Name and Class
    const header = document.createElement("div");
    header.className = "char-header";
    const rowLabel = idx < 2 ? "[前]" : "[後]";
    const rowColor = idx < 2 ? "var(--neon-cyan)" : "var(--neon-gold)";
    header.innerHTML = `<span class="char-name">${char.name} <span style="font-size: 8px; color: ${rowColor}; font-weight: normal; margin-left: 2px;">${rowLabel}</span></span><span class="char-class">${char.class[0]}</span>`;
    card.appendChild(header);

    // HP Bar
    const maxHp = getCharMaxHp(char);
    const hpPct = maxHp > 0 ? (char.hp / maxHp) * 100 : 0;
    const hpContainer = document.createElement("div");
    hpContainer.className = "char-hpmp";
    hpContainer.innerHTML = `
      <div class="bar-container">
        <span class="bar-label">H</span>
        <div class="bar"><div class="bar-fill hp" style="width: ${hpPct}%"></div></div>
        <span>${char.hp}</span>
      </div>
    `;
    
    // MP Bar (always rendered to align layouts, hidden for non-spellcasters)
    const spellcaster = isSpellcaster(char);
    const maxMp = getCharMaxMp(char);
    const mpPct = (spellcaster && maxMp > 0) ? (char.mp / maxMp) * 100 : 0;
    const mpVal = spellcaster ? char.mp : "";
    const mpStyle = spellcaster ? "" : "visibility: hidden;";
    
    hpContainer.innerHTML += `
      <div class="bar-container" style="${mpStyle}">
        <span class="bar-label">M</span>
        <div class="bar"><div class="bar-fill mp" style="width: ${mpPct}%"></div></div>
        <span>${mpVal}</span>
      </div>
    `;
    card.appendChild(hpContainer);

    // Status overlay
    if (char.status !== "ok") {
      const statusLabel = document.createElement("div");
      statusLabel.className = `char-status ${char.status}`;
      statusLabel.textContent = char.status.toUpperCase();
      card.appendChild(statusLabel);
    }

    grid.appendChild(card);
  });
}
