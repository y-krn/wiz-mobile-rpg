import { loadGame, saveAutosave, state } from "./state.js";
import { initErrorContext } from "./error_context.js";
import { addGameBreadcrumb, captureException } from "./sentry.js";
import { DungeonRenderer, setDungeonRenderer } from "./renderer.js";
import { toggleMute } from "./audio.js";
import { setUiUpdateCallback, goBackSubmenu, menuContext } from "./navigation.js";
import { handleTrapAction } from "./systems/traps.js";
import { blockGuardedControlsEvent } from "./controls_guard.js";
import { openChestMenu } from "./chest.js";
import { getScreenViewState } from "./state/view_state.js";
import { getRendererInput } from "./state/renderer_view.js";
import { hasPendingRewardBundle, openPendingRewardMenu } from "./pending_rewards.js";
import {
  createRendererSelectionState,
  getInjectedFailurePhase,
  selectCanvasFallback,
  selectRenderer
} from "./renderer_selection.js";

// Import modules for re-export and button bindings
import { updateUI, openLogOverlay, closeLogOverlay } from "./ui.js";
import { handleMove, enterDungeon, resumePendingCampEntry } from "./movement.js";
import { handleExploreAction, handleTownOption } from "./menu.js";
import { selectCombatAction, cancelCombatAction, toggleCombatAuto, repeatLastCombatAction, resumeCombat } from "./combat.js";
import { commitCombatTarget } from "./combat_ui/combat_overlay.js";

// Re-exports for external use and backward compatibility
export { updateUI } from "./ui.js";
export { handleMove, enterDungeon } from "./movement.js";
export { handleExploreAction, handleTownOption } from "./menu.js";
export { goBackSubmenu } from "./navigation.js";
export { selectCombatAction, cancelCombatAction, resolveCombatRound, triggerGameOver, toggleCombatAuto } from "./combat.js";

let renderer = null;
let rendererSelection = createRendererSelectionState("");
let buttonsBound = false;
let animationFrameId = null;
let lastTime = null;
const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";

function reportRendererRecovery(error, selection, reason, pixiPhase) {
  captureException(error, {
    level: "warning",
    tags: {
      subsystem: "renderer",
      requested_renderer: selection.requestedRenderer,
      selected_renderer: "canvas",
      fallback_occurred: "true",
      fallback_reason: reason,
      pixi_phase: pixiPhase || "unknown",
      recovery: "canvas-fallback",
    },
    extra: {
      renderer: {
        requestedRenderer: selection.requestedRenderer,
        selectedRenderer: "canvas",
        fallbackOccurred: true,
        fallbackReason: reason,
        pixiPhase: pixiPhase || null
      }
    }
  });
}

export function getRendererSelectionState() {
  return Object.freeze({ ...rendererSelection });
}

function replaceDungeonCanvas() {
  const current = document.getElementById("dungeon-canvas");
  if (!current) return;
  const replacement = current.cloneNode(false);
  replacement.removeAttribute("data-renderer");
  current.replaceWith(replacement);
}

function mountCanvasFallback(selection, candidate, reason, pixiPhase, error) {
  try {
    candidate?.dispose?.();
  } catch {
    // The failed candidate is already unusable. Replacing its view below
    // guarantees that a partially created WebGL context cannot block Canvas.
  }
  replaceDungeonCanvas();
  renderer = new DungeonRenderer("dungeon-canvas");
  rendererSelection = selectCanvasFallback(selection, { reason, pixiPhase });
  reportRendererRecovery(error, rendererSelection, reason, pixiPhase);
  setDungeonRenderer(renderer);
}

function assertInjectedFailure(phase) {
  if (getInjectedFailurePhase(window) !== phase) return;
  throw new Error(`Injected renderer failure: ${phase}`);
}

