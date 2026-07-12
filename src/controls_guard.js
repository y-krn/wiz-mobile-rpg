import { state } from "./state.js";

export const CONTROLS_GUARD_MS = 350;

export function armControlsGuard(now = performance.now()) {
  state.controlsGuardUntil = now + CONTROLS_GUARD_MS;
}

export function isControlsGuarded(now = performance.now()) {
  return now < (state.controlsGuardUntil || 0);
}

export function blockGuardedControlsEvent(event) {
  if (!isControlsGuarded() || !event.target.closest("button")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
