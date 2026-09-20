import { loadGame, saveAutosave, state } from "./state.js";
import { initErrorContext } from "./error_context.js";
import { addGameBreadcrumb, captureException } from "./sentry.js";
import { setDungeonRenderer } from "./renderer_runtime.js";
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
  selectRenderer,
  selectRendererFailure
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
let rendererReady = false;
let rendererFailureActive = false;
let rendererRetryActive = false;
const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";

function reportRendererFailure(error, selection, reason, phase) {
  captureException(error, {
    level: "warning",
    tags: {
      subsystem: "renderer",
      requested_renderer: selection.requestedRenderer,
      selected_renderer: "pixi",
      renderer_failure: "true",
      failure_reason: reason,
      failure_phase: phase || "unknown",
      recovery: "safe-ui",
    },
    extra: {
      renderer: {
        requestedRenderer: selection.requestedRenderer,
        selectedRenderer: "pixi",
        failureOccurred: true,
        failureReason: reason,
        failurePhase: phase || null
      }
    }
  });
}

export function getRendererSelectionState() {
  return Object.freeze({ ...rendererSelection });
}

function setRendererControlsEnabled(enabled) {
  rendererReady = enabled;
  const controls = document.getElementById("controls-panel");
  if (!controls) return;
  controls.hidden = !enabled;
  controls.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function showRendererFailure(error, reason, phase) {
  stopGameLoop();
  rendererReady = false;
  rendererFailureActive = true;
  setRendererControlsEnabled(false);
  try {
    renderer?.dispose?.();
  } catch {
    // Safe UI remains independent of renderer cleanup.
  }
  renderer = null;
  setDungeonRenderer(renderer);
  document.getElementById("dungeon-canvas")?.removeAttribute("data-renderer");
  document.getElementById("viewport-panel")?.removeAttribute("data-renderer");
  rendererSelection = selectRendererFailure(rendererSelection, { reason, phase });
  reportRendererFailure(error, rendererSelection, reason, phase);

  const panel = document.getElementById("viewport-panel");
  if (!panel) return;
  document.getElementById("renderer-safe-ui")?.remove();
  const safeUi = document.createElement("section");
  safeUi.id = "renderer-safe-ui";
  safeUi.setAttribute("role", "alertdialog");
  safeUi.setAttribute("aria-labelledby", "renderer-safe-ui-title");
  safeUi.setAttribute("aria-live", "assertive");
  safeUi.innerHTML = `
    <h2 id="renderer-safe-ui-title">迷宮画面を読み込めない</h2>
    <p>画面を再試行するか、ページを再読み込み。</p>
    <div class="renderer-safe-ui-actions">
      <button id="renderer-retry" class="btn btn-neon" type="button">再試行</button>
      <button id="renderer-reload" class="btn btn-secondary" type="button">再読み込み</button>
    </div>
  `;
  panel.appendChild(safeUi);
  safeUi.querySelector("#renderer-retry")?.focus();
  safeUi.querySelector("#renderer-retry")?.addEventListener("click", () => {
    if (rendererRetryActive || !rendererFailureActive) return;
    rendererRetryActive = true;
    safeUi.querySelector("#renderer-retry")?.setAttribute("disabled", "true");
    rendererFailureActive = false;
    safeUi.remove();
    const currentCanvas = document.getElementById("dungeon-canvas");
    if (currentCanvas) {
      const replacement = currentCanvas.cloneNode(false);
      currentCanvas.replaceWith(replacement);
      bindCanvasTargeting(replacement);
    }
    startPixiRenderer();
  });
  safeUi.querySelector("#renderer-reload")?.addEventListener("click", () => window.location.reload());
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

  // Keep controls inert until Pixi completes its first successful render.
  setRendererControlsEnabled(false);
  updateUI();
  bindButtons();

  rendererSelection = createRendererSelectionState(window.location.search);
  startPixiRenderer();
}

function startPixiRenderer() {
  const failurePhase = getInjectedFailurePhase(window);
  (async () => {
    let candidate = null;
    try {
      assertInjectedFailure("import");
      const { PixiDungeonRenderer } = await import("./pixi_renderer.js");
      candidate = new PixiDungeonRenderer("dungeon-canvas", { failurePhase });
      await candidate.init();
      candidate.initializationPhase = "unsupported";
      assertInjectedFailure("unsupported");
      if (!candidate.supported) {
        throw new Error("Pixi renderer is unsupported");
      }
      candidate.initializationPhase = null;
      renderer = candidate;
      rendererSelection = selectRenderer(rendererSelection);
      setDungeonRenderer(renderer);
      candidate.initializationPhase = "mount";
      assertInjectedFailure("mount");
      candidate.initializationPhase = "initial-render";
      assertInjectedFailure("initial-render");
      start();
      candidate.initializationPhase = null;
      rendererFailureActive = false;
      rendererRetryActive = false;
    } catch (error) {
      const injectedPhase = getInjectedFailurePhase(window);
      const phase = injectedPhase || candidate?.initializationPhase || "import";
      const reason = phase === "import"
        ? "pixi-import-failed"
        : phase === "mount"
          ? "pixi-mount-failed"
          : phase === "initial-render"
            ? "pixi-initial-render-failed"
            : phase === "unsupported"
              ? "pixi-unsupported"
            : phase === "runtime"
              ? "pixi-runtime-failed"
              : "pixi-init-failed";
      try {
        candidate?.dispose?.();
      } catch {
        // Safe UI remains independent of renderer cleanup.
      }
      showRendererFailure(error, reason, phase);
      rendererRetryActive = false;
    }
  })();
}

function start() {
    document.getElementById("viewport-panel")?.setAttribute("data-renderer", renderer?.mode || "pixi");
    resumePendingCampEntry();
    const view = getScreenViewState(state, null);
    if (view.gameState === "combat" && view.hasCombat && view.hasStructurallyUsableCombatParty) {
      resumeCombat();
    } else if (view.gameState === "combat") {
      state.combatState = null;
      state.gameState = view.hasMap ? "explore" : "town";
      saveAutosave();
    }
    const renderInput = getRendererInput(state, menuContext);
    renderer?.draw?.(renderInput);
    renderer.lastSignature = renderer?.getDrawSignature?.(renderInput) ?? null;
    setRendererControlsEnabled(true);
    updateUI();
    scheduleGameLoop();
}

function lockViewportScale() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && viewport.getAttribute("content") !== LOCKED_VIEWPORT) {
    viewport.setAttribute("content", LOCKED_VIEWPORT);
  }
  window.scrollTo(0, 0);
}