export function initGame() {
  setUiUpdateCallback(updateUI);
  lockViewportScale();
  loadGame();
  if (state.chestState?.fromDrop) openChestMenu();
  else if (hasPendingRewardBundle()) openPendingRewardMenu();

  // エラー発生時にゲーム状態をSentryへ添付できるよう登録（stateはロード済み）
  initErrorContext(state);

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", stopGameLoop);
  window.addEventListener("pageshow", handlePageShow);

  // Keep the existing input surface responsive while the production Pixi
  // chunk initializes. No renderer is drawn here, so this cannot create a
  // Canvas-then-Pixi startup flash.
  updateUI();
  bindButtons();

  rendererSelection = createRendererSelectionState(window.location.search);
  const start = () => {
    document.getElementById("viewport-panel")?.setAttribute("data-renderer", renderer?.mode || "canvas");
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
    // Render the first Dungeon View before exposing the controls or starting
    // the loop. Dynamic Pixi loading therefore cannot show a Canvas flash.
    const renderInput = getRendererInput(state, menuContext);
    renderer?.draw?.(renderInput);
    renderer.lastSignature = renderer?.getDrawSignature?.(renderInput) ?? null;
    scheduleGameLoop();
  };

  if (rendererSelection.requestedRenderer === "pixi") {
    const failurePhase = getInjectedFailurePhase(window);
    (async () => {
      let candidate = null;
      try {
        assertInjectedFailure("import");
        const { PixiDungeonRenderer } = await import("./pixi_renderer.js");
        candidate = new PixiDungeonRenderer("dungeon-canvas", { failurePhase });
        await candidate.init();
        if (candidate.supported) {
          renderer = candidate;
          rendererSelection = selectRenderer(rendererSelection, "pixi");
          setDungeonRenderer(renderer);
          candidate.initializationPhase = "mount";
          assertInjectedFailure("mount");
          candidate.initializationPhase = "initial-render";
          assertInjectedFailure("initial-render");
          start();
          candidate.initializationPhase = null;
          return;
        } else {
          mountCanvasFallback(rendererSelection, candidate, "pixi-unsupported", "canvas/context", new Error("Pixi renderer is unsupported"));
        }
      } catch (error) {
        const injectedPhase = getInjectedFailurePhase(window);
        const pixiPhase = injectedPhase || candidate?.initializationPhase || "import";
        const reason = pixiPhase === "import"
          ? "pixi-import-failed"
          : pixiPhase === "mount"
            ? "pixi-mount-failed"
            : pixiPhase === "initial-render"
              ? "pixi-initial-render-failed"
              : "pixi-init-failed";
        mountCanvasFallback(rendererSelection, candidate, reason, pixiPhase, error);
      }
      start();
    })();
    return;
  }

  renderer = new DungeonRenderer("dungeon-canvas");
  rendererSelection = selectRenderer(rendererSelection, "canvas");
  setDungeonRenderer(renderer);
  start();
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
  if (buttonsBound) return;
  buttonsBound = true;
  document.getElementById("submenu-controls").addEventListener("click", blockGuardedControlsEvent, true);
  document.getElementById("trap-controls").addEventListener("click", blockGuardedControlsEvent, true);

  const canvas = document.getElementById("dungeon-canvas");
  if (canvas) {
    canvas.addEventListener("pointerdown", (event) => {
      const view = getScreenViewState(state, menuContext);
      if (!view.isUsableCombatOverlaySubmenu || menuContext.type !== "combat_target" || menuContext.targetType !== "enemy") return;
      const targetIdx = renderer?.getCombatTargetAtClientPoint(
        event.clientX,
        event.clientY,
        getRendererInput(state, menuContext)
      );
      if (!Number.isInteger(targetIdx)) return;
      event.preventDefault();
      commitCombatTarget(targetIdx);
    });
  }

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
  bindCombatAction("btn-combat-repeat", () => repeatLastCombatAction());
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

  // Keep the viewport metadata stable across browser UI changes without
  // intercepting pinch/double-tap gestures that users may need for zoom.
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
