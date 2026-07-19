import { state } from "../state.js";
import { getIsMuted } from "../audio.js";
import { menuContext } from "../navigation.js";
import { renderEquip } from "../equip.js";
import { renderSpellOverlay } from "../spell_menu.js";
import { renderCombatOverlay, combatSelection } from "../combat.js";
import { updateSoloHUD } from "./solo_hud.js";
import { updateCombatPrompt } from "./combat_prompt.js";
import { updateViewportHUD } from "./viewport_hud.js";
import { renderResultScreen } from "./result_screen.js";
import { getFloorDisplayName, getFloorLabel, getFloorTheme } from "../data/floor_themes.js";
import { formatRunQuestProgress } from "../systems/run_quests.js";
import { updateRecordsStrip } from "./records_view.js";

let floorStingerTimer = null;
const LOG_AUTOSCROLL_THRESHOLD = 24;

function captureScrollState(element) {
  return {
    scrollTop: element.scrollTop,
    followsTail: element.scrollHeight - element.scrollTop - element.clientHeight <= LOG_AUTOSCROLL_THRESHOLD,
  };
}

function restoreScrollState(element, scrollState) {
  element.scrollTop = scrollState.followsTail ? element.scrollHeight : scrollState.scrollTop;
}

function isFocusableElement(element) {
  return element && typeof element.focus === "function";
}

function renderPreservingOverlayFocus(overlay, render) {
  const activeElement = document.activeElement;
  let focusTarget = null;

  if (isFocusableElement(activeElement) && overlay.contains(activeElement)) {
    if (activeElement.id) {
      focusTarget = { id: activeElement.id };
    } else {
      const sameTagElements = Array.from(overlay.getElementsByTagName(activeElement.tagName));
      focusTarget = {
        tagName: activeElement.tagName,
        index: sameTagElements.indexOf(activeElement),
      };
    }
  }

  render();

  if (!focusTarget) return;
  let nextActiveElement = null;
  if (focusTarget.id) {
    const element = document.getElementById(focusTarget.id);
    if (element && overlay.contains(element)) nextActiveElement = element;
  } else if (focusTarget.index >= 0) {
    nextActiveElement = overlay.getElementsByTagName(focusTarget.tagName)[focusTarget.index] || null;
  }
  if (isFocusableElement(nextActiveElement)) nextActiveElement.focus({ preventScroll: true });
}

export function showFloorEntryStinger(floor, firstVisit) {
  const stinger = document.getElementById("floor-entry-stinger");
  const theme = getFloorTheme(floor);
  if (!stinger || !theme) return;
  clearTimeout(floorStingerTimer);
  stinger.replaceChildren();
  const depth = document.createElement("span");
  depth.className = "floor-entry-depth";
  depth.textContent = `地下${floor}階`;
  const name = document.createElement("strong");
  name.className = "floor-entry-name";
  name.textContent = theme.name;
  stinger.appendChild(depth);
  stinger.appendChild(name);
  stinger.classList.toggle("first-visit", firstVisit);
  stinger.classList.add("visible");
  floorStingerTimer = setTimeout(() => stinger.classList.remove("visible"), firstVisit ? 1400 : 900);
}

// Split stored log messages (which may contain embedded newlines) into
// individual display lines, dropping empties.
function flattenLogLines(logs) {
  const lines = [];
  logs.forEach(msg => {
    msg.split("\n").forEach(line => {
      if (line) lines.push(line);
    });
  });
  return lines;
}

// Build a color-coded log entry <div> for a single line.
function createLogEntry(line) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  if (line.includes("[味方]")) {
    if (line.includes("回復") || line.includes("治") || line.includes("無事")) {
      entry.classList.add("heal");
    } else {
      entry.classList.add("ally");
    }
  } else if (line.includes("[ 敵 ]")) {
    entry.classList.add("enemy");
  } else if (line.includes("ダメージ") || line.includes("倒れた") || line.includes("失敗")) {
    entry.classList.add("damage");
  } else if (line.includes("回復") || line.includes("レベルアップ") || line.includes("強さ") || line.includes("休息")) {
    entry.classList.add("heal");
  } else if (line.includes("手に入れた") || line.includes("獲得した") || line.includes("解放した")) {
    entry.classList.add("loot");
  } else if (line.includes("唱えた") || line.includes("明かり") || line.includes("座標") || line.includes("DUMAPIC")) {
    entry.classList.add("info");
  } else if (line.includes("【気配】")) {
    entry.classList.add("aura");
  }
  entry.textContent = line;
  return entry;
}

// Render the full log history into the expand overlay.
export function renderLogOverlay() {
  const body = document.getElementById("log-overlay-body");
  if (!body) return;
  const scrollState = captureScrollState(body);
  body.replaceChildren();
  flattenLogLines(state.logs).forEach(line => {
    body.appendChild(createLogEntry(line));
  });
  restoreScrollState(body, scrollState);
}

