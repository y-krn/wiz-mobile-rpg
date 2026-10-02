// balance-impact: none — UI update handoff only; save data is flushed before the user-requested reload.
import { saveAutosave } from "../state.js";

let registration = null;
let updateAvailable = false;
let safeToApply = false;
let reloadRequested = false;
let updateActivated = false;
let initialized = false;

export function isSafePwaUpdateBoundary(view) {
  return view?.gameState === "town" && view.isSubmenu === false && view.hasChest === false;
}

function syncBanner() {
  const banner = document.getElementById("pwa-update-banner");
  if (!banner) return;
  banner.hidden = !(updateAvailable && safeToApply);
}

function refreshWaitingWorker() {
  updateAvailable = Boolean(registration?.waiting && registration.active);
  syncBanner();
}

function reloadWhenSafe() {
  if (!reloadRequested || !updateActivated || !safeToApply) return;
  reloadRequested = false;
  window.location.reload();
}

function onUpdateFound() {
  const worker = registration?.installing;
  if (!worker) return;
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") refreshWaitingWorker();
  });
}

function applyWaitingUpdate() {
  const worker = registration?.waiting;
  if (!worker || !updateAvailable || !safeToApply) return;
  saveAutosave();
  reloadRequested = true;
  worker.addEventListener("statechange", () => {
    if (worker.state === "activated") {
      updateActivated = true;
      reloadWhenSafe();
    }
  });
  worker.postMessage({ type: "APPLY_UPDATE" });
  updateAvailable = false;
  syncBanner();
  const button = document.getElementById("btn-pwa-apply-update");
  if (button) button.disabled = true;
}

export function syncPwaUpdateAvailability(view) {
  safeToApply = isSafePwaUpdateBoundary(view);
  syncBanner();
  reloadWhenSafe();
}

export async function registerPwaServiceWorker() {
  if (initialized || import.meta.env?.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  initialized = true;
  try {
    registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  } catch (error) {
    initialized = false;
    console.warn("Service Worker registration failed", error);
    return null;
  }

  registration.addEventListener("updatefound", onUpdateFound);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updateActivated = true;
    reloadWhenSafe();
  });
  document.getElementById("btn-pwa-apply-update")?.addEventListener("click", applyWaitingUpdate);
  refreshWaitingWorker();

  const checkForUpdate = () => registration?.update().catch(() => {});
  window.addEventListener("focus", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  return registration;
}
