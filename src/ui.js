import { state, getCharWeaponAtk, getCharDef, saveAutosave, createDefaultCodex } from "./state.js";
import { DIR_NAMES, getClassJpName, isSpellcaster, getCharMaxHp, getCharMaxMp, getItemData, MONSTERS, ITEMS } from "./data.js";
import { isMuted } from "./audio.js";
import { menuContext, renderEquip, renderSpellOverlay, renderCampOverlay, openEquipOverlay, openShopAppraise } from "./menu.js";
import { combatSelection, renderCombatOverlay } from "./combat.js";
import { enterDungeon } from "./movement.js";

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
    // Keep PWA gameplay locked to device scale; repeated taps can otherwise trigger iOS zoom.
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover');
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
  
  const resultOverlay = document.getElementById("result-overlay");
  if (resultOverlay) {
    if (state.gameState === "result") {
      resultOverlay.style.display = "flex";
      renderResultScreen();
    } else {
      resultOverlay.style.display = "none";
    }
  }

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
    goalBanner.innerHTML = "";
    const goalRow = document.createElement("div");
    goalRow.className = "goal-row";
    
    const goalText = document.createElement("span");
    if (state.gameState === "gameover") {
      goalText.textContent = "🎯 目標: 全滅した。セーブから再開するか、最初からやり直せ";
    } else if (state.gameState === "victory") {
      goalText.textContent = "🎯 目標: おめでとう！ゲームクリア！";
    } else if (state.gameState === "town") {
      goalText.textContent = `🎯 目標: ${getCurrentGoal()}`;
    } else {
      goalText.textContent = `🎯 目標: ${getCurrentGoal()}`;
    }
    goalRow.appendChild(goalText);

    if (state.gameState !== "gameover" && state.gameState !== "victory" && state.gameState !== "town") {
      const expRate = getFloorExplorationRate();
      const chestsOpened = state.floorChestsOpened ? (state.floorChestsOpened[state.floor - 1] ?? 0) : 0;
      const chestsTotal = state.floorChestsTotal ? (state.floorChestsTotal[state.floor - 1] ?? 0) : 0;
      
      const statsContainer = document.createElement("span");
      statsContainer.className = "goal-stats-container";
      statsContainer.innerHTML = `<span>🗺️ 探索率: ${expRate}%</span> <span>📦 宝箱: ${chestsOpened}/${chestsTotal}</span>`;
      goalRow.appendChild(statsContainer);
    }
    goalBanner.appendChild(goalRow);
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

  // Update Spell Overlay visibility
  const spellOverlay = document.getElementById("spell-overlay");
  if (spellOverlay) {
    if (state.gameState === "submenu" && (menuContext.type === "spell_caster_select" || menuContext.type === "spell_select" || menuContext.type === "spell_target_ally")) {
      spellOverlay.style.display = "flex";
      renderSpellOverlay();
    } else {
      spellOverlay.style.display = "none";
    }
  }

  // Update Camp Overlay visibility
  const campOverlay = document.getElementById("camp-overlay");
  if (campOverlay) {
    if (state.gameState === "submenu" && (menuContext.type === "camp_main" || menuContext.type === "camp" || menuContext.type === "camp_status")) {
      campOverlay.style.display = "flex";
      renderCampOverlay();
    } else {
      campOverlay.style.display = "none";
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

  // Update Viewport accessibility Text HUD
  updateViewportHUD();
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
    header.innerHTML = `<span class="char-name">${char.name} <span style="font-size: 8px; color: ${rowColor}; font-weight: normal; margin-left: 2px;">${rowLabel}</span></span><span class="char-class">${char.class[0]}.${char.level}</span>`;
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

export function updateViewportHUD() {
  const hud = document.getElementById("viewport-hud");
  if (!hud) return;

  if (state.gameState !== "explore" && state.gameState !== "combat") {
    hud.style.display = "none";
    return;
  }
  hud.style.display = "flex";

  const map = state.map;
  if (!map) return;
  const cell = map[state.y]?.[state.x];
  if (!cell) return;

  // Directions: 0:N, 1:E, 2:S, 3:W
  const DIR_LABELS = ["北", "東", "南", "西"];
  const dirLabel = DIR_LABELS[state.dir];

  const hasWallFront = cell.walls[state.dir];
  const hasWallRight = cell.walls[(state.dir + 1) % 4];
  const hasWallBack = cell.walls[(state.dir + 2) % 4];
  const hasWallLeft = cell.walls[(state.dir + 3) % 4];

  const frontText = hasWallFront ? "壁" : "通路";
  const rightText = hasWallRight ? "壁" : "通路";
  const leftText = hasWallLeft ? "壁" : "通路";
  const backText = hasWallBack ? "壁" : "通路";

  const isDumapic = state.dumapicTurns > 0;
  if (isDumapic) {
    hud.innerHTML = `
      <div class="hud-dir dumapic-active">【DUMAPIC座標検知中】地下${state.floor}階 X:${state.x} Y:${state.y} (${dirLabel})</div>
      <div class="hud-surround">前:${frontText} | 右:${rightText} | 左:${leftText} | 後:${backText}</div>
    `;
  } else {
    hud.innerHTML = `
      <div class="hud-dir">方角: ${dirLabel}</div>
      <div class="hud-surround">前:${frontText} | 右:${rightText} | 左:${leftText} | 後:${backText}</div>
    `;
  }
}

export function renderResultScreen() {
  const overlay = document.getElementById("result-overlay");
  if (!overlay || !state.currentRun) return;

  const run = state.currentRun;
  const isSuccess = run.returnReason !== "gameover";
  const titleText = isSuccess ? "探索結果 (無事帰還)" : "探索失敗 (全滅)";
  const headerClass = isSuccess ? "success" : "failed";

  const itemsCount = run.itemsFound.length;
  const equipCount = run.equipmentFound.length;
  const totalLootCount = itemsCount + equipCount;

  const getReasonJp = (r) => {
    if (r === "stairs") return "迷宮の階段から帰還";
    if (r === "escape_scroll") return "帰還のスクロール";
    if (r === "gameover") return "魔物に敗北（全滅）";
    return r || "不明";
  };

  let lootHtml = "";
  if (totalLootCount === 0) {
    lootHtml = `<div style="font-size: 10px; color: var(--text-muted); text-align: center; padding: 6px;">獲得品なし</div>`;
  } else {
    run.itemsFound.forEach(itemKey => {
      const item = getItemData(itemKey);
      lootHtml += `
        <div class="result-item-entry">
          <span>📦 ${item.name}</span>
          <span class="result-item-rarity common">コモン</span>
        </div>
      `;
    });
    run.equipmentFound.forEach(equip => {
      const item = getItemData(equip);
      const rarityLabel = (item.rarity || "common").toUpperCase();
      const rarityClass = item.rarity || "common";
      lootHtml += `
        <div class="result-item-entry">
          <span>🛡️ ${item.name}</span>
          <span class="result-item-rarity ${rarityClass}">${rarityLabel}</span>
        </div>
      `;
    });
  }

  let historyHtml = "";
  if (state.runHistory && state.runHistory.length > 0) {
    state.runHistory.slice(0, 5).forEach((h, i) => {
      const dateStr = new Date(h.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
      const resText = h.result === "returned" ? "成功" : "失敗";
      const resColor = h.result === "returned" ? "var(--neon-green)" : "var(--neon-red)";
      historyHtml += `
        <div class="result-history-entry">
          <span>#${i+1} [${dateStr}] B${h.deepestFloor}F / 撃破:${h.kills} / 宝箱:${h.chestsOpened}</span>
          <span style="color: ${resColor}; font-weight: bold;">${resText} (Rank:${h.dangerRank})</span>
        </div>
      `;
    });
  } else {
    historyHtml = `<div style="font-size: 8px; color: var(--text-muted); text-align: center;">履歴はありません</div>`;
  }

  overlay.innerHTML = `
    <div class="result-header ${headerClass}">
      <div class="result-title">${titleText}</div>
      <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">帰還理由: ${getReasonJp(run.returnReason)}</div>
    </div>
    <div class="result-body">
      <div class="result-summary-section">
        <div class="result-summary-item">
          <span class="result-summary-label">到達階層</span>
          <span class="result-summary-val" style="color: var(--neon-cyan);">B${run.deepestFloor}F</span>
        </div>
        <div class="result-danger-rank-container">
          <span class="result-summary-label">危険度評価</span>
          <span class="result-danger-rank-val rank-${run.dangerRank.toLowerCase()}">${run.dangerRank}</span>
          <span class="result-danger-label rank-${run.dangerRank.toLowerCase()}">${run.dangerLabel}</span>
        </div>
        <div class="result-summary-item">
          <span class="result-summary-label">獲得GOLD</span>
          <span class="result-summary-val" style="color: var(--neon-gold);">${isSuccess ? run.goldGained : 0} G</span>
        </div>
      </div>

      <div class="result-details-section">
        <div class="result-detail-row">
          <span>探索歩数:</span>
          <span class="result-detail-val">${run.steps} 歩</span>
        </div>
        <div class="result-detail-row">
          <span>戦闘回数 / 総撃破数:</span>
          <span class="result-detail-val">${run.battles} 回 / ${run.kills} 匹</span>
        </div>
        <div class="result-detail-row">
          <span>宝箱開封 / 罠解除:</span>
          <span class="result-detail-val">${run.chestsOpened} 個 / ${run.trapsDisarmed} 回</span>
        </div>
        <div class="result-detail-row">
          <span>罠被弾数:</span>
          <span class="result-detail-val" style="color: ${run.trapsTriggered > 0 ? "var(--neon-red)" : "inherit"};">${run.trapsTriggered} 回</span>
        </div>
        <div class="result-detail-row">
          <span>獲得EXP (各自):</span>
          <span class="result-detail-val" style="color: var(--neon-green);">${run.expGained} EXP</span>
        </div>
      </div>

      <div class="result-eval-section ${headerClass}">
        <div class="result-eval-title">今回の冒険評価</div>
        <div>${getEvaluationText(run, isSuccess)}</div>
      </div>

      <div class="result-items-section">
        <div class="result-section-title">📦 持ち帰り品 (${totalLootCount}個)</div>
        <div class="result-items-list">
          ${lootHtml}
        </div>
      </div>

      <div class="result-history-section">
        <div class="result-section-title" style="font-size: 10px; color: var(--neon-cyan); text-shadow: var(--neon-glow-cyan);">📜 最近の探索履歴</div>
        <div class="result-history-list">
          ${historyHtml}
        </div>
      </div>

      <div class="result-footer-actions">
        ${isSuccess && equipCount > 0 ? `<button id="btn-result-appraise" class="btn btn-neon btn-block">ボルタック商店で未鑑定品を鑑定する</button>` : ""}
        <button id="btn-result-equip" class="btn btn-neon btn-block">装備を変更・整理する</button>
        <button id="btn-result-dungeon" class="btn btn-neon btn-block" style="border-color: var(--neon-cyan); color: var(--neon-cyan);">もう一度迷宮に入る</button>
        <button id="btn-result-town" class="btn btn-neon btn-block" style="border-color: var(--neon-gold); color: var(--neon-gold);">街（リルガミン）へ戻る</button>
      </div>
    </div>
  `;

  const btnAppraise = document.getElementById("btn-result-appraise");
  if (btnAppraise) {
    btnAppraise.addEventListener("click", () => {
      overlay.style.display = "none";
      openShopAppraise();
    });
  }



  const btnEquip = document.getElementById("btn-result-equip");
  if (btnEquip) {
    btnEquip.addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      openEquipOverlay(0);
    });
  }

  const btnDungeon = document.getElementById("btn-result-dungeon");
  if (btnDungeon) {
    btnDungeon.addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      enterDungeon();
    });
  }

  const btnTown = document.getElementById("btn-result-town");
  if (btnTown) {
    btnTown.addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      saveAutosave();
      updateUI();
    });
  }
}

