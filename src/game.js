import { loadGame, saveAutosave, state } from "./state.js";
import { initErrorContext } from "./error_context.js";
import { addGameBreadcrumb } from "./sentry.js";
import { DungeonRenderer, setDungeonRenderer } from "./renderer.js";
import { toggleMute } from "./audio.js";
import { setUiUpdateCallback, goBackSubmenu, menuContext } from "./navigation.js";
import { handleTrapAction } from "./systems/traps.js";
import { blockGuardedControlsEvent } from "./controls_guard.js";
import { openChestMenu } from "./chest.js";
import { getScreenViewState } from "./state/view_state.js";
import { getRendererInput } from "./state/renderer_view.js";

// Import modules for re-export and button bindings
import { updateUI, openLogOverlay, closeLogOverlay } from "./ui.js";
import { handleMove, enterDungeon, resumePendingCampEntry } from "./movement.js";
import { handleExploreAction, handleTownOption } from "./menu.js";
import { selectCombatAction, cancelCombatAction, toggleCombatAuto, resumeCombat } from "./combat.js";

// Re-exports for external use and backward compatibility
export { updateUI } from "./ui.js";
export { handleMove, enterDungeon } from "./movement.js";
export { handleExploreAction, handleTownOption } from "./menu.js";
export { goBackSubmenu } from "./navigation.js";
export { selectCombatAction, cancelCombatAction, resolveCombatRound, triggerGameOver, toggleCombatAuto } from "./combat.js";

let renderer = null;
let animationFrameId = null;
let lastTime = null;
const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover";

export function initGame() {
  setUiUpdateCallback(updateUI);
  lockViewportScale();
  loadGame();
  if (state.chestState?.fromDrop) openChestMenu();

  // エラー発生時にゲーム状態をSentryへ添付できるよう登録（stateはロード済み）
  initErrorContext(state);

  renderer = new DungeonRenderer("dungeon-canvas");
  setDungeonRenderer(renderer);

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", stopGameLoop);
  window.addEventListener("pageshow", handlePageShow);

  // Set up animation/render loop
  scheduleGameLoop();

  // Bind Buttons
  bindButtons();

  // Load Initial UI state
  updateUI();
  resumePendingCampEntry();
  const view = getScreenViewState(state, null);
  if (view.gameState === "combat" && view.hasCombat && view.hasStructurallyUsableCombatParty) {
    resumeCombat();
  } else if (view.gameState === "combat") {
    // A saved combat without a structurally usable party cannot be resumed.
    // Clear the stale combat payload before returning to the safe base screen.
    state.combatState = null;
    state.gameState = view.hasMap ? "explore" : "town";
    saveAutosave();
    updateUI();
  }
}

function lockViewportScale() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && viewport.getAttribute("content") !== LOCKED_VIEWPORT) {
    viewport.setAttribute("content", LOCKED_VIEWPORT);
  }
  window.scrollTo(0, 0);
}

function scheduleGameLoop() {
  animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function restartGameLoop() {
  stopGameLoop();
  lastTime = null;
  if (renderer) renderer.lastSignature = null;
  scheduleGameLoop();
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    if (state.transitioning === false) saveAutosave();
    stopGameLoop();
    return;
  }
  restartGameLoop();
}

function handlePageShow() {
  lockViewportScale();
  restartGameLoop();
}

function gameLoop(time) {
  animationFrameId = null;
  if (document.visibilityState === "hidden") return;

  const dt = lastTime === null ? 0 : time - lastTime;
  lastTime = time;

  if (renderer) {
    renderer.update(dt);
    // Convert mutable runtime state once at the render boundary. All
    // renderer operations in this tick consume the same read-only input.
    const renderInput = getRendererInput(state, menuContext);
    if (renderer.isAnimating(renderInput)) {
      renderer.draw(renderInput);
      renderer.lastSignature = null;
    } else {
      const signature = renderer.getDrawSignature(renderInput);
      if (signature !== renderer.lastSignature) {
        renderer.draw(renderInput);
        renderer.lastSignature = signature;
      }
    }
  }

  scheduleGameLoop();
}

