import { state, getCharWeaponAtk, getCharDef } from "./state.js";
import { DIR_NAMES, getClassJpName, isSpellcaster } from "./data.js";
import { isMuted } from "./audio.js";
import { menuContext, renderEquip } from "./menu.js";
import { combatSelection, renderCombatOverlay } from "./combat.js";

export function getFloorExplorationRate() {
  const map = state.map;
  if (!map) return 0;
  let passableCount = 0;
  let visitedCount = 0;
  for (let y = 1; y < map.length - 1; y++) {
    for (let x = 1; x < map[y].length - 1; x++) {
      const cell = map[y][x];
      if (cell && cell.walls && cell.walls.some(w => !w)) {
        passableCount++;
        if (state.visitedMap && state.visitedMap[y][x]) {
          visitedCount++;
        }
      }
    }
  }
  if (passableCount === 0) return 0;
  return Math.floor((visitedCount / passableCount) * 100);
}

export function resetViewportZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    // Force reset viewport scale to 1.0
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  }
}

export function getCurrentGoal() {
  if (state.gameState === "town") {
    if (state.inventory.includes("ANTIGRAVITY_CRYSTAL")) {
      return "おしろに行き、浮遊石を渡してゲームをクリアせよ！";
    }
    return "迷宮に入り、地下深くを探索せよ！";
  }

  // Inside dungeon
  if (state.inventory.includes("ANTIGRAVITY_CRYSTAL")) {
    return "街（リルガミン）に戻り、おしろへ浮遊石を届けよ！";
  }

  const hasKey = state.inventory.includes("DRAGON_KEY");

  switch (state.floor) {
    case 1:
      return "B1F: 地下2階への下り階段を探せ";
    case 2:
      return "B2F: 地下3階への下り階段を探せ";
    case 3:
      if (hasKey) {
        return "B3F: 地下4階への下り階段を探せ";
      }
      return "B3F: デーモンガードを倒し「竜の鍵」を入手せよ";
    case 4:
      if (hasKey) {
        return "B4F: 地下5階への下り階段を探せ";
      }
      return "B3Fに戻り、デーモンガードから「竜の鍵」を奪え";
    case 5:
      if (hasKey) {
        return "B5F: 竜の鍵を使い、最深部の「いにしえの竜」を倒せ";
      }
      return "B3Fに戻り、デーモンガードから「竜の鍵」を奪え";
    default:
      return "迷宮を探索せよ";
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
    const repelText = state.repelTurns > 0 ? ` (REPEL:${state.repelTurns})` : "";
    locLabel.textContent = `DUNGEON B${state.floor}F X:${state.x} Y:${state.y}${lightText}${repelText}`;
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

  // Update Goal HUD
  const goalBanner = document.getElementById("goal-banner");
  if (goalBanner) {
    if (state.gameState === "gameover") {
      goalBanner.textContent = "🎯 目標: 全滅した。セーブから再開するか、最初からやり直せ";
    } else if (state.gameState === "victory") {
      goalBanner.textContent = "🎯 目標: おめでとう！ゲームクリア！";
    } else if (state.gameState === "town") {
      goalBanner.textContent = `🎯 目標: ${getCurrentGoal()}`;
    } else {
      const expRate = getFloorExplorationRate();
      const chestsOpened = state.floorChestsOpened ? (state.floorChestsOpened[state.floor - 1] ?? 0) : 0;
      const chestsTotal = state.floorChestsTotal ? (state.floorChestsTotal[state.floor - 1] ?? 0) : 0;
      goalBanner.textContent = `🎯 目標: ${getCurrentGoal()} | 🗺️ 探索率: ${expRate}% | 📦 宝箱: ${chestsOpened}/${chestsTotal}`;
    }
  }

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
    } else if (msg.includes("【気配】")) {
      entry.classList.add("aura");
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
      const isResolving = state.combatState && state.combatState.phase === "resolving";
      
      const actionButtons = [
        "btn-combat-fight",
        "btn-combat-spell",
        "btn-combat-item",
        "btn-combat-defend",
        "btn-combat-run",
        "btn-combat-cancel"
      ].map(id => document.getElementById(id)).filter(el => el);

      if (isResolving) {
        actionButtons.forEach(btn => {
          btn.style.pointerEvents = "none";
          btn.style.opacity = "0.3";
        });
      } else {
        actionButtons.forEach(btn => {
          btn.style.pointerEvents = "auto";
          btn.style.opacity = "1";
        });
        
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

      const autoBtn = document.getElementById("btn-combat-auto");
      if (autoBtn) {
        autoBtn.style.pointerEvents = "auto";
        if (state.combatState && state.combatState.isAuto) {
          autoBtn.classList.add("active");
          autoBtn.textContent = "オート ON";
        } else {
          autoBtn.classList.remove("active");
          autoBtn.textContent = "オート";
        }
      }
    }
    updateCombatPrompt();
  } else if (state.gameState === "town") {
    document.getElementById("town-controls").classList.add("active");
  } else if (state.gameState === "submenu") {
    document.getElementById("submenu-controls").classList.add("active");
  }

  // Update Shop Overlay visibility
  const shopOverlay = document.getElementById("shop-overlay");
  if (shopOverlay) {
    if (state.gameState === "submenu" && (menuContext.type === "shop_main" || menuContext.type === "shop_buy" || menuContext.type === "shop_sell")) {
      shopOverlay.style.display = "flex";
    } else {
      shopOverlay.style.display = "none";
    }
  }

  // Update Training Overlay visibility
  const trainingOverlay = document.getElementById("training-overlay");
  if (trainingOverlay) {
    if (state.gameState === "submenu" && menuContext.type === "party_assemble") {
      trainingOverlay.style.display = "flex";
    } else {
      trainingOverlay.style.display = "none";
    }
  }

  // Update Combat Overlay visibility
  const combatOverlay = document.getElementById("combat-overlay");
  if (combatOverlay) {
    if (state.gameState === "submenu" && (menuContext.type === "combat_spell" || menuContext.type === "combat_item")) {
      combatOverlay.style.display = "flex";
      renderCombatOverlay();
    } else {
      combatOverlay.style.display = "none";
    }
  }
  
  // Update Equip Overlay visibility
  const equipOverlay = document.getElementById("equip-overlay");
  if (equipOverlay) {
    if (state.gameState === "equip_overlay") {
      equipOverlay.style.display = "flex";
      renderEquip();
    } else {
      equipOverlay.style.display = "none";
    }
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
    const rowLabel = idx < 2 ? "[前]" : "[後]";
    const rowColor = idx < 2 ? "var(--neon-cyan)" : "var(--neon-gold)";
    header.innerHTML = `<span class="char-name">${char.name} <span style="font-size: 10px; color: ${rowColor}; font-weight: normal; margin-left: 4px;">${rowLabel}</span></span><span class="char-class">Lv.${char.level} ${char.class[0]}</span>`;
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
    
    // MP Bar (always rendered to align layouts, hidden for non-spellcasters)
    const spellcaster = isSpellcaster(char);
    const mpPct = (spellcaster && char.maxMp > 0) ? (char.mp / char.maxMp) * 100 : 0;
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

export function updateCombatPrompt() {
  const prompt = document.getElementById("combat-prompt");
  if (!state.combatState) return;

  const livingChars = state.party.map((c, i) => ({ c, i })).filter(x => ["ok", "poisoned", "blind"].includes(x.c.status));
  const currentSelect = livingChars[combatSelection.charIdx];
  if (state.combatState.phase === "resolving") {
    prompt.textContent = "ターン解決中...";
  } else if (currentSelect) {
    const classJp = getClassJpName(currentSelect.c.class);
    prompt.textContent = `${currentSelect.c.name} (${classJp}) の行動を選択：`;
  } else {
    prompt.textContent = "ターン解決中...";
  }
}