export function openLogOverlay() {
  const overlay = document.getElementById("log-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  renderLogOverlay();
  const body = document.getElementById("log-overlay-body");
  if (body) body.scrollTop = body.scrollHeight;
}

export function closeLogOverlay() {
  const overlay = document.getElementById("log-overlay");
  if (overlay) overlay.style.display = "none";
}

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
    return "開始地点とクラスを選び、自己最深記録を更新せよ";
  }

  if (state.floor % 5 === 0 && !state.currentRun?.defeatedMilestones?.includes(state.floor)) {
    return `${getFloorDisplayName(state, state.floor)}: B${state.floor}Fの節目ボスを倒せ`;
  }
  return `${getFloorDisplayName(state, state.floor)}: ${getFloorLabel(state, state.floor + 1)}への下り階段を探せ`;
}

export function updateUI() {
  resetViewportZoom();
  updateRecordsStrip();
  const combatOverlayTypes = ["combat_target", "combat_spell", "combat_item"];
  const isCombatOverlaySubmenu = state.gameState === "submenu" && combatOverlayTypes.includes(menuContext.type);
  const eventModeSubmenus = [
    "chest_menu",
    "chest_disarmer_select",
    "chest_opener_select",
    "event_spring",
    "event_camp",
    "event_tablet",
    "event_merchant",
    "event_merchant_buy",
    "milestone_merchant",
    "milestone_portal"
  ];

  // Reset/Apply floor-theme class on #game-container
  const container = document.getElementById("game-container");
  if (container) {
    for (let i = 1; i <= 6; i++) {
      container.classList.remove(`floor-theme-b${i}`);
    }
    container.classList.toggle("result-mode", state.gameState === "result");
    container.classList.toggle("event-mode", state.gameState === "submenu" && eventModeSubmenus.includes(menuContext.type));
    if (state.currentRun &&
        state.gameState !== "town" &&
        state.gameState !== "gameover" &&
        state.gameState !== "victory" &&
        state.gameState !== "result" &&
        state.floor >= 1) {
      container.classList.add(getFloorTheme(state.floor).cssClass);
    }
  }

  // Update location label
  const locLabel = document.getElementById("location-label");
  
  const resultOverlay = document.getElementById("result-overlay");
  if (resultOverlay) {
    if (state.gameState === "result") {
      resultOverlay.style.display = "flex";
      renderPreservingOverlayFocus(resultOverlay, renderResultScreen);
    } else {
      resultOverlay.style.display = "none";
    }
  }

  if (state.gameState === "town") {
    locLabel.textContent = "TOWN OF LLYLGAMYN";
  } else if (state.gameState === "explore") {
    const themeLabel = ` / ${getFloorDisplayName(state, state.floor)}`;
    const lightLabel = state.lightPower === "lomilwa" ? "LOMILWA" : "LIGHT";
    const lightText = state.lightTurns > 0 ? ` (${lightLabel}:${state.lightTurns})` : "";
    const repelText = state.repelTurns > 0 ? ` (REPEL:${state.repelTurns})` : "";
    const dumapicText = state.dumapicTurns > 0 ? ` (DUMAPIC:${state.dumapicTurns})` : "";
    locLabel.textContent = `B${state.floor}F${themeLabel} X:${state.x} Y:${state.y}${lightText}${repelText}${dumapicText}`;
  } else if (state.gameState === "combat") {
    locLabel.textContent = "BATTLE ENCOUNTER";
  } else if (state.gameState === "chest") {
    locLabel.textContent = "TREASURE CHEST";
  } else if (state.gameState === "victory") {
    locLabel.textContent = "CONGRATULATIONS!";
  } else if (state.gameState === "gameover") {
    locLabel.textContent = "GAME OVER";
  }
  
  // Update Goal HUD
  const goalBanner = document.getElementById("goal-banner");
  if (goalBanner) {
    goalBanner.innerHTML = "";
    const goalRow = document.createElement("div");
    goalRow.className = "goal-row";
    
    const goalText = document.createElement("span");
    if (state.gameState === "gameover") {
      goalText.textContent = "🎯 目標: 全滅した。街に戻って立て直せ";
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
    if (state.currentRun?.quests?.length && !["result", "gameover", "victory"].includes(state.gameState)) {
      const questList = document.createElement("div");
      questList.className = "quest-hud-list";
      state.currentRun.quests.forEach(quest => {
        const item = document.createElement("span");
        item.className = quest.completed ? "completed" : "";
        const name = document.createElement("strong");
        name.textContent = quest.name;
        const progress = document.createElement("small");
        progress.textContent = formatRunQuestProgress(quest, state.currentRun);
        item.append(name, progress);
        questList.appendChild(item);
      });
      goalBanner.appendChild(questList);
    }
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

  // Update Logs — the inline panel is kept minimal, so only render the most
  // recent lines here. Full history is available via the expand overlay.
  const RECENT_LOG_LINES = 12;
  const logContent = document.getElementById("log-content");
  const logPanel = document.getElementById("log-panel");
  const logScrollState = captureScrollState(logPanel);
  logContent.replaceChildren();
  flattenLogLines(state.logs).slice(-RECENT_LOG_LINES).forEach(line => {
    logContent.appendChild(createLogEntry(line));
  });
  restoreScrollState(logPanel, logScrollState);

  // Keep the full-log overlay content fresh if it happens to be open
  const logOverlayEl = document.getElementById("log-overlay");
  if (logOverlayEl && logOverlayEl.style.display !== "none") {
    renderLogOverlay();
  }

  // Update Controls Panel visible state
  const groups = ["explore-controls", "combat-controls", "town-controls", "submenu-controls", "trap-controls"];
  groups.forEach(g => {
    const el = document.getElementById(g);
    if (el) el.classList.remove("active");
  });

  const controlsPanel = document.getElementById("controls-panel");
  if (controlsPanel) {
    controlsPanel.classList.toggle("explore-mode", state.gameState === "explore");
    controlsPanel.classList.toggle("combat-mode", state.gameState === "combat");
    controlsPanel.classList.toggle("town-mode", state.gameState === "town");
    controlsPanel.classList.toggle("submenu-mode", state.gameState === "submenu");
    controlsPanel.classList.toggle("chest-menu-mode", state.gameState === "submenu" && menuContext.type === "chest_menu");
    controlsPanel.classList.toggle("trap-mode", state.gameState === "trap_encounter");
  }

  if (state.gameState === "explore") {
    document.getElementById("explore-controls").classList.add("active");
  } else if (state.gameState === "trap_encounter" && state.activeTrapState) {
    const el = document.getElementById("trap-controls");
    if (el) el.classList.add("active");
    
    const { trap, successRate, expectedEffect, revealLevel = 3 } = state.activeTrapState;
    const trapNames = getFloorTheme(state.floor)?.trapSkins || {};
    const trapName = revealLevel >= 2 ? (trapNames[trap.type] || "未知の罠") : "罠の気配";
    document.getElementById("trap-name").innerHTML = `罠名: <strong style="color:var(--neon-red)">${trapName}</strong>`;
    
    const trapStates = {
      hidden: "未解除",
      discovered: "発見済み",
      weakened: "解除痕跡あり (弱体化)"
    };
    const statusColor = trap.state === "weakened" ? "var(--neon-green)" : "var(--neon-amber)";
    document.getElementById("trap-status").innerHTML = `状態: <span style="color:${statusColor}">${trapStates[trap.state] || trap.state}</span>`;
    const difficultyText = revealLevel >= 3
      ? `危険度: B${trap.floorId.replace("B", "")}F (難易度: ${trap.difficulty})`
      : `危険度: B${trap.floorId.replace("B", "")}F`;
    document.getElementById("trap-difficulty").textContent = difficultyText;
    document.getElementById("trap-effect").textContent = `予想効果: ${expectedEffect}`;
    
    const isPitfall = trap.type === "pitfall";
    const btnDisarm = document.getElementById("btn-trap-disarm");
    const btnForce = document.getElementById("btn-trap-force");
    if (btnDisarm) btnDisarm.textContent = isPitfall ? "縁を伝う" : "解除する";
    if (btnForce) btnForce.textContent = isPitfall ? "飛び越える" : "強行突破";

    const rateColor = successRate >= 75 ? "var(--neon-green)" : (successRate >= 45 ? "var(--neon-amber)" : "var(--neon-red)");
    const rateText = isPitfall ? "回避成功率" : "解除成功率";
    document.getElementById("trap-success-rate").innerHTML = `${rateText}: <span style="color:${rateColor}; font-weight:bold;">${successRate}%</span>`;
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
  } else if (state.gameState === "submenu" && !isCombatOverlaySubmenu) {
    document.getElementById("submenu-controls").classList.add("active");
  }

  // Update Combat Overlay visibility
  const combatOverlay = document.getElementById("combat-overlay");
  if (combatOverlay) {
    if (isCombatOverlaySubmenu) {
      combatOverlay.style.display = "flex";
      renderPreservingOverlayFocus(combatOverlay, renderCombatOverlay);
    } else {
      combatOverlay.style.display = "none";
    }
  }
  
  // Update Equip Overlay visibility
  const equipOverlay = document.getElementById("equip-overlay");
  if (equipOverlay) {
    if (state.gameState === "equip_overlay") {
      equipOverlay.style.display = "flex";
      renderPreservingOverlayFocus(equipOverlay, renderEquip);
    } else {
      equipOverlay.style.display = "none";
    }
  }

  // Update Spell Overlay visibility
  const spellOverlay = document.getElementById("spell-overlay");
  if (spellOverlay) {
    if (state.gameState === "submenu" && (menuContext.type === "spell_caster_select" || menuContext.type === "spell_select" || menuContext.type === "spell_target_ally")) {
      spellOverlay.style.display = "flex";
      renderPreservingOverlayFocus(spellOverlay, renderSpellOverlay);
    } else {
      spellOverlay.style.display = "none";
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

  updateSoloHUD();

  // Update Viewport accessibility Text HUD
  updateViewportHUD();
}
