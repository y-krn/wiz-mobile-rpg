import { loadGame, state } from "./state.js";
import { DungeonRenderer, setDungeonRenderer } from "./renderer.js";
import { toggleMute } from "./audio.js";

// Import modules for re-export and button bindings
import { updateUI } from "./ui.js";
import { handleMove, enterDungeon } from "./movement.js";
import { handleExploreAction, handleTownOption, goBackSubmenu } from "./menu.js";
import { selectCombatAction, cancelCombatAction, toggleCombatAuto } from "./combat.js";

// Re-exports for external use and backward compatibility
export { updateUI } from "./ui.js";
export { handleMove, enterDungeon } from "./movement.js";
export { handleExploreAction, handleTownOption, goBackSubmenu } from "./menu.js";
export { selectCombatAction, cancelCombatAction, resolveCombatRound, triggerGameOver, toggleCombatAuto } from "./combat.js";

let renderer = null;
let lastTime = 0;
const LOCKED_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover";

export function initGame() {
  lockViewportScale();
  loadGame();
  
  renderer = new DungeonRenderer("dungeon-canvas");
  setDungeonRenderer(renderer);
  
  // Set up animation/render loop
  requestAnimationFrame(gameLoop);

  // Bind Buttons
  bindButtons();

  // Load Initial UI state
  updateUI();
}

function lockViewportScale() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && viewport.getAttribute("content") !== LOCKED_VIEWPORT) {
    viewport.setAttribute("content", LOCKED_VIEWPORT);
  }
  window.scrollTo(0, 0);
}

function gameLoop(time) {
  const dt = time - lastTime;
  lastTime = time;

  if (renderer) {
    renderer.update(dt);
    renderer.draw();
  }

  requestAnimationFrame(gameLoop);
}

// ----------------------------------------------------
// BUTTON BINDINGS
// ----------------------------------------------------
function bindButtons() {
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

  document.getElementById("btn-inspect").addEventListener("click", () => handleExploreAction("search"));
  document.getElementById("btn-cast").addEventListener("click", () => handleExploreAction("spell"));
  document.getElementById("btn-item").addEventListener("click", () => handleExploreAction("item"));
  document.getElementById("btn-camp").addEventListener("click", () => handleExploreAction("camp"));

  // Town
  document.getElementById("btn-town-dungeon").addEventListener("click", () => enterDungeon());
  document.getElementById("btn-town-castle").addEventListener("click", () => handleTownOption("castle"));
  document.getElementById("btn-town-shop").addEventListener("click", () => handleTownOption("shop"));
  document.getElementById("btn-town-temple").addEventListener("click", () => handleTownOption("temple"));
  document.getElementById("btn-town-training").addEventListener("click", () => handleTownOption("training"));
  document.getElementById("btn-town-camp").addEventListener("click", () => handleTownOption("camp"));
  document.getElementById("btn-town-archives").addEventListener("click", () => handleTownOption("archives"));

  // Combat actions
  document.getElementById("btn-combat-fight").addEventListener("click", () => selectCombatAction("fight"));
  document.getElementById("btn-combat-spell").addEventListener("click", () => selectCombatAction("spell"));
  document.getElementById("btn-combat-item").addEventListener("click", () => selectCombatAction("item"));
  document.getElementById("btn-combat-auto").addEventListener("click", () => toggleCombatAuto());
  document.getElementById("btn-combat-defend").addEventListener("click", () => selectCombatAction("defend"));
  document.getElementById("btn-combat-run").addEventListener("click", () => selectCombatAction("run"));
  document.getElementById("btn-combat-cancel").addEventListener("click", () => cancelCombatAction());

  // Submenu
  document.getElementById("btn-submenu-back").addEventListener("click", () => goBackSubmenu());

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

  window.addEventListener("pageshow", lockViewportScale);
  window.addEventListener("resize", lockViewportScale);
  window.addEventListener("orientationchange", lockViewportScale);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", lockViewportScale);
    window.visualViewport.addEventListener("scroll", lockViewportScale);
  }

  // Keyboard navigation for desktop testing
  window.addEventListener("keydown", (e) => {
    if (state.transitioning) return;
    if (state.gameState === "explore") {
      if (e.key === "ArrowUp" || e.key === "w") handleMove("forward");
      if (e.key === "ArrowDown" || e.key === "s") handleMove("backward");
      if (e.key === "ArrowLeft" || e.key === "a") handleMove("turn-left");
      if (e.key === "ArrowRight" || e.key === "d") handleMove("turn-right");
      if (e.key === "f") handleExploreAction("search");
    }
  });
}