// Archives state and UI rendering
const archivesState = {
  tab: "monsters",
  selectedId: null
};

function getMonsterCodexDetailHtml(m, record) {
  const enc = record ? record.encountered : 0;
  const kil = record ? record.killed : 0;
  
  if (enc === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">遭遇したことがありません</div>`;
  }
  
  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${m.name}</span>
      <span class="codex-meta">遭遇: ${enc} / 撃破: ${kil}</span>
    </div>
    <div class="codex-detail-body">
      <p><strong>主な出現階層:</strong> B${m.level}F 階付近</p>
  `;
  
  if (kil >= 1) {
    html += `
      <p><strong>特徴:</strong> ${m.isPoisonous ? "毒攻撃を放つ" : m.isRare ? (m.name === "メタルパピー" ? "希少な魔物" : "非常に強力な強敵") : "標準的なモンスター"}</p>
      <p><strong>獲得報酬目安:</strong> ${m.exp} EXP / ${m.gold} GOLD</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[撃破すると特徴と報酬が解放されます]</p>`;
  }
  
  if (kil >= 3) {
    html += `
      <p><strong>能力値:</strong> HP: ${m.hp} | 攻撃力: ${m.atk} | 防御力: ${m.def}</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[3回撃破すると能力値が解放されます]</p>`;
  }
  
  if (kil >= 5) {
    const resistJp = m.resistances && m.resistances.length > 0 ? m.resistances.join(", ") : "特になし";
    const spellsJp = m.spells && m.spells.length > 0 ? m.spells.join(", ") : "唱えられない";
    html += `
      <p><strong>耐性・弱点:</strong> ${resistJp}</p>
      <p><strong>使用呪文:</strong> ${spellsJp}</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[5回撃破すると耐性と呪文が解放されます]</p>`;
  }
  
  if (kil >= 10) {
    let note = "特になし";
    if (m.name.includes("ワーウルフ")) {
      note = "毒攻撃の被弾率が高いため、毒耐性を持つ前衛を編成するか解毒薬（アンチドート・ラツモフィス）を多めに準備せよ。";
    } else if (m.name.includes("デーモンガード")) {
      note = "非常に堅い鎧をまとっている。打撃武器より、侍のカタナや魔術師の強力な攻撃呪文（ラハリト、マハリト）で一掃せよ。";
    } else if (m.name.includes("いにしえの竜")) {
      note = "全階層中最強のブレス攻撃を放つ。レベル10以上の十分に育成された僧侶による回復呪文（ダイヤルマ、カドルト）を切らさずに戦え。";
    } else {
      note = `B${m.level}Fに広く出現する魔物。十分な装備の補正値があれば安全に討伐可能。`;
    }
    
    html += `
      <p style="border-top: 1px dashed #333; margin-top: 6px; padding-top: 6px; color: var(--neon-yellow);">
        <strong>攻略メモ:</strong> ${note}
      </p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[10回撃破すると攻略メモが解放されます]</p>`;
  }
  
  html += `</div></div>`;
  return html;
}

function getEquipmentCodexDetailHtml(itemKey, record) {
  const item = ITEMS[itemKey];
  if (!record) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">入手したことがありません</div>`;
  }
  
  let html = `<div class="codex-detail">`;
  html += `
    <div class="codex-detail-header">
      <span class="codex-detail-name">${item.name}</span>
      <span class="codex-meta">入手回数: ${record.foundCount} 回</span>
    </div>
    <div class="codex-detail-body">
      <p><strong>種別:</strong> ${item.type === "weapon" ? "武器" : item.type === "shield" ? "盾" : "防具"}</p>
      <p><strong>最高レアリティ:</strong> <span class="${record.highestRarity}">${record.highestRarity.toUpperCase()}</span></p>
      <p><strong>最高補正値:</strong> +${record.bestBonus}</p>
      <p><strong>発見済み特性 (Affixes):</strong> ${record.affixesSeen.length > 0 ? record.affixesSeen.map(a => {
        if (a === "atk") return "攻撃力+";
        if (a === "def") return "防御力+";
        if (a === "agi") return "素早さ+";
        if (a === "trapBonus") return "罠解除+";
        return a;
      }).join(", ") : "なし"}</p>
      <p><strong>初発見階層:</strong> ${record.firstFoundAt || "不明"}</p>
    </div>
  </div>`;
  return html;
}

