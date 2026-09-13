const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let activeSurfaceId = null;
let focusOrigin = null;

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  for (let current = element; current && current !== document; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (current.hidden || current.inert || current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

function isFocusable(element) {
  return isVisible(element) && typeof element.focus === "function" && element.matches(FOCUSABLE_SELECTOR);
}

function findFirstFocusable(surface) {
  return Array.from(surface.querySelectorAll(FOCUSABLE_SELECTOR))
    .find(element => isFocusable(element) && !element.closest('.combat-target-a11y-list')) || null;
}

function focusElement(element) {
  if (!isFocusable(element)) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

function getSurfaceFocusableElements(surface) {
  return Array.from(surface.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);
}

function trapModalTab(event) {
  if (event.key !== "Tab" || !activeSurfaceId) return;
  const surface = document.getElementById(activeSurfaceId);
  if (!surface || surface.getAttribute("aria-modal") !== "true" || !isVisible(surface)) return;

  const focusable = getSurfaceFocusableElements(surface);
  if (focusable.length === 0) return;

  const currentIndex = focusable.indexOf(document.activeElement);
  if (currentIndex === -1) {
    event.preventDefault();
    focusElement(focusable[event.shiftKey ? focusable.length - 1 : 0]);
    return;
  }

  const atBoundary = event.shiftKey
    ? currentIndex === 0
    : currentIndex === focusable.length - 1;
  if (atBoundary) {
    event.preventDefault();
    focusElement(focusable[event.shiftKey ? focusable.length - 1 : 0]);
  }
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("keydown", trapModalTab, true);
}

/** Keep focus in the open decision surface and remember its invoking control. */
export function syncFocusSurface(surfaceId, surface) {
  if (!surface || !isVisible(surface)) return;

  if (activeSurfaceId === surfaceId) {
    if (!surface.contains(document.activeElement) || !isFocusable(document.activeElement)) {
      focusElement(findFirstFocusable(surface));
    }
    return;
  }

  const current = document.activeElement;
  focusOrigin = isFocusable(current) && !current.closest('[role="dialog"]') && !surface.contains(current)
    ? current
    : null;
  activeSurfaceId = surfaceId;
  focusElement(findFirstFocusable(surface));
}

/** Restore a meaningful control after a surface replaces its child DOM. */
export function restoreFocusAfterRender(surfaceId, surface, selector) {
  if (activeSurfaceId !== surfaceId || !surface || !isVisible(surface)) return false;
  const target = selector ? surface.querySelector(selector) : null;
  return focusElement(target) || focusElement(findFirstFocusable(surface));
}

export function releaseFocusSurface(surfaceId, fallbackSelector = null) {
  if (activeSurfaceId !== surfaceId) return false;

  const origin = focusOrigin;
  activeSurfaceId = null;
  focusOrigin = null;

  if (focusElement(origin)) return true;
  if (fallbackSelector && focusElement(document.querySelector(fallbackSelector))) return true;
  const visibleFallback = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR))
    .find(element => !element.closest('[role="dialog"]') && isFocusable(element));
  if (focusElement(visibleFallback)) return true;
  return false;
}

export function getFocusSurfaceState() {
  return { activeSurfaceId, focusOrigin };
}
