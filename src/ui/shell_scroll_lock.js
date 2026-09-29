// Town home scrolls #game-container itself (#1830). Full-shell overlays stay
// absolutely positioned (a position: fixed overlay inside that scroller loses
// touch scrolling on iOS WebKit), so while one is open the shell is parked at
// the top and locked, then restored to where the player was on close.
const owners = new Set();
let savedScrollTop = 0;

export function lockShellScroll(owner) {
  const container = document.getElementById("game-container");
  if (!container || owners.has(owner)) return;
  if (owners.size === 0) {
    savedScrollTop = container.scrollTop;
    container.scrollTop = 0;
    container.classList.add("shell-scroll-locked");
  }
  owners.add(owner);
}

export function unlockShellScroll(owner) {
  const container = document.getElementById("game-container");
  if (!container || !owners.delete(owner) || owners.size > 0) return;
  container.classList.remove("shell-scroll-locked");
  // Only the town home scrolls the shell; other screens start at the top.
  if (container.classList.contains("town-home-mode")) container.scrollTop = savedScrollTop;
  savedScrollTop = 0;
}