function getEventsCodexHtml() {
  const ev = state.codex?.events || createDefaultCodex().events;
  
  let html = `<div style="display: flex; flex-direction: column; gap: 8px; font-family: var(--font-mono); font-size: 11px;">`;
  
  // 罠セクション
  html += `<div><div class="archives-section-title">⚠️ 罠の遭遇記録</div>`;
  const trapKeys = Object.keys(ev.traps || {});
  trapKeys.forEach(k => {
    const record = ev.traps[k];
    const nameJp = k === "poison needle" ? "毒針" :
                   k === "gas bomb" ? "ガス爆弾" :
                   k === "teleporter" ? "テレポーター" :
                   k === "flash bomb" ? "閃光弾" : k;
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; padding: 6px; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span><strong>${nameJp}</strong> (初発見: B${record.firstFloor}F)</span>
        <span>解除: ${record.disarmed} 回 / 被弾: ${record.triggered} 回</span>
      </div>
    `;
  });
  html += `</div>`;
  
  // 施設セクション
  html += `<div><div class="archives-section-title">🏛️ 施設・イベント発見</div>`;
  const fac = ev.facilities || {};
  const spring = fac.spring || { found: 0, used: 0 };
  const merchant = fac.merchant || { found: 0, purchased: 0 };
  const tablet = fac.tablet || { found: 0, read: 0 };
  const chest = fac.chest || { found: 0, opened: 0 };
  
  html += `
    <div style="background-color: #1a1a24; border: 1px solid #333; padding: 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between;">
        <span>⛲ 神秘の泉</span>
        <span>発見: ${spring.found} 回 / 使用: ${spring.used} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>👤 さまよう商人</span>
        <span>発見: ${merchant.found} 回 / 購入: ${merchant.purchased} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>🪦 古代の石碑</span>
        <span>発見: ${tablet.found} 回 / 解読: ${tablet.read} 回</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>📦 宝箱</span>
        <span>発見: ${chest.found} 回 / 開封: ${chest.opened} 回</span>
      </div>
    </div>
  `;
  html += `</div>`;
  
  // スタッツセクション
  const stats = state.codex?.stats || { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
  html += `<div><div class="archives-section-title">📊 累計スタッツ</div>`;
  html += `
    <div style="background-color: #14141a; border: 1px solid var(--neon-cyan); border-radius: 4px; padding: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
      <div>探索回数: <strong style="color: var(--neon-cyan);">${stats.totalRuns}</strong> 回</div>
      <div>全滅死亡: <strong style="color: var(--neon-red);">${stats.totalDeaths}</strong> 回</div>
      <div>最深到達: <strong style="color: var(--neon-cyan);">B${stats.deepestFloor}F</strong></div>
      <div>累計撃破: <strong style="color: var(--neon-green);">${stats.totalKills}</strong> 匹</div>
      <div style="grid-column: span 2;">宝箱開封: <strong style="color: var(--neon-yellow);">${stats.totalChests}</strong> 個</div>
    </div>
  `;
  html += `</div>`;
  
  html += `</div>`;
  return html;
}

function getRunHistoryHtml() {
  if (!state.runHistory || state.runHistory.length === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">探索履歴はありません</div>`;
  }
  
  let html = `<div style="display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 11px;">`;
  state.runHistory.forEach((h, i) => {
    const dateStr = new Date(h.endedAt).toLocaleDateString("ja-JP") + " " + new Date(h.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
    const resText = h.result === "returned" ? "成功" : "失敗";
    const resColor = h.result === "returned" ? "var(--neon-green)" : "var(--neon-red)";
    
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; border-radius: 4px; padding: 6px 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 4px;">
          <strong>#${state.runHistory.length - i} [${dateStr}]</strong>
          <span style="color: ${resColor}; font-weight: bold;">${resText} (Rank: ${h.dangerRank})</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; color: #ddd; font-size: 10px;">
          <div>到達階: B${h.deepestFloor}F</div>
          <div>撃破数: ${h.kills} 匹</div>
          <div>宝箱開封: ${h.chestsOpened} 個</div>
          <div>獲得金: ${h.goldGained} G</div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

function getDeathLogsHtml() {
  if (!state.deathLogs || state.deathLogs.length === 0) {
    return `<div style="text-align: center; padding: 20px; color: var(--text-muted);">死亡記録はありません</div>`;
  }
  
  let html = `<div style="display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 11px;">`;
  state.deathLogs.forEach((d, i) => {
    const dateStr = new Date(d.endedAt).toLocaleDateString("ja-JP") + " " + new Date(d.endedAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
    const lostItemsText = d.lostItems && d.lostItems.length > 0 ? d.lostItems.join(", ") : "なし";
    
    html += `
      <div style="background-color: #1a1a24; border: 1px solid #333; border-radius: 4px; padding: 6px 8px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 2px; margin-bottom: 4px; color: var(--neon-red);">
          <strong>☠️ 死亡記録 #${state.deathLogs.length - i}</strong>
          <span>B${d.floor}F (${d.x}, ${d.y})</span>
        </div>
        <div style="color: #ddd; font-size: 10px; display: flex; flex-direction: column; gap: 2px;">
          <div><strong>日時:</strong> ${dateStr}</div>
          <div><strong>死因:</strong> ${d.cause}</div>
          <div><strong>平均Lv:</strong> ${d.partyLevelAvg} | 撃破数: ${d.kills}</div>
          <div style="color: var(--neon-yellow); white-space: normal; word-break: break-all;"><strong>紛失戦利品:</strong> ${lostItemsText}</div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  return html;
}

export function openArchivesOverlay() {
  archivesState.tab = "monsters";
  archivesState.selectedId = null;
  
  const overlay = document.getElementById("archives-overlay");
  overlay.style.display = "flex";
  
  renderArchives();
}

export function renderArchives() {
  const overlay = document.getElementById("archives-overlay");
  if (!overlay) return;
  
  overlay.innerHTML = "";
  
  // 1. Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("span");
  title.className = "archives-title";
  title.textContent = "古城年代記・書庫";
  header.appendChild(title);
  
  overlay.appendChild(header);
  
  // 3. Body
  const body = document.createElement("div");
  body.className = "archives-body";
  
  if (archivesState.tab === "monsters") {
    // Monsters Codex Grid
    if (archivesState.selectedId) {
      // Show Detail View
      const monsterName = archivesState.selectedId;
      const m = MONSTERS.find(x => x.name === monsterName);
      const record = state.codex?.monsters?.[monsterName];
      
      const detailHtml = getMonsterCodexDetailHtml(m, record);
      const detailContainer = document.createElement("div");
      detailContainer.innerHTML = detailHtml;
      
      const btnBack = document.createElement("button");
      btnBack.className = "btn btn-neon btn-block";
      btnBack.textContent = "一覧に戻る";
      btnBack.style.marginTop = "8px";
      btnBack.addEventListener("click", () => {
        archivesState.selectedId = null;
        renderArchives();
      });
      detailContainer.appendChild(btnBack);
      body.appendChild(detailContainer);
    } else {
      // List View
      const grid = document.createElement("div");
      grid.className = "codex-grid";
      
      MONSTERS.forEach(m => {
        if (m.name === "いにしえの竜" && (!state.codex?.monsters?.["いにしえの竜"] || state.codex?.monsters?.["いにしえの竜"].encountered === 0)) {
          // Hide boss until encountered
          return;
        }
        if (m.name === "デーモンガード" && (!state.codex?.monsters?.["デーモンガード"] || state.codex?.monsters?.["デーモンガード"].encountered === 0)) {
          return;
        }
        
        const record = state.codex?.monsters?.[m.name];
        const isDiscovered = record && record.encountered > 0;
        
        const row = document.createElement("div");
        row.className = "codex-row";
        
        if (!isDiscovered) {
          row.innerHTML = `
            <span class="codex-name" style="color: var(--text-muted);">？？？</span>
            <span class="codex-meta">未遭遇</span>
          `;
        } else {
          row.innerHTML = `
            <span class="codex-name">${m.name}</span>
            <span class="codex-meta">撃破: ${record.killed}</span>
          `;
          row.addEventListener("click", () => {
            archivesState.selectedId = m.name;
            renderArchives();
          });
        }
        grid.appendChild(row);
      });
      body.appendChild(grid);
    }
  } else if (archivesState.tab === "equipment") {
    // Equipment Codex Grid
    if (archivesState.selectedId) {
      const baseId = archivesState.selectedId;
      const record = state.codex?.equipment?.[baseId];
      
      const detailHtml = getEquipmentCodexDetailHtml(baseId, record);
      const detailContainer = document.createElement("div");
      detailContainer.innerHTML = detailHtml;
      
      const btnBack = document.createElement("button");
      btnBack.className = "btn btn-neon btn-block";
      btnBack.textContent = "一覧に戻る";
      btnBack.style.marginTop = "8px";
      btnBack.addEventListener("click", () => {
        archivesState.selectedId = null;
        renderArchives();
      });
      detailContainer.appendChild(btnBack);
      body.appendChild(detailContainer);
    } else {
      // List weapons, armors, shields
      const grid = document.createElement("div");
      grid.className = "codex-grid";
      
      const equipKeys = Object.keys(ITEMS).filter(k => {
        const item = ITEMS[k];
        return item && (item.type === "weapon" || item.type === "armor" || item.type === "shield");
      });
      
      equipKeys.forEach(k => {
        const item = ITEMS[k];
        const record = state.codex?.equipment?.[k];
        const isDiscovered = record && record.foundCount > 0;
        
        const row = document.createElement("div");
        row.className = "codex-row";
        
        if (!isDiscovered) {
          row.innerHTML = `
            <span class="codex-name" style="color: var(--text-muted);">？？？</span>
            <span class="codex-meta">未発見</span>
          `;
        } else {
          row.innerHTML = `
            <span class="codex-name">${item.name}</span>
            <span class="codex-meta">入手: ${record.foundCount}回</span>
          `;
          row.addEventListener("click", () => {
            archivesState.selectedId = k;
            renderArchives();
          });
        }
        grid.appendChild(row);
      });
      body.appendChild(grid);
    }
  } else if (archivesState.tab === "events") {
    const container = document.createElement("div");
    container.innerHTML = getEventsCodexHtml();
    body.appendChild(container);
  } else if (archivesState.tab === "runHistory") {
    const container = document.createElement("div");
    container.innerHTML = getRunHistoryHtml();
    body.appendChild(container);
  } else if (archivesState.tab === "deathLogs") {
    const container = document.createElement("div");
    container.innerHTML = getDeathLogsHtml();
    body.appendChild(container);
  }
  
  overlay.appendChild(body);

  // 3. Bottom Actions Container
  const footer = document.createElement("div");
  footer.className = "bottom-actions-container";

  // Tabs Row
  const tabs = document.createElement("div");
  tabs.className = "bottom-actions-row archives-tabs";
  
  const tabList = [
    { id: "monsters", name: "👿 敵" },
    { id: "equipment", name: "🛡️ 装備" },
    { id: "events", name: "⚠️ 罠" },
    { id: "runHistory", name: "📜 記録" },
    { id: "deathLogs", name: "☠️ 死亡" }
  ];
  
  tabList.forEach(t => {
    const tabBtn = document.createElement("button");
    tabBtn.className = `archives-tab ${archivesState.tab === t.id ? "active" : ""}`;
    tabBtn.textContent = t.name;
    tabBtn.addEventListener("click", () => {
      archivesState.tab = t.id;
      archivesState.selectedId = null;
      renderArchives();
    });
    tabs.appendChild(tabBtn);
  });
  footer.appendChild(tabs);

  // Close Row
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.className = "btn btn-danger btn-camp-close";
  btnClose.textContent = "❌ 閉じる";
  btnClose.style.width = "100%";
  btnClose.style.minHeight = "44px";
  btnClose.addEventListener("click", () => {
    overlay.style.display = "none";
    state.gameState = "town";
    updateUI();
  });
  closeRow.appendChild(btnClose);
  footer.appendChild(closeRow);

  overlay.appendChild(footer);
}

function getEvaluationText(run, isSuccess) {
  if (!run) return "";
  if (!isSuccess) {
    return "無念…！迷宮の暗闇に呑まれ、探索は失敗した。全滅により獲得ゴールドが失われ、未鑑定装備の一部が紛失した。今回の教訓を胸に、次の冒険に備えよう。";
  }
  
  let lines = [];
  if (run.deepestFloor >= 4) {
    lines.push(`B${run.deepestFloor}Fの深部まで到達し、見事な生還を遂げた。`);
  } else {
    lines.push(`B${run.deepestFloor}Fまで到達し、無事帰還した。`);
  }
  
  if (run.chestsOpened >= 5) {
    lines.push("多くの宝箱を回収し、大きな戦利品を得た。");
  } else if (run.chestsOpened >= 2) {
    lines.push("いくつかの宝箱を回収し、まずまずの成果を収めた。");
  }
  
  if (run.trapsTriggered === 0 && run.chestsOpened > 0) {
    lines.push("罠被害は皆無であり、極めて慎重かつ優秀な探索だ。");
  } else if (run.trapsTriggered > 0) {
    lines.push("罠に被弾する場面もあったが、致命傷は避けた。");
  }
  
  if (run.kills >= 20) {
    lines.push("行く手を阻む魔物たちを数多く撃破し、その武勇を示した。");
  }

  if (lines.length === 0) {
    return "安全を最優先にし、無理のない探索を行った。";
  }
  return lines.join(" ");
}
