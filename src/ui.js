import { state, getCharWeaponAtk, getCharDef } from "./state.js";
import { DIR_NAMES } from "./data.js";
import { isMuted } from "./audio.js";
import { menuContext } from "./menu.js";
import { combatSelection } from "./combat.js";

export function resetViewportZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    // Force reset viewport scale to 1.0
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  }
}

export function updateUI() {
  resetViewportZoom();

  // Update locations & gold labels
  const locLabel = document.getElementById("location-label");
  const goldLabel = document.getElementById("gold-counter");
  
  if (state.gameState === "town") {
    locLabel.textContent = "TOWN OF LLYLGAMYN";
  } else if (state.gameState === "explore") {
    const lightText = state.lightTurns > 0 ? ` (LIGHT:${state.lightTurns})` : "";
    locLabel.textContent = `DUNGEON B${state.floor}F X:${state.x} Y:${state.y}${lightText}`;
  } else if (state.gameState === "combat") {
    locLabel.textContent = "BATTLE ENCOUNTER";
  } else if (state.gameState === "chest") {
    locLabel.textContent = "TREASURE CHEST";
  } else if (state.gameState === "victory") {
    locLabel.textContent = "CONGRATULATIONS!";
  } else if (state.gameState === "gameover") {
    locLabel.textContent = "GAME OVER";
  }
  
  goldLabel.textContent = `GOLD: ${state.gold}`;

  // Update mute button display
  const btnMute = document.getElementById("btn-mute");
  if (btnMute) {
    if (isMuted) {
      btnMute.textContent = "🎵 OFF";
      btnMute.className = "btn btn-mute sound-off";
      btnMute.title = "音声をオンにする";
    } else {
      btnMute.textContent = "🎵 ON";
      btnMute.className = "btn btn-mute sound-on";
      btnMute.title = "ミュートにする";
    }
  }

  // Update Logs
  const logContent = document.getElementById("log-content");
  logContent.innerHTML = "";
  state.logs.forEach(msg => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    
    // Auto color coding Japanese logs & Combat sides
    if (msg.includes("[味方]")) {
      if (msg.includes("回復") || msg.includes("治") || msg.includes("無事")) {
        entry.classList.add("heal"); // 味方の回復/治療/解除成功はグリーン
      } else {
        entry.classList.add("ally"); // 味方の通常の攻撃等はパープル
      }
    } else if (msg.includes("[ 敵 ]")) {
      entry.classList.add("enemy"); // 敵の行動はすべてレッド
    } else if (msg.includes("ダメージ") || msg.includes("倒れた") || msg.includes("失敗")) {
      entry.classList.add("damage");
    } else if (msg.includes("回復") || msg.includes("レベルアップ") || msg.includes("強さ") || msg.includes("休息")) {
      entry.classList.add("heal");
    } else if (msg.includes("ゴールド") || msg.includes("ゴールド") || msg.includes("手に入れた") || msg.includes("獲得した") || msg.includes("購入") || msg.includes("売却")) {
      entry.classList.add("loot");
    } else if (msg.includes("唱えた") || msg.includes("明かり") || msg.includes("座標")) {
      entry.classList.add("info");
    }
    
    entry.textContent = msg;
    logContent.appendChild(entry);
  });
  // Auto scroll logs
  const logPanel = document.getElementById("log-panel");
  logPanel.scrollTop = logPanel.scrollHeight;

  // Update Controls Panel visible state
  const groups = ["explore-controls", "combat-controls", "town-controls", "submenu-controls"];
  groups.forEach(g => {
    const el = document.getElementById(g);
    el.classList.remove("active");
  });

  if (state.gameState === "explore") {
    document.getElementById("explore-controls").classList.add("active");
  } else if (state.gameState === "combat") {
    document.getElementById("combat-controls").classList.add("active");
    const gridEl = document.querySelector(".combat-grid");
    if (gridEl) {
      if (state.combatState && state.combatState.phase === "resolving") {
        gridEl.style.pointerEvents = "none";
        gridEl.style.opacity = "0.5";
      } else {
        gridEl.style.pointerEvents = "auto";
        gridEl.style.opacity = "1";
        
        const cancelBtn = document.getElementById("btn-combat-cancel");
        if (cancelBtn) {
          if (combatSelection.charIdx === 0) {
            cancelBtn.style.opacity = "0.3";
            cancelBtn.style.pointerEvents = "none";
          } else {
            cancelBtn.style.opacity = "1";
            cancelBtn.style.pointerEvents = "auto";
          }
        }
      }
    }
    updateCombatPrompt();
  } else if (state.gameState === "town") {
    document.getElementById("town-controls").classList.add("active");
  } else if (state.gameState === "submenu") {
    document.getElementById("submenu-controls").classList.add("active");
  }

  // Disable interaction during transition
  const controlsPanel = document.getElementById("controls-panel");
  if (controlsPanel) {
    if (state.transitioning) {
      controlsPanel.style.pointerEvents = "none";
      controlsPanel.style.opacity = "0.6";
    } else {
      controlsPanel.style.pointerEvents = "auto";
      controlsPanel.style.opacity = "1";
    }
  }

  // Update Party HUD
  updatePartyHUD();
}

export function updatePartyHUD() {
  const grid = document.getElementById("party-grid");
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
    
    // Name and Class
    const header = document.createElement("div");
    header.className = "char-header";
    header.innerHTML = `<span class="char-name">${char.name}</span><span class="char-class">Lv.${char.level} ${char.class[0]}</span>`;
    card.appendChild(header);

    // HP Bar
    const hpPct = char.maxHp > 0 ? (char.hp / char.maxHp) * 100 : 0;
    const hpContainer = document.createElement("div");
    hpContainer.className = "char-hpmp";
    hpContainer.innerHTML = `
      <div class="bar-container">
        <span class="bar-label">H</span>
        <div class="bar"><div class="bar-fill hp" style="width: ${hpPct}%"></div></div>
        <span>${char.hp}</span>
      </div>
    `;
    
    // MP Bar (only for spellcasters)
    if (char.class === "Priest" || char.class === "Mage") {
      const mpPct = char.maxMp > 0 ? (char.mp / char.maxMp) * 100 : 0;
      hpContainer.innerHTML += `
        <div class="bar-container">
          <span class="bar-label">M</span>
          <div class="bar"><div class="bar-fill mp" style="width: ${mpPct}%"></div></div>
          <span>${char.mp}</span>
        </div>
      `;
    }
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

export function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!state.combatState) return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const currentSelect = livingChars[combatSelection.charIdx];
  if (state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
  } else if (currentSelect) {
    const classJp = currentSelect.c.class === "Fighter" ? "戦士" : currentSelect.c.class === "Thief" ? "盗賊" : currentSelect.c.class === "Priest" ? "僧侶" : "魔術師";
    prompt.textContent = `${currentSelect.c.name} (${classJp}) の行動を選択：`;
  } else {
    prompt.textContent = "ターン解決中...";
  }
}
