// Transient, non-persistent feedback for a blocked step (#1741).
// A wall or one-way bump used to be sound-only; muted players saw nothing.
// The cue is a short text badge over the dungeon view plus a view nudge.
// The nudge is CSS-only and is disabled under prefers-reduced-motion, so the
// text badge alone carries the message there. It never touches the log, so
// repeated bumps neither spam history nor re-open the explore HUD.

export const MOVE_BLOCKED_CUE_MS = 900;

const CUE_TEXT = Object.freeze({
  wall: "壁に阻まれた",
  "one-way": "一方通行 ─ 進めない"
});

let hideTimer = null;

function ensureCueElement(panel) {
  let cue = document.getElementById("move-blocked-cue");
  if (!cue) {
    cue = document.createElement("div");
    cue.id = "move-blocked-cue";
    cue.className = "move-blocked-cue";
    cue.setAttribute("role", "status");
    cue.hidden = true;
  }
  if (cue.parentElement !== panel) panel.appendChild(cue);
  return cue;
}

/** @param {"wall"|"one-way"} reason */
export function showMoveBlockedCue(reason) {
  if (typeof document === "undefined") return;
  const panel = document.getElementById("viewport-panel");
  if (!panel) return;
  const cue = ensureCueElement(panel);
  cue.textContent = CUE_TEXT[reason] || CUE_TEXT.wall;
  cue.hidden = false;
  panel.dataset.moveBlocked = reason;
  panel.dataset.moveBlockedCount = String(Number(panel.dataset.moveBlockedCount || 0) + 1);
  // Restart the nudge on every press so rapid taps each read as a rejection.
  panel.classList.remove("is-move-blocked");
  void panel.offsetWidth;
  panel.classList.add("is-move-blocked");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    cue.hidden = true;
    panel.classList.remove("is-move-blocked");
    delete panel.dataset.moveBlocked;
  }, MOVE_BLOCKED_CUE_MS);
}
