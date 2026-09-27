// Transient notice for rewards that went straight into the bag (#1835).
// When every reward fits, the pending-reward screen is skipped; this badge
// over the dungeon view is the only interruption. The log keeps the record.

export const LOOT_TOAST_MS = 2400;

let hideTimer = null;

function ensureToastElement(panel) {
  let toast = document.getElementById("loot-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "loot-toast";
    toast.className = "loot-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.hidden = true;
  }
  if (toast.parentElement !== panel) panel.appendChild(toast);
  return toast;
}

/** @param {string} message */
export function showLootToast(message) {
  if (typeof document === "undefined" || !message) return;
  const panel = document.getElementById("viewport-panel");
  if (!panel) return;
  const toast = ensureToastElement(panel);
  toast.textContent = message;
  toast.hidden = false;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    toast.hidden = true;
  }, LOOT_TOAST_MS);
}