function resizeRenderer() {
  if (!renderer?.resize) return;
  renderer.resize();
  renderer.lastSignature = null;
}

function scheduleGameLoop() {
  if (!rendererReady || rendererFailureActive || animationFrameId !== null) return;
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
  if (!rendererFailureActive) scheduleGameLoop();
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

  if (renderer && rendererReady) {
    try {
      assertInjectedFailure("runtime");
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
    } catch (error) {
      showRendererFailure(error, "pixi-runtime-failed", "runtime");
      return;
    }
  }

  scheduleGameLoop();
}

// ----------------------------------------------------
// BUTTON BINDINGS
// ----------------------------------------------------
function bindCanvasTargeting(canvas) {
  if (!canvas) return;
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

function bindButtons() {
  if (buttonsBound) return;
  buttonsBound = true;
  document.getElementById("submenu-controls").addEventListener("click", blockGuardedControlsEvent, true);
  document.getElementById("trap-controls").addEventListener("click", blockGuardedControlsEvent, true);

  bindCanvasTargeting(document.getElementById("dungeon-canvas"));

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
  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("orientationchange", lockViewportScale);
  window.addEventListener("orientationchange", resizeRenderer);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", lockViewportScale);
    window.visualViewport.addEventListener("resize", resizeRenderer);
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
