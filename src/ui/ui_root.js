import { syncAimRings } from "./aim_rings.js";
import { createElement } from "react";
import { getExplorationRecoveryOutlook } from "../systems/exploration_recovery.js";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { syncPwaUpdateAvailability } from "./pwa_update_manager.js";
import { state, getLogEntries } from "../state.js";
import { COMBAT_LOG_PRESENTATION_KINDS } from "../combat_log_semantics.js";
import { getIsMuted } from "../audio.js";
import { menuContext } from "../navigation.js";
import { renderEquip } from "../equip.js";
import { renderSpellOverlay } from "../spell_menu.js";
import { renderCombatOverlay, combatSelection, getRepeatActionStatus } from "../combat.js";
import { getTechniqueStatus } from "../rules/technique_rules.js";
import { updateSoloHUD } from "./solo_hud.js";
import { getRoundEnemyActions } from "../combat_ui/round_enemy_actions.js";
import { updateCombatPrompt } from "./combat_prompt.js";
import { updateViewportHUD } from "./viewport_hud.js";
import { renderResultScreen } from "./result_screen.js";
import { getDepthCorruption, getFloorDisplayName, getFloorTheme } from "../data/floor_themes.js";
import { describeFloor } from "./floor_label.js";
import { formatFeatProgress, getFeat, getLiveFeatCounters, getNearestFeats } from "../systems/feats.js";
import { getEscortNames } from "../systems/facilities.js";
import { updateRecordsStrip } from "./records_view.js";
import { renderTownHome } from "./town_home.js";
import { getScreenViewState } from "../state/view_state.js";
import {
  getDockStateForView,
  fitEventStripRows,
  getEventStripEntries,
  orderEventStripRowsByLog,
  setActionDockState,
  setDockActionRole
} from "./common_shell.js";
import {
  MILESTONE_CLEARED_STRUCTURE_MESSAGE,
  MILESTONE_STRUCTURE_MESSAGE
} from "./milestone_disclosure.js";
import { releaseFocusSurface, syncFocusSurface } from "./focus_manager.js";
import { lockShellScroll, unlockShellScroll } from "./shell_scroll_lock.js";
import { closeFullMap, isFullMapOpen, openFullMap } from "./full_map_overlay.js";
import { MinimapToggle } from "./minimap_toggle.js";
import {
  EXPLORE_HUD_LOG_LINGER_MS,
  isExploreHudGoalExpanded,
  nextExploreHudFocus,
  suspendExploreHudFocus,
  toggleExploreHudGoal,
} from "./explore_hud_focus.js";

let floorStingerTimer = null;
let combatEntryCueTimer = null;
let wasCombatContext = false;
let exploreHudFocus = null;
let minimapToggleHost = null;
let minimapToggleRoot = null;
let minimapToggleVisible = null;
// The newest log line lingers on the explore HUD, then clears (#1832).
let exploreLogLingerTimer = null;
let exploreLogLingerSignature = null;
let exploreLogFresh = false;
const LOG_AUTOSCROLL_THRESHOLD = 24;
const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";
const FLOOR_THEME_STYLE_PROPERTIES = [
  "--biome-wall-color",
  "--biome-glow",
  "--biome-background",
  "--biome-header-background",
  "--biome-banner-background",
  "--biome-aura",
  "--biome-aura-opacity",
  "--depth-corruption",
];

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
  if (floor % 5 === 0) {
    const structure = document.createElement("span");
    structure.className = "floor-entry-structure";
    structure.textContent = state.currentRun?.defeatedMilestones?.includes(floor)
      ? MILESTONE_CLEARED_STRUCTURE_MESSAGE
      : MILESTONE_STRUCTURE_MESSAGE;
    stinger.appendChild(structure);
  }
  stinger.classList.toggle("first-visit", firstVisit);
  stinger.classList.add("visible");
  floorStingerTimer = setTimeout(() => stinger.classList.remove("visible"), firstVisit ? 1400 : 900);
}

// Split stored log messages (which may contain embedded newlines) into
// individual display lines, dropping empties.
function flattenLogLines(logs) {
  const lines = [];
  logs.forEach(log => {
    const text = typeof log === "object" && log !== null ? String(log.text ?? "") : String(log ?? "");
    const side = log?.side || "neutral";
    const presentationKind = log?.presentationKind || COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
    text.split("\n").forEach(line => {
      if (line) lines.push({ text: line, side, presentationKind });
    });
  });
  return lines;
}