// ----------------------------------------------------
// BUTTON BINDINGS
// ----------------------------------------------------
function bindButtons() {
  document.getElementById("submenu-controls").addEventListener("click", blockGuardedControlsEvent, true);
  document.getElementById("trap-controls").addEventListener("click", blockGuardedControlsEvent, true);

  // Exploration (pointerdown for touch/mouse, keydown for keyboard focus space/enter)
  const bindPress = (id, action) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handleMove(action);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleMove(action);
        }
      });
    }
  };
  bindPress("btn-turn-left", "turn-left");
  bindPress("btn-move-forward", "forward");
  bindPress("btn-turn-right", "turn-right");
  bindPress("btn-move-backward", "backward");

  document.getElementById("btn-search").addEventListener("click", () => handleExploreAction("search"));
  document.getElementById("btn-inspect").addEventListener("click", () => handleExploreAction("tool"));
  document.getElementById("btn-cast").addEventListener("click", () => handleExploreAction("spell"));
  document.getElementById("btn-item").addEventListener("click", () => handleExploreAction("equip"));
  document.getElementById("btn-explore-management").addEventListener("click", () => handleExploreAction("manage"));

  // Town
  document.getElementById("btn-town-dungeon").addEventListener("click", () => enterDungeon());
  document.getElementById("btn-town-quest-board").addEventListener("click", () => handleTownOption("run_quest_board"));
  document.getElementById("btn-town-castle").addEventListener("click", () => handleTownOption("castle"));
  document.getElementById("btn-town-workshop").addEventListener("click", () => handleTownOption("workshop"));
  document.getElementById("btn-town-archives").addEventListener("click", () => handleTownOption("archives"));

  // Combat actions
  const bindCombatAction = (id, action) => {
    document.getElementById(id).addEventListener("click", () => {
      const view = getScreenViewState(state, null);
      if (view.gameState === "combat" && view.hasCombat) action();
    });
  };
  bindCombatAction("btn-combat-fight", () => selectCombatAction("fight"));
  bindCombatAction("btn-combat-spell", () => selectCombatAction("spell"));
  bindCombatAction("btn-combat-item", () => selectCombatAction("item"));
  bindCombatAction("btn-combat-auto", () => toggleCombatAuto());
  bindCombatAction("btn-combat-defend", () => selectCombatAction("defend"));
  bindCombatAction("btn-combat-run", () => selectCombatAction("run"));
  bindCombatAction("btn-combat-cancel", () => cancelCombatAction());

  // Submenu
  document.getElementById("btn-submenu-back").addEventListener("click", () => goBackSubmenu());

  // Trap actions
  const bindTrapBtn = (id, action) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", () => {
        if (getScreenViewState(state, null).gameState === "trap_encounter") {
          handleTrapAction(action);
        }
      });
    }
  };
  bindTrapBtn("btn-trap-disarm", "disarm");
  bindTrapBtn("btn-trap-force", "force");

  // Mute Button
  const btnMute = document.getElementById("btn-mute");
  if (btnMute) {
    btnMute.addEventListener("click", () => {
      const muted = toggleMute();
      if (muted) {
        btnMute.textContent = "🎵 OFF";
        btnMute.className = "btn btn-mute sound-off";
        btnMute.title = "音声をオンにする";
      } else {
        btnMute.textContent = "🎵 ON";
        btnMute.className = "btn btn-mute sound-on";
        btnMute.title = "ミュートにする";
      }
    });
  }

  // Full-log overlay: expand from the minimal log panel, close back to it.
  const btnLogExpand = document.getElementById("btn-log-expand");
  if (btnLogExpand) {
    btnLogExpand.addEventListener("click", () => openLogOverlay());
  }
  const btnLogOverlayClose = document.getElementById("btn-log-overlay-close");
  if (btnLogOverlayClose) {
    btnLogOverlayClose.addEventListener("click", () => closeLogOverlay());
  }

  // Prevent iOS/PWA pinch, double-tap zoom, and viewport drift during rapid gameplay taps.
  const shouldPreventGesture = (target) => {
    return target && target.closest("#game-container");
  };

  document.addEventListener("gesturestart", (e) => {
    if (shouldPreventGesture(e.target)) e.preventDefault();
  });
  document.addEventListener("gesturechange", (e) => {
    if (shouldPreventGesture(e.target)) e.preventDefault();
  });
  document.addEventListener("gestureend", (e) => {
    if (shouldPreventGesture(e.target)) e.preventDefault();
  });

  // Prevent pinch zoom via multi-touch gestures.
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length > 1 && shouldPreventGesture(e.target)) {
      e.preventDefault();
      lockViewportScale();
    }
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1 && shouldPreventGesture(e.target)) {
      e.preventDefault();
      lockViewportScale();
    }
  }, { passive: false });

  document.addEventListener("dblclick", (e) => {
    if (shouldPreventGesture(e.target)) {
      e.preventDefault();
      lockViewportScale();
    }
  }, { passive: false });

  // Prevent double-tap zoom on non-interactive background elements.
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      const isInteractive = e.target.tagName === "BUTTON" || 
                            e.target.tagName === "A" || 
                            e.target.closest("button") || 
                            e.target.closest(".btn");
      if (!isInteractive && shouldPreventGesture(e.target)) {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  window.addEventListener("resize", lockViewportScale);
  window.addEventListener("orientationchange", lockViewportScale);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", lockViewportScale);
    window.visualViewport.addEventListener("scroll", lockViewportScale);
  }

  // Keyboard navigation for desktop testing
  window.addEventListener("keydown", (e) => {
    if (state.transitioning) return;
    if (getScreenViewState(state, null).gameState === "explore") {
      // キーボード操作はSDKのui.click breadcrumbに乗らないため手動記録する
      const keyMap = {
        ArrowUp: ["move", "forward"], w: ["move", "forward"],
        ArrowDown: ["move", "backward"], s: ["move", "backward"],
        ArrowLeft: ["move", "turn-left"], a: ["move", "turn-left"],
        ArrowRight: ["move", "turn-right"], d: ["move", "turn-right"],
        f: ["action", "search"],
      };
      const entry = keyMap[e.key];
      if (entry) addGameBreadcrumb(entry[0], `key:${entry[1]}`, { floor: state.floor });
      if (e.key === "ArrowUp" || e.key === "w") handleMove("forward");
      if (e.key === "ArrowDown" || e.key === "s") handleMove("backward");
      if (e.key === "ArrowLeft" || e.key === "a") handleMove("turn-left");
      if (e.key === "ArrowRight" || e.key === "d") handleMove("turn-right");
      if (e.key === "f") handleExploreAction("search");
    }
  });
}
