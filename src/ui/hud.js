import { state } from "../state.js";
import { isSpellcaster, getCharMaxHp, getCharMaxMp, getActiveSynergies } from "../data.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { combatSelection } from "../combat.js";

export function updatePartyHUD() {
  const grid = document.getElementById("party-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // 反応中のシナジー表示
  let synergyBanner = document.getElementById("party-synergy-banner");
  if (!synergyBanner) {
    synergyBanner = document.createElement("div");
    synergyBanner.id = "party-synergy-banner";
    synergyBanner.style.fontFamily = "var(--font-mono)";
    synergyBanner.style.fontSize = "9px";
    synergyBanner.style.color = "var(--neon-green)";
    synergyBanner.style.padding = "4px 8px";
    synergyBanner.style.borderBottom = "1px solid #222";
    synergyBanner.style.background = "rgba(0, 255, 102, 0.02)";
    synergyBanner.style.textAlign = "center";
    synergyBanner.style.display = "none";
    
    const partyPanel = document.getElementById("party-panel");
    if (partyPanel) {
      partyPanel.insertBefore(synergyBanner, grid);
    }
  }

  const activeSyns = getActiveSynergies(state.party);
  if (activeSyns.length > 0) {
    const names = activeSyns.map(s => s.name).join(", ");
    synergyBanner.textContent = `反応中: ${names}`;
    synergyBanner.style.display = "block";
  } else {
    synergyBanner.style.display = "none";
  }
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