// Build a color-coded log entry <div> for a single line.
function createLogEntry(lineData) {
  const line = typeof lineData === "object" && lineData !== null ? String(lineData.text ?? "") : String(lineData ?? "");
  const side = lineData?.side || "neutral";
  const presentationKind = lineData?.presentationKind || COMBAT_LOG_PRESENTATION_KINDS.NEUTRAL;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const isDamage = line.includes("ダメージ") || line.includes("倒れた") || line.includes("力尽きた") || line.includes("失敗");
  if (side === "ally") {
    entry.classList.add("ally");
    if (line.includes("回復") || line.includes("治") || line.includes("無事")) {
      entry.classList.add("heal");
    } else if (isDamage) {
      entry.classList.add("damage-dealt");
    }
  } else if (side === "enemy") {
    entry.classList.add("enemy");
    if (isDamage) entry.classList.add("damage-taken");
  } else if (isDamage) {
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
  if (presentationKind === COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_DEALT) {
    entry.classList.add("damage-dealt");
  } else if (presentationKind === COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN) {
    entry.classList.add("damage-taken");
  } else if (presentationKind === COMBAT_LOG_PRESENTATION_KINDS.HEALING) {
    entry.classList.add("heal");
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
  flattenLogLines(getLogEntries()).forEach(line => {
    body.appendChild(createLogEntry(line));
  });
  restoreScrollState(body, scrollState);
}

export function openLogOverlay() {
  const overlay = document.getElementById("log-overlay");
  if (!overlay) return;
  lockShellScroll("log-overlay");
  overlay.style.display = "flex";
  renderLogOverlay();
  const body = document.getElementById("log-overlay-body");
  if (body) body.scrollTop = body.scrollHeight;
  syncFocusSurface("log-overlay", overlay);
}

export function closeLogOverlay() {
  const overlay = document.getElementById("log-overlay");
  if (overlay) overlay.style.display = "none";
  unlockShellScroll("log-overlay");
  releaseFocusSurface("log-overlay", "#btn-log");
}

export function getFloorExplorationRate() {
  const view = getScreenViewState(state, null);
  if (!view.hasMap) return 0;
  const map = state.map;
  let passableCount = 0;
  let visitedCount = 0;
  for (let y = 1; y < map.length - 1; y++) {
    for (let x = 1; x < map[y].length - 1; x++) {
      const cell = map[y][x];
      if (cell && cell.walls && cell.walls.some(w => !w)) {
        passableCount++;
        if (Array.isArray(state.visitedMap?.[y]) && state.visitedMap[y][x]) {
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
  if (!viewport || typeof viewport.setAttribute !== "function") return;

  const currentContent = typeof viewport.getAttribute === "function"
    ? viewport.getAttribute("content")
    : null;
  if (currentContent !== LOCKED_VIEWPORT) {
    // Keep the app's viewport definition stable without disabling user zoom.
    viewport.setAttribute("content", LOCKED_VIEWPORT);
  }
}

export function getCurrentGoal() {
  const view = getScreenViewState(state, menuContext);
  if (view.gameState === "town" || view.isDeparturePrepSubmenu) {
    return "支度を整えて、これまでより深く潜る";
  }

  // The header already names the floor the player is on.
  if (state.floor % 5 === 0 && !state.currentRun?.defeatedMilestones?.includes(state.floor)) {
    return "この階の守護者を倒す";
  }
  return `階段を探して${describeFloor(state, state.floor + 1)}へ`;
}

// The unfolded goal has room for two rows of two (#2044).
const HUD_FEAT_LIMIT = 4;

// A goal-row stat whose label hides while the explore goal is folded (#1832).
function createGoalStat(icon, label, value) {
  const stat = document.createElement("span");
  [[icon + " ", ""], [label, "goal-stat-label"], [value, ""]].forEach(([text, className]) => {
    const part = document.createElement("span");
    if (className) part.className = className;
    part.textContent = text;
    stat.appendChild(part);
  });
  return stat;
}

// Feats shown during a run: what this run stands to lose, then the closest
// feats still ahead with live progress, then the ones achieved in this run
// (#2007). Capped so the unfolded goal never cuts an entry in half (#2044).
function getHudFeats() {
  const run = state.currentRun;
  if (!run) return [];
  const achieved = (run.featsAnnounced || [])
    .slice(-2)
    .map(getFeat)
    .filter(Boolean)
    .map(feat => ({ name: feat.name, progress: "達成", completed: true }));
  const nearest = getNearestFeats(state.feats, getLiveFeatCounters(state.feats, run), 2)
    .map(({ feat, progress }) => ({
      name: feat.name,
      progress: formatFeatProgress(feat, progress, run).replace(" / ", "/"),
      completed: false
    }));
  // Someone being led out comes first: it is what this run now stands to lose.
  const escortNames = getEscortNames(run);
  const escort = escortNames
    ? [{ name: `同行：${escortNames}`, progress: "生還で救出", completed: false, companion: true }]
    : [];
  // Fragments are lost unless the run walks out: show them with the escort.
  const fragments = Math.max(0, Math.floor(Number(run.guideFragments) || 0));
  const carried = fragments > 0
    ? [{ name: `断片 ${fragments}枚`, progress: "生還で持ち帰る", completed: false, companion: true }]
    : [];
  const oath = run.oath === true
    ? [{ name: "誓約", progress: "死ねば素材は残らない", completed: false, companion: true }]
    : [];
  return [...escort, ...oath, ...carried, ...nearest, ...achieved].slice(0, HUD_FEAT_LIMIT);
}

function getExploreGoalSignature() {
  const feats = getHudFeats().map(feat => `${feat.name}:${feat.completed ? 1 : 0}:${feat.progress}`);
  return [getCurrentGoal(), ...feats].join("|");
}

// The minimap opens the full-floor map (#1833); it closes when explore ends.
function updateMinimapToggle(isExploreHud) {
  if (!isExploreHud && isFullMapOpen()) closeFullMap();
  const host = document.getElementById("minimap-toggle-root");
  if (!host) {
    minimapToggleRoot?.unmount();
    minimapToggleHost = null;
    minimapToggleRoot = null;
    minimapToggleVisible = null;
    return;
  }
  if (host.nodeType !== 1 || !host.ownerDocument) return;
  if (minimapToggleHost !== host || !minimapToggleRoot) {
    minimapToggleRoot?.unmount();
    minimapToggleHost = host;
    minimapToggleRoot = createRoot(host);
    minimapToggleVisible = null;
  }
  if (minimapToggleVisible === isExploreHud) return;
  minimapToggleVisible = isExploreHud;
  flushSync(() => minimapToggleRoot.render(createElement(MinimapToggle, {
    visible: isExploreHud,
    onCommand: command => {
      if (command.type === "open-full-map") openFullMap();
    },
  })));
}

export function updateUI() {
  resetViewportZoom();
  updateRecordsStrip();
  const view = getScreenViewState(state, menuContext);
  syncPwaUpdateAvailability(view);
  const { gameState } = view;
  const combatOverlayTypes = ["combat_target", "combat_spell", "combat_item"];
  const hasUsableCombat = view.hasCombat && view.hasUsableCombatActor;
  const isUsableCombatScreen = gameState === "combat" && hasUsableCombat;
  const isCombatOverlaySubmenu = view.isCombatOverlaySubmenu && combatOverlayTypes.includes(view.menuType);
  const isCombatContext = (gameState === "combat" && view.hasCombat) || isCombatOverlaySubmenu;
  const combatPhase = isCombatOverlaySubmenu
    ? view.menuType === "combat_target"
      ? "choose_target"
      : view.menuType === "combat_spell"
        ? "choose_spell"
        : "choose_item"
    : gameState === "combat" && state.combatState?.phase === "resolving"
      ? "resolving"
      : isCombatContext
        ? "choose_action"
        : "";
  const departurePrepSubmenu = view.isDeparturePrepSubmenu;
  // The feat list and the facility screens are long town lists like the
  // Workshop: give them the same full-height layout (#2007, #2009).
  const workshopSubmenu = view.isWorkshopSubmenu || view.menuType === "feats_main" ||
    view.menuType.startsWith("facility_") || view.menuType === "guidebook_main";
  const merchantSubmenu = view.isSubmenu && view.menuType === "milestone_merchant";
  const townSubmenu = view.isTownSubmenu;
  const isTownLikeGoal = gameState === "town" || departurePrepSubmenu;
  const isDungeonFirstMode = view.hasMap &&
    !["town", "result", "gameover", "victory"].includes(gameState) &&
    !departurePrepSubmenu && !workshopSubmenu && !townSubmenu;
  const dungeonFirstState = isUsableCombatScreen || view.isCombatOverlaySubmenu
    ? "combat"
    : gameState === "chest" || gameState === "trap_encounter" || view.isEventSubmenu
      ? "decision"
      : "explore";

  const isExploreHud = isDungeonFirstMode && dungeonFirstState === "explore" && gameState === "explore";
  if (isExploreHud) {
    const logs = state.logs || [];
    const lastLog = logs[logs.length - 1];
    const logSignature = `${logs.length}|${typeof lastLog === "object" && lastLog !== null ? lastLog.text : lastLog}`;
    if (logSignature !== exploreLogLingerSignature) {
      exploreLogLingerSignature = logSignature;
      exploreLogFresh = true;
      clearTimeout(exploreLogLingerTimer);
      exploreLogLingerTimer = setTimeout(() => {
        exploreLogFresh = false;
        updateUI();
      }, EXPLORE_HUD_LOG_LINGER_MS);
    }
    exploreHudFocus = nextExploreHudFocus(exploreHudFocus, {
      logSignature,
      goalSignature: getExploreGoalSignature(),
      poseSignature: `${state.floor},${state.x},${state.y},${state.dir}`,
      floor: state.floor
    });
  } else {
    exploreHudFocus = suspendExploreHudFocus(exploreHudFocus);
  }
  updateMinimapToggle(isExploreHud);

  if (gameState === "town") renderTownHome();

  // Reset/Apply floor-theme class on #game-container
  const container = document.getElementById("game-container");
  if (container) {
    for (let i = 1; i <= 6; i++) {
      container.classList.remove(`floor-theme-b${i}`);
    }
    container.classList.toggle("result-mode", gameState === "result");
    container.classList.toggle("combat-screen-mode", gameState === "combat");
    container.classList.toggle(
      "event-mode",
      gameState === "trap_encounter" || view.isEventSubmenu
    );
    container.classList.toggle("departure-mode", departurePrepSubmenu);
    container.classList.toggle("workshop-mode", workshopSubmenu);
    container.classList.toggle("town-submenu-mode", townSubmenu);
    container.classList.toggle("town-home-mode", gameState === "town");
    // Only the town home scrolls the shell; never carry its offset into other screens.
    if (gameState !== "town" && container.scrollTop) container.scrollTop = 0;
    container.classList.toggle("dungeon-first-mode", isDungeonFirstMode);
    if (container.dataset) {
      if (isDungeonFirstMode) container.dataset.dungeonFirstState = dungeonFirstState;
      else delete container.dataset.dungeonFirstState;
      if (isExploreHud) {
        container.dataset.exploreHud = exploreHudFocus.mode;
        container.dataset.goalExpanded = isExploreHudGoalExpanded(exploreHudFocus) ? "true" : "false";
      } else {
        delete container.dataset.exploreHud;
        delete container.dataset.goalExpanded;
      }
      if (isCombatContext) {
        container.dataset.combatPhase = combatPhase;
        container.dataset.combatContext = "active";
      } else {
        delete container.dataset.combatPhase;
        delete container.dataset.combatContext;
        delete container.dataset.combatEntry;
      }
    }
    if (state.currentRun &&
        gameState !== "town" &&
        gameState !== "gameover" &&
        gameState !== "victory" &&
        gameState !== "result" &&
        state.floor >= 1) {
      const floorTheme = getFloorTheme(state.floor);
      const visual = floorTheme.visualSignature;
      container.classList.add(floorTheme.cssClass);
      if (typeof container.style?.setProperty === "function") {
        container.style.setProperty("--biome-wall-color", visual.wallColor);
        container.style.setProperty("--biome-glow", visual.glow);
        container.style.setProperty("--biome-background", visual.background);
        container.style.setProperty("--biome-header-background", visual.headerBackground);
        container.style.setProperty("--biome-banner-background", visual.bannerBackground);
        container.style.setProperty("--biome-aura", visual.aura);
        container.style.setProperty("--biome-aura-opacity", String(visual.auraOpacity));
        container.style.setProperty("--depth-corruption", String(getDepthCorruption(state.floor)));
      }
    } else if (typeof container.style?.removeProperty === "function") {
      FLOOR_THEME_STYLE_PROPERTIES.forEach(property => container.style.removeProperty(property));
    }
  }

  // Update location label
  const locLabel = document.getElementById("location-label");
  
  const resultOverlay = document.getElementById("result-overlay");
  if (resultOverlay) {
    if (gameState === "result") {
      resultOverlay.style.display = "flex";
      renderPreservingOverlayFocus(resultOverlay, renderResultScreen);
    } else {
      resultOverlay.style.display = "none";
    }
  }

  if (gameState === "town") {
    locLabel.textContent = "TOWN OF LLYLGAMYN";
  } else if (gameState === "explore") {
    const themeLabel = ` / ${getFloorDisplayName(state, state.floor)}`;
    const lightLabel = state.lightPower === "lomilwa" ? "LOMILWA" : "LIGHT";
    const lightText = state.lightTurns > 0 ? ` (${lightLabel}:${state.lightTurns})` : "";
    const repelText = state.repelTurns > 0 ? ` (REPEL:${state.repelTurns})` : "";
    locLabel.textContent = `B${state.floor}F${themeLabel}${lightText}${repelText}`;
  } else if (isCombatContext) {
    if (!wasCombatContext) {
      clearTimeout(combatEntryCueTimer);
      const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (container?.dataset) container.dataset.combatEntry = reducedMotion ? "compact" : "cue";
      locLabel.textContent = reducedMotion ? "COMBAT" : "BATTLE ENCOUNTER";
      combatEntryCueTimer = setTimeout(() => {
        if (container?.dataset?.combatContext === "active") container.dataset.combatEntry = "compact";
        if (document.getElementById("location-label")) document.getElementById("location-label").textContent = "COMBAT";
      }, reducedMotion ? 0 : 1200);
    } else if (container?.dataset?.combatEntry !== "cue") {
      locLabel.textContent = "COMBAT";
    }
  } else if (gameState === "chest") {
    locLabel.textContent = "TREASURE CHEST";
  } else if (gameState === "victory") {
    locLabel.textContent = "CONGRATULATIONS!";
  } else if (gameState === "gameover") {
    locLabel.textContent = "GAME OVER";
  } else if (gameState === "result") {
    // Without this the label of the screen the run ended on stays up.
    locLabel.textContent = "RESULT";
  }
  wasCombatContext = isCombatContext;
  
  // Update Goal HUD
  const goalBanner = document.getElementById("goal-banner");
  if (goalBanner) {
    const hideCombatGoal = isCombatContext;
    goalBanner.hidden = hideCombatGoal;
    if (typeof goalBanner.setAttribute === "function") {
      goalBanner.setAttribute("aria-hidden", hideCombatGoal ? "true" : "false");
    }
    goalBanner.innerHTML = "";
    const goalRow = document.createElement("div");
    goalRow.className = "goal-row";
    
    const goalText = document.createElement("span");
    goalText.className = "goal-text";
    const goalSentence = gameState === "gameover"
      ? "倒れた。街に戻って立て直す"
      : gameState === "victory"
        ? "おめでとう！ゲームクリア！"
        : getCurrentGoal();
    // The word "目標" hides while the explore goal is folded: the target icon
    // already says it, and the sentence needs the width (#2044).
    [["🎯 ", ""], ["目標: ", "goal-label"], [goalSentence, ""]].forEach(([text, className]) => {
      const part = document.createElement("span");
      if (className) part.className = className;
      part.textContent = text;
      goalText.appendChild(part);
    });
    const goalLabelText = `🎯 目標: ${goalSentence}`;
    goalRow.appendChild(goalText);

    if (gameState !== "gameover" && gameState !== "victory" && !isTownLikeGoal) {
      const expRate = getFloorExplorationRate();
      
      const statsContainer = document.createElement("span");
      statsContainer.className = "goal-stats-container";
      statsContainer.appendChild(createGoalStat("🗺️", "探索率: ", `${expRate}%`));
      const hudFeatsForSummary = getHudFeats();
      const escortNames = getEscortNames(state.currentRun);
      const carriedFragments = Math.max(0, Math.floor(Number(state.currentRun?.guideFragments) || 0));
      const nextFeat = hudFeatsForSummary.find(feat => !feat.completed && !feat.companion);
      // The folded one-line goal carries one more thing, the one that matters
      // most right now: who is being led out, then fragments that are lost
      // unless the run walks out, then the closest feat by name (#1832, #2007,
      // #2044). The rest is one tap away in the unfolded goal.
      if (isExploreHud && escortNames) {
        const escortSummary = createGoalStat("👤", "同行 ", escortNames);
        escortSummary.className = "goal-feat-summary goal-companion-summary";
        statsContainer.appendChild(escortSummary);
      } else if (isExploreHud && carriedFragments > 0) {
        const fragmentSummary = createGoalStat("📖", "", `断片 ${carriedFragments}枚`);
        fragmentSummary.className = "goal-feat-summary goal-fragment-summary";
        statsContainer.appendChild(fragmentSummary);
      } else if (isExploreHud && nextFeat) {
        const featSummary = createGoalStat("📜", "偉業 ", nextFeat.name);
        featSummary.className = "goal-feat-summary goal-feat-name-summary";
        statsContainer.appendChild(featSummary);
      }
      const recoveryOutlook = isExploreHud ? getExplorationRecoveryOutlook(state) : null;
      if (recoveryOutlook) {
        // The floor's unspent allowance, in the unfolded goal only: the folded
        // pill keeps its width for the goal text, and the HP/MP bars show what
        // can be taken right now (#1993).
        const amounts = [`HP ${recoveryOutlook.allowance.hp}`];
        if (recoveryOutlook.hasMpAllowance) amounts.push(`MP ${recoveryOutlook.allowance.mp}`);
        const recovery = createGoalStat("♨️", "歩いて回復 ", recoveryOutlook.suspended ? "毒で止まっている" : `あと${amounts.join("・")}`);
        recovery.className = "goal-recovery-stat";
        statsContainer.appendChild(recovery);
      }
      goalRow.appendChild(statsContainer);
    }
    goalBanner.appendChild(goalRow);
    if (isExploreHud) {
      const goalExpanded = isExploreHudGoalExpanded(exploreHudFocus);
      const goalToggle = document.createElement("button");
      goalToggle.type = "button";
      goalToggle.id = "btn-goal-toggle";
      goalToggle.className = "goal-toggle";
      if (typeof goalToggle.setAttribute === "function") {
        goalToggle.setAttribute("aria-expanded", goalExpanded ? "true" : "false");
        goalToggle.setAttribute("aria-label", `${goalExpanded ? "目標の詳細を畳む" : "目標の詳細を表示"}: ${goalLabelText}`);
      }
      goalToggle.addEventListener?.("click", () => {
        exploreHudFocus = toggleExploreHudGoal(exploreHudFocus);
        updateUI();
        document.getElementById("btn-goal-toggle")?.focus?.();
      });
      goalBanner.appendChild(goalToggle);
    }
    const hudFeats = ["result", "gameover", "victory"].includes(gameState) || isTownLikeGoal ? [] : getHudFeats();
    if (hudFeats.length > 0) {
      const featList = document.createElement("div");
      featList.className = "feat-hud-list";
      hudFeats.forEach(feat => {
        const item = document.createElement("span");
        item.className = feat.completed ? "completed" : feat.companion ? "companion" : "";
        const name = document.createElement("strong");
        name.textContent = feat.name;
        const progress = document.createElement("small");
        progress.textContent = feat.progress;
        item.appendChild(name);
        item.appendChild(progress);
        featList.appendChild(item);
      });
      goalBanner.appendChild(featList);
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
  const eventEntries = getEventStripEntries(getLogEntries(), {
    unresolvedLimit: isCombatContext ? 1 : 4,
    transientLimit: isCombatContext ? 1 : RECENT_LOG_LINES - 4,
    activeObservations: state.currentRun?.eventObservations
  });
  const appendEventEntry = ({ kind, text, side, presentationKind }) => {
    const entry = createLogEntry({ text, side, presentationKind });
    entry.classList.add("event-strip-item", `event-strip-item--${kind}`);
    if (entry.dataset) entry.dataset.eventKind = kind;
    const label = document.createElement("span");
    label.className = "event-strip-item-label";
    label.textContent = kind === "unresolved" ? "未解決" : kind === "result" ? "結果" : kind === "enemy" ? "敵" : "直近";
    if (typeof entry.prepend === "function") {
      entry.prepend(label);
    } else {
      entry.appendChild(label);
    }
    logContent.appendChild(entry);
  };
  // Keep unresolved observations in their own four-slot contract so a burst
  // of combat results cannot hide a threat or trap that still needs a decision.
  const persistentEvents = isCombatContext
    ? [...eventEntries.unresolved, ...(eventEntries.results || []).slice(-1)]
    : [...eventEntries.unresolved, ...(eventEntries.results || [])];
  // Combat keeps a single recent line, so this round's enemy actions get their
  // own row; lines already visible in another row are not repeated.
  const visibleTexts = new Set([...persistentEvents, ...eventEntries.transient.slice(-1)].map(({ text }) => text));
  const enemyDigest = isCombatContext
    ? getRoundEnemyActions(state.combatState).filter(text => !visibleTexts.has(text))
    : [];
  if (enemyDigest.length > 0) {
    persistentEvents.push({
      kind: "enemy",
      text: enemyDigest.join(" / "),
      sourceTexts: enemyDigest,
      side: "enemy",
      presentationKind: COMBAT_LOG_PRESENTATION_KINDS.DAMAGE_TAKEN
    });
  }
  if (isExploreHud) {
    // Explore keeps unresolved observations and the latest result, plus the
    // newest line until EXPLORE_HUD_LOG_LINGER_MS passes (#1832). The full
    // history stays behind #btn-log-expand.
    const exploreEvents = [...eventEntries.unresolved, ...(eventEntries.results || []).slice(-1)];
    const newestText = flattenLogLines(getLogEntries()).at(-1)?.text;
    const newest = exploreEvents.some(({ text }) => text === newestText) ? null : eventEntries.transient.at(-1);
    orderEventStripRowsByLog([...exploreEvents, ...(exploreLogFresh && newest ? [newest] : [])], getLogEntries())
      .forEach(appendEventEntry);
  } else {
    const transientBudget = Math.max(0, RECENT_LOG_LINES - persistentEvents.length);
    orderEventStripRowsByLog([...persistentEvents, ...eventEntries.transient.slice(-transientBudget)], getLogEntries())
      .forEach(appendEventEntry);
  }
  fitEventStripRows(isDungeonFirstMode ? logPanel : null, logContent, document.getElementById("btn-log-expand"));
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
    setActionDockState(controlsPanel, getDockStateForView(view));
    controlsPanel.classList.toggle("explore-mode", gameState === "explore");
    controlsPanel.classList.toggle("combat-mode", isUsableCombatScreen);
    controlsPanel.classList.toggle("combat-overlay-mode", view.isUsableCombatOverlaySubmenu);
    controlsPanel.classList.toggle("town-mode", gameState === "town");
    controlsPanel.classList.toggle("submenu-mode", gameState === "submenu");
    controlsPanel.classList.toggle("departure-mode", departurePrepSubmenu);
    controlsPanel.classList.toggle("workshop-mode", workshopSubmenu);
    controlsPanel.classList.toggle("merchant-mode", merchantSubmenu);
    controlsPanel.classList.toggle("chest-menu-mode", view.isSubmenu && view.menuType === "chest_menu");
    controlsPanel.classList.toggle("trap-mode", gameState === "trap_encounter");
  }

  setDockActionRole(document.getElementById("btn-submenu-back"), "back");
  setDockActionRole(document.getElementById("btn-combat-cancel"), "back");
  if (gameState === "trap_encounter") {
    setDockActionRole(document.getElementById("btn-trap-disarm"), "confirm");
    setDockActionRole(document.getElementById("btn-trap-force"), "confirm");
  }

  if (gameState === "explore") {
    document.getElementById("explore-controls").classList.add("active");
  } else if (gameState === "trap_encounter" && state.activeTrapState) {
    const el = document.getElementById("trap-controls");
    if (el) el.classList.add("active");
    
    // The panel says what the trap is, what it does, and the odds: what the
    // choice needs. The internal difficulty is already inside the odds.
    // `consequence` is missing on encounters saved before it existed.
    const { trap, successRate, consequence, expectedEffect, revealLevel = 3 } = state.activeTrapState;
    const trapNames = getFloorTheme(state.floor)?.trapSkins || {};
    const trapName = revealLevel >= 2 ? (trapNames[trap.type] || "見たことのない罠") : "罠の気配";
    document.getElementById("trap-name").textContent = trapName;
    document.getElementById("trap-effect").textContent = `かかると: ${consequence || expectedEffect || "何が起こるか分からない"}`;
    
    const isPitfall = trap.type === "pitfall";
    const btnDisarm = document.getElementById("btn-trap-disarm");
    const btnForce = document.getElementById("btn-trap-force");
    if (btnDisarm) btnDisarm.textContent = isPitfall ? "縁を伝う" : "解除する";
    if (btnForce) btnForce.textContent = isPitfall ? "飛び込む" : "強行突破";

    const rateColor = successRate >= 75 ? "var(--neon-green)" : (successRate >= 45 ? "var(--neon-amber)" : "var(--neon-red)");
    const rateText = isPitfall ? "渡りきる見込み" : "解除の見込み";
    const rateElement = document.getElementById("trap-success-rate");
    rateElement.replaceChildren();
    rateElement.textContent = `${rateText}: `;
    const rateValue = document.createElement("span");
    rateValue.style.color = rateColor;
    rateValue.style.fontWeight = "bold";
    rateValue.textContent = `${successRate}%`;
    rateElement.appendChild(rateValue);
  } else if (isUsableCombatScreen) {
    document.getElementById("combat-controls").classList.add("active");
    const gridEl = document.querySelector(".combat-grid");
    if (gridEl) {
      const isResolving = state.combatState && state.combatState.phase === "resolving";
      
      const actionButtons = [
        "btn-combat-fight",
        "btn-combat-technique",
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
        // Clear the resolving overrides so disabled/unavailable styling shows.
        actionButtons.forEach(btn => {
          btn.style.pointerEvents = "";
          btn.style.opacity = "";
        });
        
        // #1824: keep every command in its slot; unusable ones are disabled
        // with a short visible reason instead of collapsing the grid.
        const cancelBtn = document.getElementById("btn-combat-cancel");
        if (cancelBtn) {
          const canCancel = combatSelection.charIdx > 0;
          cancelBtn.disabled = !canCancel;
          setCombatCommandReason(cancelBtn, canCancel ? "" : "最初の仲間");
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
      updateTechniqueButton();
      const repeatBtn = document.getElementById("btn-combat-repeat");
      if (repeatBtn) {
        const repeatStatus = getRepeatActionStatus();
        repeatBtn.disabled = !repeatStatus.available;
        repeatBtn.classList.toggle("is-unavailable", !repeatStatus.available);
        setCombatCommandReason(repeatBtn, repeatStatus.available ? "" : repeatStatus.shortReason);
        repeatBtn.title = repeatStatus.available
          ? "前回の行動をこのターンに1回だけ再実行"
          : repeatStatus.reason;
        repeatBtn.setAttribute("aria-label", repeatStatus.available
          ? "前回の行動を1ターン再実行"
          : `前回の行動は使用不可: ${repeatStatus.reason}`);
      }
    }
    updateCombatPrompt();
  } else if (gameState === "town") {
    document.getElementById("town-controls").classList.add("active");
  } else if (gameState === "submenu" && !isCombatOverlaySubmenu) {
    document.getElementById("submenu-controls").classList.add("active");
  }

  if (gameState === "combat" && !isUsableCombatScreen) {
    updateCombatPrompt();
  }

  // Update Combat Overlay visibility
  const combatOverlay = document.getElementById("combat-overlay");
  if (combatOverlay) {
    if (view.isUsableCombatOverlaySubmenu) {
      combatOverlay.style.display = "flex";
      renderPreservingOverlayFocus(combatOverlay, renderCombatOverlay);
    } else {
      combatOverlay.style.display = "none";
    }
    syncAimRings(view.isUsableCombatOverlaySubmenu && menuContext.type === "combat_target" && menuContext.targetType === "enemy");
  }

  const canvas = document.getElementById("dungeon-canvas");
  const isCanvasEnemyTargetSelection = view.isUsableCombatOverlaySubmenu &&
    view.menuType === "combat_target" && menuContext.targetType === "enemy";
  if (canvas) {
    canvas.tabIndex = isCanvasEnemyTargetSelection ? 0 : -1;
    if (typeof canvas.setAttribute === "function") {
      canvas.setAttribute("aria-label", isCanvasEnemyTargetSelection
        ? "敵対象選択。敵をタップして対象を選択"
        : "迷宮の視界");
      if (isCanvasEnemyTargetSelection) canvas.setAttribute("aria-describedby", "combat-target-instructions");
    }
    if (!isCanvasEnemyTargetSelection && typeof canvas.removeAttribute === "function") {
      canvas.removeAttribute("aria-describedby");
    }
  }
  
  // Update Equip Overlay visibility
  const equipOverlay = document.getElementById("equip-overlay");
  if (equipOverlay) {
    if (gameState === "equip_overlay") {
      equipOverlay.style.display = "flex";
      renderPreservingOverlayFocus(equipOverlay, renderEquip);
    } else {
      equipOverlay.style.display = "none";
    }
  }

  // Update Spell Overlay visibility
  const spellOverlay = document.getElementById("spell-overlay");
  if (spellOverlay) {
    if (view.isUsableSpellOverlaySubmenu) {
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

  const focusSurface = view.isUsableCombatOverlaySubmenu
    ? { id: "combat-overlay", element: document.getElementById("combat-overlay") }
    : gameState === "equip_overlay"
      ? { id: "equip-overlay", element: document.getElementById("equip-overlay") }
      : view.isUsableSpellOverlaySubmenu
        ? { id: "spell-overlay", element: document.getElementById("spell-overlay") }
        : gameState === "result"
          ? { id: "result-overlay", element: document.getElementById("result-overlay") }
          : view.isSubmenu
            ? { id: "submenu-controls", element: document.getElementById("submenu-controls") }
            : null;
  if (focusSurface) {
    syncFocusSurface(focusSurface.id, focusSurface.element);
  } else {
    const focusFallbacks = {
      "combat-overlay": "#btn-combat-fight",
      "equip-overlay": "#btn-equip-close",
      "spell-overlay": "#btn-combat-spell",
      "result-overlay": "#btn-town-dungeon",
      "submenu-controls": "#btn-town-dungeon"
    };
    ["combat-overlay", "equip-overlay", "spell-overlay", "result-overlay", "submenu-controls"]
      .some(id => releaseFocusSurface(id, focusFallbacks[id]));
  }

  updateSoloHUD({ showExplorationRecovery: isDungeonFirstMode && dungeonFirstState !== "combat" });

  // Update Viewport accessibility Text HUD
  updateViewportHUD();
}

function setCombatCommandReason(btn, reason) {
  if (reason) btn.setAttribute("data-reason", reason);
  else btn.removeAttribute?.("data-reason");
}

// Build vNext technique button: hidden unless the current actor's weapon owns
// a technique; shows the remaining cooldown or the Blood cost when relevant.
function updateTechniqueButton() {
  const btn = document.getElementById("btn-combat-technique");
  if (!btn) return;
  const living = (state.party || [])
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => char && ["ok", "poisoned", "blind"].includes(char.status));
  const actor = living[combatSelection.charIdx];
  const status = actor ? getTechniqueStatus(state, actor.index) : { technique: null };
  if (!status.technique) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const name = status.technique.name;
  btn.textContent = name;
  // Cooldown / Blood cost sits on the small second line, like disabled reasons.
  setCombatCommandReason(btn, status.remaining <= 0
    ? ""
    : status.hpCost !== null ? `HP${status.hpCost}消費` : `あと${status.remaining}ターン`);
  btn.classList.toggle("is-unavailable", !status.available);
  btn.setAttribute("aria-label", `${name}。${status.technique.desc}${status.available ? "" : `（あと${status.remaining}ターン）`}`);
  btn.title = status.technique.desc;
}
