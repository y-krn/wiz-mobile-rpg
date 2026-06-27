import { state, saveGame, saveAutosave, createDefaultCodex, addLog } from "./state.js";
import { DIR_NAMES, getClassJpName, isSpellcaster, getCharMaxHp, getCharMaxMp, getItemData, MONSTERS, ITEMS } from "./data.js";
import { getIsMuted, playSound } from "./audio.js";
import { getMonsterContractInfo } from "./contracts.js";
import { menuContext, openSubmenu } from "./navigation.js";
import { renderEquip } from "./equip.js";
import { renderSpellOverlay } from "./spell_menu.js";
import { renderCampOverlay } from "./camp.js";
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
    // Keep PWA gameplay locked to device scale; repeated taps can otherwise trigger iOS zoom.
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover');
  }
}

export function getCurrentGoal() {
  if (state.activeContract) {
    const contract = state.activeContract;
    let progressText = "";
    if (contract.type === "kill") {
      progressText = `(${contract.targetMonsterName} 討伐: ${contract.currentValue || 0}/${contract.targetValue})`;
    } else if (contract.type === "chest") {
      progressText = `(宝箱: ${state.currentRun ? (state.currentRun.chestsOpened || 0) : 0}/${contract.targetValue})`;
    } else if (contract.type === "recovery") {
      const currentUnid = state.inventory.filter(item => typeof item === "object" && !item.identified).length;
      progressText = `(未鑑定品: ${currentUnid}/${contract.targetValue})`;
    } else if (contract.type === "reach" || contract.type === "weekly" || contract.type === "limit") {
      progressText = `(到達目標: B${contract.targetValue}F)`;
    }
    return `探索契約「${contract.name}」進行中 ${progressText}`;
  }

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
    const lightLabel = state.lightPower === "lomilwa" ? "LOMILWA" : "LIGHT";
    const lightText = state.lightTurns > 0 ? ` (${lightLabel}:${state.lightTurns})` : "";
    const repelText = state.repelTurns > 0 ? ` (REPEL:${state.repelTurns})` : "";
    const dumapicText = state.dumapicTurns > 0 ? ` (DUMAPIC:${state.dumapicTurns})` : "";
    locLabel.textContent = `DUNGEON B${state.floor}F X:${state.x} Y:${state.y}${lightText}${repelText}${dumapicText}`;
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
    if (getIsMuted()) {
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

  const controlsPanel = document.getElementById("controls-panel");
  if (controlsPanel) {
    controlsPanel.classList.toggle("explore-mode", state.gameState === "explore");
  }

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
          autoBtn.textContent = "停止";
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
  if (controlsPanel) {
    if (state.transitioning) {
      controlsPanel.style.pointerEvents = "none";
      controlsPanel.style.opacity = "0.6";
    } else {
      controlsPanel.style.pointerEvents = "auto";
      controlsPanel.style.opacity = "1";
    }
  }

  // Update Party HUD & Header visibility in town mode
  const partyHeader = document.getElementById("party-hud-header");
  const partyPanel = document.getElementById("party-panel");
  if (partyHeader && partyPanel) {
    if (state.gameState === "town") {
      partyHeader.style.display = "flex";
      partyPanel.style.height = "92px";
      partyPanel.style.minHeight = "92px";
      partyPanel.classList.add("interactive-hud");
      partyHeader.onclick = () => {
        menuContext.actorIdx = 0;
        openSubmenu("camp_status", "パーティの強さ");
      };
    } else {
      partyHeader.style.display = "none";
      partyPanel.style.height = "75px";
      partyPanel.style.minHeight = "75px";
      partyPanel.classList.remove("interactive-hud");
      partyHeader.onclick = null;
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

  const isDumapic = state.dumapicTurns > 0;
  if (isDumapic) {
    hud.innerHTML = `
      <div class="hud-dir dumapic-active">【DUMAPIC座標検知中】地下${state.floor}階 X:${state.x} Y:${state.y} (${dirLabel})</div>
      ${state.dumapicHint ? `<div class="hud-dir dumapic-active">${state.dumapicHint}</div>` : ""}
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

export function renderResultScreen() {
  const overlay = document.getElementById("result-overlay");
  if (!overlay || !state.currentRun) return;

  const run = state.currentRun;
  const isSuccess = run.returnReason !== "gameover";
  const titleText = isSuccess ? "探索結果 (無事帰還)" : "探索失敗 (全滅)";
  const headerClass = isSuccess ? "success" : "failed";

  const itemsCount = run.itemsFound.length;
  const equipCount = run.equipmentFound.length;
  const unidentifiedCount = (run.equipmentFound || []).filter(eq => typeof eq === "object" && !eq.identified).length;
  const totalLootCount = itemsCount + equipCount;
  const lootTitle = isSuccess ? `持ち帰り品 (${totalLootCount}個)` : `失った発見品 (${totalLootCount}個)`;

  const getReasonJp = (r) => {
    if (r === "stairs") return "迷宮の階段からお城へ帰還";
    if (r === "escape_scroll") return "帰還のスクロールでお城へ帰還";
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
      const isUnidentified = !equip.identified;
      const tagHtml = isUnidentified ? `<span class="unidentified-tag">【未鑑定】</span>` : "";
      lootHtml += `
        <div class="result-item-entry">
          <span>🛡️ ${tagHtml}${item.name}</span>
          <span class="result-item-rarity ${rarityClass}">${rarityLabel}</span>
        </div>
      `;
    });
  }

  let featuredLootHtml = "";
  const unidentifiedEquip = (run.equipmentFound || []).filter(eq => !eq.identified);
  if (unidentifiedEquip.length > 0) {
    const rarityWeight = { epic: 3, rare: 2, magic: 1 };
    const sortedLoot = [...unidentifiedEquip].sort((a, b) => {
      return (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0);
    });
    const displayedLoot = sortedLoot.slice(0, 3);
    const lootListHtml = displayedLoot.map(eq => {
      const eqData = getItemData(eq);
      const color = eq.rarity === "epic" ? "var(--neon-purple)" :
                    eq.rarity === "rare" ? "var(--neon-gold)" :
                    "var(--neon-cyan)";
      
      let hintText = "";
      if (!eq.identified && eq.affixes && eq.affixes.length > 0) {
        const hintLabels = {
          followUp: "連撃",
          arcane: "秘術",
          devotion: "神聖",
          guardian: "守護",
          treasureSense: "宝探",
          trapBonus: "技巧",
          antiUndead: "不死祓い",
          antiDragon: "竜殺し",
          spellGuard: "魔除け",
          poisonWard: "毒避け",
          firstStrike: "先制"
        };
        const hintAff = eq.affixes.find(aff => hintLabels[aff.type]);
        if (hintAff) {
          hintText = `<div style="font-size: 8px; color: var(--neon-yellow); margin-top: 1px;">気配: ${hintLabels[hintAff.type]}</div>`;
        }
      }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 11px;">
          <div>
            <span style="color: ${color}; font-weight: bold;">💎 ${eqData.name}</span>
            ${hintText}
          </div>
          <span style="font-size: 9px; color: var(--text-muted); font-family: var(--font-mono);">${eq.rarity.toUpperCase()}</span>
        </div>
      `;
    }).join("");
    
    featuredLootHtml = `
      <div class="result-eval-section" style="margin-top: 10px; border-color: var(--neon-cyan); padding: 8px 10px; background: rgba(0, 162, 232, 0.05); text-align: left;">
        <div class="result-eval-title" style="color: var(--neon-cyan); font-size: 11px; margin-bottom: 6px; border-bottom: 1px solid rgba(0, 162, 232, 0.2); padding-bottom: 2px;">🏆 今回の目玉戦利品</div>
        ${lootListHtml}
      </div>
    `;
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

  // 探索契約の判定表示HTML
  let contractHtml = "";
  if (run.contractResult) {
    const cr = run.contractResult;
    const resClass = cr.success ? "success" : "failed";
    const resTitle = cr.success ? "🎉 探索契約 達成！" : "❌ 探索契約 未達成";
    const statusColor = cr.success ? "var(--neon-green)" : "var(--neon-red)";
    
    let rewardText = "";
    if (cr.success) {
      const tickets = cr.contract.reward.identifyTickets > 0 ? ` / 鑑定割引券: ${cr.contract.reward.identifyTickets}枚` : "";
      rewardText = `獲得：${cr.contract.reward.gold} G${tickets}`;
      if (cr.itemMsg) {
        rewardText += `<br><span style="font-size: 10px; color: var(--neon-cyan);">${cr.itemMsg}</span>`;
      }
    } else {
      rewardText = cr.reason || "目標を達成できませんでした。";
    }

    contractHtml = `
      <div class="result-eval-section ${resClass}" style="margin-top: 10px; border-color: ${statusColor};">
        <div class="result-eval-title" style="color: ${statusColor};">${resTitle}</div>
        <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">契約: ${cr.contract.name}</div>
        <div style="font-size: 10px; color: var(--text-muted);">${cr.contract.description}</div>
        <div style="font-size: 11px; margin-top: 6px; border-top: 1px dashed #333; padding-top: 4px;">
          ${rewardText}
        </div>
      </div>
    `;
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
          <span class="result-summary-label">未鑑定装備</span>
          <span class="result-summary-val" style="color: var(--neon-gold);">${unidentifiedCount} 個</span>
        </div>
      </div>

      <div class="result-details-section">
        <div class="result-detail-row">
          <span>戦利品 / GOLD:</span>
          <span class="result-detail-val">${totalLootCount} 個 / ${isSuccess ? run.goldGained : 0} G</span>
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
          <span>装備候補 / 未鑑定:</span>
          <span class="result-detail-val" style="color: var(--neon-cyan);">${equipCount} 個 / ${unidentifiedCount} 個</span>
        </div>
      </div>

      <div class="result-eval-section ${headerClass}">
        <div class="result-eval-title">今回の冒険評価</div>
        <div>${getEvaluationText(run, isSuccess)}</div>
      </div>

      ${contractHtml}
      ${featuredLootHtml}

      <div class="result-items-section">
        <div class="result-section-title">📦 ${lootTitle}</div>
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
    </div>
    <div class="result-footer-actions">
      <button id="btn-result-castle" class="btn btn-neon btn-block">お城へ戻る</button>
    </div>
  `;

  const btnCastle = document.getElementById("btn-result-castle");
  if (btnCastle) {
    btnCastle.addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      state.currentRun = null;
      state.party.forEach(char => {
        if (char.status !== "dead") {
          char.hp = char.maxHp;
          char.mp = char.maxMp;
        }
      });
      addLog("おしろ：パーティは休息した。HPとMPが全回復した！（ステータス異常は教会で治療してください）");

      if (state.inventory.includes("ANTIGRAVITY_CRYSTAL")) {
        playSound("level_up");
        state.gameState = "victory";
        addLog("**************************************************");
        addLog("おめでとうございます！浮遊石を持ち帰りました！");
        addLog("王より名誉勲章が授与されました。ゲームクリアです！");
        addLog("**************************************************");
        localStorage.removeItem("mobile_wiz_rpg_save");
        localStorage.removeItem("mobile_wiz_rpg_autosave");
      } else {
        playSound("heal");
        saveGame();
        saveAutosave();
      }
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
      <p><strong>戦利品傾向:</strong> ${m.isRare ? "未鑑定装備の期待値が高い" : "通常戦利品とGOLD"} / ${m.gold} GOLD</p>
    `;
  } else {
    html += `<p style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">[撃破すると特徴と報酬が解放されます]</p>`;
  }

  // 撃破数に応じた契約連動の推奨情報表示
  const contractInfo = getMonsterContractInfo(m.name, kil);
  html += `
    <div style="border-top: 1px solid #333; border-bottom: 1px solid #333; margin: 8px 0; padding: 6px 0;">
      <p><strong>特性:</strong> ${contractInfo.features}</p>
      <p style="color: var(--neon-green);"><strong>推奨:</strong> ${contractInfo.recommended}</p>
    </div>
  `;
  
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
      note = "毒攻撃の被弾率が高いため、毒避けを持つ前衛を編成するか解毒薬（アンチドート・ラツモフィス）を多めに準備せよ。";
    } else if (m.name.includes("デーモンガード")) {
      note = "非常に堅い鎧をまとっている。打撃武器より、侍のカタナや魔術師の強力な攻撃呪文（ラハリト、マハリト）で一掃せよ。";
    } else if (m.name.includes("いにしえの竜")) {
      note = "全階層中最強のブレス攻撃を放つ。竜殺し・魔除け・守護を重ね、回復役のMP補強装備を切らさずに戦え。";
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

// Contracts state & render functions
const contractsState = {
  selectedId: null
};

export function openContractsOverlay() {
  contractsState.selectedId = null;
  const overlay = document.getElementById("contracts-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  renderContracts();
}

export function renderContracts() {
  const overlay = document.getElementById("contracts-overlay");
  if (!overlay) return;

  overlay.innerHTML = "";
  
  // Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("div");
  title.className = "archives-title";
  title.textContent = "城の探索契約書";
  header.appendChild(title);
  
  overlay.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "archives-body";
  body.style.flex = "1";
  body.style.overflowY = "auto";

  // Footer / Close Button
  const footer = document.createElement("div");
  footer.className = "archives-footer";
  footer.style.display = "flex";
  footer.style.flexDirection = "column";
  footer.style.gap = "8px";

  if (state.activeContract) {
    // Show active contract details and progress
    const contract = state.activeContract;
    const isKill = contract.type === "kill";
    const isChest = contract.type === "chest";
    const isRecovery = contract.type === "recovery";
    
    let progressText = "";
    if (isKill) {
      progressText = `討伐数: ${contract.currentValue} / ${contract.targetValue} 体`;
    } else if (isChest) {
      progressText = `宝箱開封数 (探索中): ${state.currentRun ? state.currentRun.chestsOpened : 0} / ${contract.targetValue} 個`;
    } else if (isRecovery) {
      const currentUnid = state.inventory.filter(item => typeof item === "object" && !item.identified).length;
      progressText = `所持未鑑定品: ${currentUnid} / ${contract.targetValue} 個`;
    } else if (contract.type === "reach" || contract.type === "weekly" || contract.type === "limit") {
      progressText = `最高到達階: B${state.currentRun ? state.currentRun.deepestFloor : 1}F (目標: B${contract.targetValue}F)`;
    }

    const detailDiv = document.createElement("div");
    detailDiv.className = "codex-detail";
    
    let rewardText = `ゴールド: ${contract.reward.gold} G`;
    if (contract.reward.identifyTickets > 0) {
      rewardText += ` / 鑑定割引券: ${contract.reward.identifyTickets}枚`;
    }
    if (contract.reward.item === "rare_equip") {
      rewardText += " / Rare未鑑定装備";
    } else if (contract.reward.item === "epic_equip") {
      rewardText += " / Epic未鑑定装備";
    }

    detailDiv.innerHTML = `
      <div class="codex-detail-header" style="border-bottom: 1px solid var(--neon-glow-gold);">
        <span class="codex-detail-name" style="color: var(--neon-gold);">${contract.name}</span>
        <span class="codex-meta" style="color: var(--neon-gold); border-color: var(--neon-gold);">危険度: ${contract.danger}</span>
      </div>
      <div class="codex-detail-body">
        <p style="font-size: 13px; font-weight: bold; margin-bottom: 10px;">${contract.description}</p>
        <p style="margin-top: 10px; font-size: 13px; color: var(--neon-cyan);"><strong>現在の進捗:</strong> ${progressText}</p>
        <p style="margin-top: 10px;"><strong>報酬:</strong> ${rewardText}</p>
        <p style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">※契約を完了させるには、条件を満たした状態で無事に街へ「帰還」する必要があります。全滅した場合は契約失敗となり、破棄されます。</p>
        <p style="margin-top: 10px; border-top: 1px dashed #333; padding-top: 8px;"><strong>推奨事項:</strong><br>${contract.recommended || "特になし"}</p>
      </div>
    `;

    const btnAbandon = document.createElement("button");
    btnAbandon.type = "button";
    btnAbandon.className = "btn btn-danger btn-block";
    btnAbandon.style.marginTop = "15px";
    btnAbandon.style.minHeight = "44px";
    btnAbandon.textContent = "⚠️ 契約を破棄する";
    btnAbandon.addEventListener("click", () => {
      if (confirm("本当にこの契約を破棄しますか？進捗は完全にリセットされます。")) {
        state.activeContract = null;
        import("./contracts.js").then(mod => {
          state.contracts = mod.generateContractsList(state);
          saveAutosave();
          renderContracts();
        });
      }
    });

    detailDiv.appendChild(btnAbandon);
    body.appendChild(detailDiv);

    // Footer - Close only
    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "btn btn-danger btn-camp-close";
    btnClose.textContent = "❌ 街に戻る";
    btnClose.style.width = "100%";
    btnClose.style.minHeight = "44px";
    btnClose.addEventListener("click", () => {
      overlay.style.display = "none";
      state.gameState = "town";
      updateUI();
    });
    footer.appendChild(btnClose);
  } else {
    // Show details of selected contract OR choices list (NOT BOTH in the scrollable view)
    if (contractsState.selectedId) {
      const selected = state.contracts.find(c => c.id === contractsState.selectedId);
      if (selected) {
        const detailModal = document.createElement("div");
        detailModal.className = "codex-detail";
        detailModal.style.border = "1px solid var(--border-color)";
        detailModal.style.padding = "10px";
        detailModal.style.backgroundColor = "rgba(10, 10, 15, 0.95)";

        let rewardText = `ゴールド: ${selected.reward.gold} G`;
        if (selected.reward.identifyTickets > 0) {
          rewardText += ` / 鑑定割引券: ${selected.reward.identifyTickets}枚`;
        }
        if (selected.reward.item === "rare_equip") {
          rewardText += " / Rare未鑑定装備";
        } else if (selected.reward.item === "epic_equip") {
          rewardText += " / Epic未鑑定装備";
        }

        detailModal.innerHTML = `
          <div style="font-size: 13px; font-weight: bold; color: var(--neon-gold); margin-bottom: 6px;">📝 契約詳細：${selected.name}</div>
          <p style="font-size: 12px; margin-bottom: 8px;">${selected.description}</p>
          <p style="font-size: 11px;"><strong>報酬:</strong> ${rewardText}</p>
          <p style="font-size: 11px; margin-top: 4px; color: var(--neon-cyan);"><strong>推奨準備:</strong> ${selected.recommended || "特になし"}</p>
        `;
        body.appendChild(detailModal);

        // Footer Actions - Accept on top, Back/Close on bottom row
        const btnAccept = document.createElement("button");
        btnAccept.type = "button";
        btnAccept.className = "btn btn-neon";
        btnAccept.style.width = "100%";
        btnAccept.style.minHeight = "44px";
        btnAccept.textContent = "✍️ 契約を受注する";
        btnAccept.addEventListener("click", () => {
          state.activeContract = selected;
          state.contracts = state.contracts.filter(c => c.id !== selected.id);
          addLog(`探索契約「${selected.name}」を受注しました！`);
          playSound("level_up");
          saveAutosave();
          contractsState.selectedId = null;
          
          const overlay = document.getElementById("contracts-overlay");
          if (overlay) {
            overlay.style.display = "none";
          }
          state.gameState = "town";
          updateUI();
        });
        footer.appendChild(btnAccept);

        const subActionRow = document.createElement("div");
        subActionRow.className = "bottom-actions-row";
        subActionRow.style.gap = "8px";

        const btnCancel = document.createElement("button");
        btnCancel.type = "button";
        btnCancel.className = "btn btn-neon";
        btnCancel.style.flex = "1";
        btnCancel.style.minHeight = "44px";
        btnCancel.style.borderColor = "var(--neon-gold)";
        btnCancel.style.color = "var(--neon-gold)";
        btnCancel.textContent = "◀ 一覧に戻る";
        btnCancel.addEventListener("click", () => {
          contractsState.selectedId = null;
          renderContracts();
        });

        const btnClose = document.createElement("button");
        btnClose.type = "button";
        btnClose.className = "btn btn-danger btn-camp-close";
        btnClose.textContent = "❌ 街に戻る";
        btnClose.style.flex = "1";
        btnClose.style.minHeight = "44px";
        btnClose.addEventListener("click", () => {
          overlay.style.display = "none";
          state.gameState = "town";
          updateUI();
        });

        subActionRow.appendChild(btnCancel);
        subActionRow.appendChild(btnClose);
        footer.appendChild(subActionRow);
      }
    } else {
      // Show contract choices list
      const listTitle = document.createElement("div");
      listTitle.className = "archives-section-title";
      listTitle.textContent = "受注可能な契約 (1件のみ選択可能)";
      body.appendChild(listTitle);

      const listContainer = document.createElement("div");
      listContainer.className = "codex-grid";

      state.contracts.forEach(c => {
        const row = document.createElement("div");
        row.className = "codex-row";
        row.style.borderLeft = `3px solid ${c.danger === "C" ? "var(--neon-green)" : (c.danger === "B" ? "var(--neon-gold)" : "var(--neon-red)")}`;
        row.style.minHeight = "44px"; // Ensure touch target size
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        
        row.innerHTML = `
          <div style="display: flex; flex-direction: column;">
            <span class="codex-name" style="font-weight: bold;">${c.name}</span>
            <span style="font-size: 10px; color: var(--text-muted);">${c.description}</span>
          </div>
          <span class="codex-meta" style="min-width: 50px; text-align: center;">危険度 ${c.danger}</span>
        `;

        row.addEventListener("click", () => {
          contractsState.selectedId = c.id;
          renderContracts();
        });

        listContainer.appendChild(row);
      });

      body.appendChild(listContainer);

      // Footer - Close only
      const btnClose = document.createElement("button");
      btnClose.type = "button";
      btnClose.className = "btn btn-danger btn-camp-close";
      btnClose.textContent = "❌ 街に戻る";
      btnClose.style.width = "100%";
      btnClose.style.minHeight = "44px";
      btnClose.addEventListener("click", () => {
        overlay.style.display = "none";
        state.gameState = "town";
        updateUI();
      });
      footer.appendChild(btnClose);
    }
  }

  overlay.appendChild(body);
  overlay.appendChild(footer);
}

let warehouseState = {
  selectedSource: null, // "bag" or "storage"
  selectedIndex: null   // index in the array
};

export function openWarehouseOverlay() {
  const overlay = document.getElementById("warehouse-overlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  // Reset selection state when opening warehouse
  warehouseState.selectedSource = null;
  warehouseState.selectedIndex = null;
  renderWarehouse();
}

export function renderWarehouse() {
  const overlay = document.getElementById("warehouse-overlay");
  if (!overlay) return;

  if (!state.storage) state.storage = [];
  if (!state.storageMax) state.storageMax = 30;

  overlay.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "archives-header";
  
  const title = document.createElement("div");
  title.className = "archives-title";
  title.textContent = `共有倉庫 (容量: ${state.storage.length} / ${state.storageMax})`;
  header.appendChild(title);
  
  overlay.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "archives-body";
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "15px";

  // Section 1: Bag (Inventory)
  const bagSection = document.createElement("div");
  bagSection.innerHTML = `<div class="archives-section-title">🎒 共有バッグ内のアイテム (${state.inventory.length} / 20)</div>`;
  
  const bagList = document.createElement("div");
  bagList.className = "codex-grid";
  bagList.style.maxHeight = "180px";
  bagList.style.overflowY = "auto";

  if (state.inventory.length === 0) {
    bagList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px; font-size: 11px;">バッグは空です</div>`;
  } else {
    state.inventory.forEach((itemKey, idx) => {
      const item = getItemData(itemKey);
      if (!item) return;
      
      const row = document.createElement("div");
      const isSelected = warehouseState.selectedSource === "bag" && warehouseState.selectedIndex === idx;
      row.className = `codex-row ${isSelected ? "active" : ""}`;
      row.style.padding = "8px 10px";
      row.style.cursor = "pointer";
      row.style.minHeight = "44px"; // Ensure touch target size
      row.style.display = "flex";
      row.style.alignItems = "center";
      
      const isUnidentified = typeof itemKey === "object" && !itemKey.identified;
      const unidTag = isUnidentified ? `<span style="color: var(--neon-red); font-size: 9px; border: 1px solid var(--neon-red); padding: 0 2px; margin-right: 4px; border-radius: 2px;">未鑑定</span>` : "";
      
      row.innerHTML = `
        <div style="display: flex; align-items: center; width: 100%;">
          ${unidTag}
          <span class="codex-name">${item.name}</span>
        </div>
      `;

      row.addEventListener("click", () => {
        warehouseState.selectedSource = "bag";
        warehouseState.selectedIndex = idx;
        renderWarehouse();
      });

      bagList.appendChild(row);
    });
  }
  bagSection.appendChild(bagList);
  body.appendChild(bagSection);

  // Section 2: Storage (Warehouse)
  const storageSection = document.createElement("div");
  storageSection.innerHTML = `<div class="archives-section-title">🏢 倉庫内の保管アイテム (${state.storage.length} / ${state.storageMax})</div>`;

  const storageList = document.createElement("div");
  storageList.className = "codex-grid";
  storageList.style.maxHeight = "180px";
  storageList.style.overflowY = "auto";

  if (state.storage.length === 0) {
    storageList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px; font-size: 11px;">倉庫に保管されているアイテムはありません</div>`;
  } else {
    state.storage.forEach((itemKey, idx) => {
      const item = getItemData(itemKey);
      if (!item) return;

      const row = document.createElement("div");
      const isSelected = warehouseState.selectedSource === "storage" && warehouseState.selectedIndex === idx;
      row.className = `codex-row ${isSelected ? "active" : ""}`;
      row.style.padding = "8px 10px";
      row.style.cursor = "pointer";
      row.style.minHeight = "44px"; // Ensure touch target size
      row.style.display = "flex";
      row.style.alignItems = "center";

      const isUnidentified = typeof itemKey === "object" && !itemKey.identified;
      const unidTag = isUnidentified ? `<span style="color: var(--neon-red); font-size: 9px; border: 1px solid var(--neon-red); padding: 0 2px; margin-right: 4px; border-radius: 2px;">未鑑定</span>` : "";

      row.innerHTML = `
        <div style="display: flex; align-items: center; width: 100%;">
          ${unidTag}
          <span class="codex-name">${item.name}</span>
        </div>
      `;

      row.addEventListener("click", () => {
        warehouseState.selectedSource = "storage";
        warehouseState.selectedIndex = idx;
        renderWarehouse();
      });

      storageList.appendChild(row);
    });
  }
  storageSection.appendChild(storageList);
  body.appendChild(storageSection);

  overlay.appendChild(body);

  // Footer with actions
  const footer = document.createElement("div");
  footer.className = "archives-footer";
  footer.style.display = "flex";
  footer.style.flexDirection = "column";
  footer.style.gap = "8px";

  // Selection info and main execute button
  const selectionPanel = document.createElement("div");
  selectionPanel.style.display = "flex";
  selectionPanel.style.flexDirection = "column";
  selectionPanel.style.gap = "6px";
  selectionPanel.style.border = "1px solid var(--border-color)";
  selectionPanel.style.padding = "8px";
  selectionPanel.style.backgroundColor = "rgba(10, 10, 15, 0.95)";
  selectionPanel.style.borderRadius = "4px";

  const infoLabel = document.createElement("div");
  infoLabel.style.fontSize = "12px";
  infoLabel.style.fontWeight = "bold";
  infoLabel.style.textAlign = "center";
  infoLabel.style.minHeight = "18px";

  const btnExecute = document.createElement("button");
  btnExecute.type = "button";
  btnExecute.className = "btn btn-neon";
  btnExecute.style.width = "100%";
  btnExecute.style.minHeight = "44px";

  let selectedItemName = "なし";
  if (warehouseState.selectedSource === "bag" && warehouseState.selectedIndex !== null) {
    const itemKey = state.inventory[warehouseState.selectedIndex];
    if (itemKey) {
      const item = getItemData(itemKey);
      if (item) selectedItemName = item.name;
    }
  } else if (warehouseState.selectedSource === "storage" && warehouseState.selectedIndex !== null) {
    const itemKey = state.storage[warehouseState.selectedIndex];
    if (itemKey) {
      const item = getItemData(itemKey);
      if (item) selectedItemName = item.name;
    }
  }

  infoLabel.textContent = `選択中: ${selectedItemName}`;

  if (warehouseState.selectedSource === "bag" && warehouseState.selectedIndex !== null) {
    btnExecute.textContent = "🏢 倉庫に預ける";
    btnExecute.addEventListener("click", () => {
      const idx = warehouseState.selectedIndex;
      if (state.storage.length >= state.storageMax) {
        alert("倉庫がいっぱいでこれ以上預けられません！");
        return;
      }
      const removed = state.inventory.splice(idx, 1)[0];
      state.storage.push(removed);
      playSound("gold");
      saveAutosave();
      
      // Clear selection
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    });
  } else if (warehouseState.selectedSource === "storage" && warehouseState.selectedIndex !== null) {
    btnExecute.textContent = "🎒 バッグに引き出す";
    btnExecute.addEventListener("click", () => {
      const idx = warehouseState.selectedIndex;
      if (state.inventory.length >= 20) {
        alert("バッグがいっぱいで引き出せません！");
        return;
      }
      const removed = state.storage.splice(idx, 1)[0];
      state.inventory.push(removed);
      playSound("gold");
      saveAutosave();
      
      // Clear selection
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    });
  } else {
    btnExecute.textContent = "アイテムを選択してください";
    btnExecute.disabled = true;
    btnExecute.classList.add("disabled");
  }

  selectionPanel.appendChild(infoLabel);
  selectionPanel.appendChild(btnExecute);
  footer.appendChild(selectionPanel);

  const actionRow1 = document.createElement("div");
  actionRow1.className = "bottom-actions-row";
  actionRow1.style.gap = "6px";

  // 一括預入ボタン
  const btnBatchDeposit = document.createElement("button");
  btnBatchDeposit.type = "button";
  btnBatchDeposit.className = "btn btn-neon";
  btnBatchDeposit.style.flex = "1";
  btnBatchDeposit.style.minHeight = "44px";
  btnBatchDeposit.textContent = "📦 未鑑定品一括預入";
  btnBatchDeposit.addEventListener("click", () => {
    const unids = state.inventory.filter(item => typeof item === "object" && !item.identified);
    if (unids.length === 0) {
      alert("バッグ内に未鑑定の装備がありません。");
      return;
    }
    
    let count = 0;
    for (let i = state.inventory.length - 1; i >= 0; i--) {
      const itemKey = state.inventory[i];
      if (typeof itemKey === "object" && !itemKey.identified) {
        if (state.storage.length >= state.storageMax) {
          alert("倉庫がいっぱいになりました！一部の未鑑定品は預けられませんでした。");
          break;
        }
        const removed = state.inventory.splice(i, 1)[0];
        state.storage.push(removed);
        count++;
      }
    }
    
    if (count > 0) {
      addLog(`未鑑定品を ${count} 個、倉庫に預けました。`);
      playSound("gold");
      saveAutosave();
      
      // Reset selection just in case
      warehouseState.selectedSource = null;
      warehouseState.selectedIndex = null;
      renderWarehouse();
    }
  });

  // 倉庫拡張ボタン
  const btnExpand = document.createElement("button");
  btnExpand.type = "button";
  btnExpand.className = "btn btn-neon";
  btnExpand.style.flex = "1";
  btnExpand.style.minHeight = "44px";
  btnExpand.style.borderColor = "var(--neon-cyan)";
  btnExpand.style.color = "var(--neon-cyan)";
  btnExpand.textContent = `🏢 倉庫拡張 (+5/500G)`;
  if (state.gold < 500) {
    btnExpand.disabled = true;
    btnExpand.classList.add("disabled");
  }
  btnExpand.addEventListener("click", () => {
    if (state.gold < 500) return;
    state.gold -= 500;
    state.storageMax += 5;
    addLog(`倉庫枠を拡張しました！最大枠数：${state.storageMax}`);
    playSound("level_up");
    
    const goldLabel = document.getElementById("gold-counter");
    if (goldLabel) goldLabel.textContent = `GOLD: ${state.gold}`;

    saveGame();
    saveAutosave();
    renderWarehouse();
  });

  actionRow1.appendChild(btnBatchDeposit);
  actionRow1.appendChild(btnExpand);
  footer.appendChild(actionRow1);

  // 閉じる行
  const closeRow = document.createElement("div");
  closeRow.className = "bottom-actions-row";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className = "btn btn-danger btn-camp-close";
  btnClose.textContent = "❌ 街に戻る";
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
