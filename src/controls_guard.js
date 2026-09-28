import { state } from "./state.js";

// Long enough to absorb the tail of the tap that caused the transition (a
// repeated forward tap or the move that sprung a trap) without making the next
// screen feel sluggish.
export const CONTROLS_GUARD_MS = 350;

// Docks whose clicks blockGuardedControlsEvent swallows. They are marked while
// the guard is active so a swallowed tap never looks like a live button.
const GUARDED_DOCK_IDS = ["submenu-controls", "trap-controls"];
let releaseTimer = null;

function syncGuardedDocks(now) {
  // Node tests stub a partial document; only real DOM docks are marked.
  if (typeof document === "undefined" || typeof Element === "undefined") return;
  const guarded = isControlsGuarded(now);
  for (const id of GUARDED_DOCK_IDS) {
    const dock = document.getElementById(id);
    if (!(dock instanceof Element)) continue;
    if (guarded) {
      dock.setAttribute("data-input-guard", "active");
      dock.setAttribute("aria-busy", "true");
    } else {
      dock.removeAttribute("data-input-guard");
      dock.removeAttribute("aria-busy");
    }
  }
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  releaseTimer = guarded
    ? setTimeout(() => {
      releaseTimer = null;
      syncGuardedDocks(performance.now());
    }, Math.max(0, state.controlsGuardUntil - now))
    : null;
}

export function armControlsGuard(now = performance.now()) {
  state.controlsGuardUntil = now + CONTROLS_GUARD_MS;
  syncGuardedDocks(now);
}

export function isControlsGuarded(now = performance.now()) {
  return now < (state.controlsGuardUntil || 0);
}

export function blockGuardedControlsEvent(event) {
  if (!isControlsGuarded() || !event.target.closest("button")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
