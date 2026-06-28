import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getItemBaseId } from "../data.js";
import { getIsMuted } from "../audio.js";
import { menuContext, openSubmenu } from "../navigation.js";
import { renderEquip } from "../equip.js";
import { renderSpellOverlay } from "../spell_menu.js";
import { renderCampOverlay } from "../camp.js";
import { renderCombatOverlay, combatSelection } from "../combat.js";
import { updatePartyHUD } from "./hud.js";
import { updateCombatPrompt } from "./combat_prompt.js";
import { updateViewportHUD } from "./viewport_hud.js";
import { renderResultScreen } from "./result_screen.js";

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
  const combatOverlayTypes = ["combat_target", "combat_spell", "combat_item"];
  const isCombatOverlaySubmenu = state.gameState === "submenu" && combatOverlayTypes.includes(menuContext.type);

  // Reset/Apply floor-theme class on #game-container
  const container = document.getElementById("game-container");
  if (container) {
    for (let i = 1; i <= 5; i++) {
      container.classList.remove(`floor-theme-b${i}`);
    }
    if (state.gameState === "explore" && state.floor >= 1 && state.floor <= 5) {
      container.classList.add(`floor-theme-b${state.floor}`);
    }
  }

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
    const floorThemes = {
      1: "迷宮入口",
      2: "湿った毒気",
      3: "竜鍵の気配",
      4: "深層の殺気",
      5: "竜の領域"
    };
    const themeLabel = floorThemes[state.floor] ? ` / ${floorThemes[state.floor]}` : "";
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
    const lines = msg.split("\n");
    lines.forEach(line => {
      if (!line) return;
      const entry = document.createElement("div");
      entry.className = "log-entry";
      
      // Auto color coding Japanese logs & Combat sides
      if (line.includes("[味方]")) {
        if (line.includes("回復") || line.includes("治") || line.includes("無事")) {
          entry.classList.add("heal"); // 味方の回復/治療/解除成功はグリーン
        } else {
          entry.classList.add("ally"); // 味方の通常の攻撃等はパープル
        }
      } else if (line.includes("[ 敵 ]")) {
        entry.classList.add("enemy"); // 敵の行動はすべてレッド
      } else if (line.includes("ダメージ") || line.includes("倒れた") || line.includes("失敗")) {
        entry.classList.add("damage");
      } else if (line.includes("回復") || line.includes("レベルアップ") || line.includes("強さ") || line.includes("休息")) {
        entry.classList.add("heal");
      } else if (line.includes("ゴールド") || line.includes("ゴールド") || line.includes("手に入れた") || line.includes("獲得した") || line.includes("購入") || line.includes("売却")) {
        entry.classList.add("loot");
      } else if (line.includes("唱えた") || line.includes("明かり") || line.includes("座標") || line.includes("DUMAPIC")) {
        entry.classList.add("info");
      } else if (line.includes("【気配】")) {
        entry.classList.add("aura");
      }
      
      entry.textContent = line;
      logContent.appendChild(entry);
    });
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
  } else if (state.gameState === "submenu" && !isCombatOverlaySubmenu) {
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
    if (isCombatOverlaySubmenu) {
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
