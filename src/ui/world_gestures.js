// Exploration is played on the world itself, not on a control pad.
//   tap the corridor ............ step forward
//   tap near the left/right edge  turn that way
//   swipe ........................ drag the view: up walks on, down steps
//                                  back, sideways looks the other way, and
//                                  a long sideways sweep turns right round
//   press and hold ............... search the spot (a ring of light fills)
//   tap the adventurer's card .... open or close the satchel
// The classic controls stay in the DOM, visually hidden, so keyboard and
// assistive input keep working; only the plain exploration view takes
// gestures, so menus, events, and combat keep their own input.

const SWIPE_MIN_PX = 28;
const HOLD_MS = 520;
const HOLD_SLOP_PX = 12;
const EDGE_ZONE = 0.24;
const TURN_AROUND_SWEEP = 0.55;
const COACH_KEY = "mobile_wiz_rpg_world_gesture_coach_v1";
const COACH_MS = 9000;

function getContainer() {
  return document.getElementById("game-container");
}

function isExploring() {
  return getContainer()?.dataset.exploreHud !== undefined;
}

function isSatchelOpen() {
  return getContainer()?.dataset.satchel === "open";
}

export function setSatchelOpen(open) {
  const container = getContainer();
  const panel = document.getElementById("character-panel");
  if (!container) return;
  if (open) dismissWorldCoach();
  if (open) container.dataset.satchel = "open";
  else delete container.dataset.satchel;
  if (isExploring()) panel?.setAttribute("aria-expanded", open ? "true" : "false");
}

function spawnMark(className, x, y, host) {
  const rect = host.getBoundingClientRect();
  const mark = document.createElement("span");
  mark.className = `world-touch ${className}`;
  mark.style.left = `${x - rect.left}px`;
  mark.style.top = `${y - rect.top}px`;
  host.appendChild(mark);
  mark.addEventListener("animationend", () => mark.remove(), { once: true });
  // Reduced motion has no animationend; never leave marks behind.
  setTimeout(() => mark.remove(), 1200);
  return mark;
}

// A touch answer drawn on the world at a screen point (used by combat too).
export function markWorldTouch(className, x, y) {
  const host = document.getElementById("viewport-panel");
  if (host) spawnMark(className, x, y, host);
}

function bindWorldGestures({ canvas, host, onMove, onSearch }) {
  let press = null;

  const clearPress = () => {
    if (press?.timer) clearTimeout(press.timer);
    press?.ring?.remove();
    press = null;
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || !isExploring()) return;
    if (isSatchelOpen()) {
      setSatchelOpen(false);
      return;
    }
    clearPress();
    const ring = spawnMark("world-touch--hold", event.clientX, event.clientY, host);
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ring,
      held: false,
      timer: setTimeout(() => {
        if (!press || !isExploring()) {
          clearPress();
          return;
        }
        press.held = true;
        press.ring?.remove();
        spawnMark("world-touch--search", press.x, press.y, host);
        onSearch();
      }, HOLD_MS)
    };
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!press || press.id !== event.pointerId || press.held) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_SLOP_PX) {
      clearTimeout(press.timer);
      press.timer = null;
      press.ring?.remove();
      press.ring = null;
    }
  });

  canvas.addEventListener("pointercancel", clearPress);

  canvas.addEventListener("pointerup", (event) => {
    const origin = press;
    if (!origin || origin.id !== event.pointerId) return;
    const held = origin.held;
    clearPress();
    if (held || !isExploring()) return;
    event.preventDefault();
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN_PX) {
      const width = canvas.getBoundingClientRect().width || 1;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        onMove(Math.abs(dx) >= width * TURN_AROUND_SWEEP ? "turn-around" : dx < 0 ? "turn-right" : "turn-left");
      }
      else if (Math.abs(dy) > Math.abs(dx) * 1.2) onMove(dy < 0 ? "forward" : "backward");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const across = (event.clientX - rect.left) / Math.max(1, rect.width);
    const action = across < EDGE_ZONE ? "turn-left" : across > 1 - EDGE_ZONE ? "turn-right" : "forward";
    spawnMark(`world-touch--tap world-touch--${action}`, event.clientX, event.clientY, host);
    onMove(action);
  });
}

function bindSatchel() {
  const panel = document.getElementById("character-panel");
  const satchel = document.getElementById("explore-satchel");
  if (!panel || !satchel) return;
  panel.addEventListener("click", () => {
    if (!isExploring()) return;
    setSatchelOpen(!isSatchelOpen());
  });
  panel.addEventListener("keydown", (event) => {
    if (!isExploring() || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    setSatchelOpen(!isSatchelOpen());
  });
  // Choosing anything from the satchel puts it away.
  satchel.addEventListener("click", () => setSatchelOpen(false));
}

// A first-descent hint that never takes input: the first touch already
// plays, and the hint leaves once the player has moved or after a while.
let coachTimer = null;

export function dismissWorldCoach() {
  const coach = document.querySelector(".world-coach");
  if (!coach) return;
  try {
    localStorage.setItem(COACH_KEY, "1");
  } catch {
    // Private mode: the hint simply shows again next visit.
  }
  clearTimeout(coachTimer);
  coach.remove();
}

function showCoachOnce(host) {
  try {
    if (localStorage.getItem(COACH_KEY) === "1") return;
  } catch {
    // Storage blocked: show the hint for this page only.
  }
  const coach = document.createElement("div");
  coach.className = "world-coach";
  coach.setAttribute("role", "note");
  coach.setAttribute("aria-label", "迷宮での動き方");
  coach.innerHTML = `
    <p class="world-coach-title">迷宮では、景色に触れて進む</p>
    <ul class="world-coach-list">
      <li><span class="world-coach-glyph" data-glyph="tap"></span>通路をタップ<em>一歩進む</em></li>
      <li><span class="world-coach-glyph" data-glyph="edge"></span>左右の端をタップ / 横にスワイプ<em>振り向く（大きく払うと後ろを向く）</em></li>
      <li><span class="world-coach-glyph" data-glyph="down"></span>下にスワイプ<em>一歩下がる</em></li>
      <li><span class="world-coach-glyph" data-glyph="hold"></span>長押し<em>その場を調べる</em></li>
      <li><span class="world-coach-glyph" data-glyph="satchel"></span>自分の札をタップ<em>持ち物・魔法・装備</em></li>
    </ul>`;
  host.appendChild(coach);
  coachTimer = setTimeout(dismissWorldCoach, COACH_MS);
}

export function initWorldGestures({ onMove, onSearch }) {
  const canvas = document.getElementById("dungeon-canvas");
  const host = document.getElementById("viewport-panel");
  if (!canvas || !host) return;
  bindWorldGestures({
    canvas,
    host,
    onMove: (action) => {
      dismissWorldCoach();
      onMove(action);
    },
    onSearch: () => {
      dismissWorldCoach();
      onSearch();
    }
  });
  bindSatchel();
  // The coach appears the first time the world takes gestures.
  const container = getContainer();
  if (!container || typeof MutationObserver !== "function") return;
  const panel = document.getElementById("character-panel");
  // The card is a control only while exploring; elsewhere it is plain status.
  const syncCardRole = () => {
    if (!panel) return;
    if (isExploring()) {
      panel.setAttribute("role", "button");
      panel.setAttribute("tabindex", "0");
      panel.setAttribute("aria-controls", "explore-satchel");
      panel.setAttribute("aria-label", "冒険者の状態。持ち物袋を開く");
    } else {
      panel.removeAttribute("role");
      panel.removeAttribute("tabindex");
      panel.removeAttribute("aria-controls");
      panel.removeAttribute("aria-expanded");
      panel.setAttribute("aria-label", "冒険者の状態");
    }
  };
  syncCardRole();
  const observer = new MutationObserver(() => {
    syncCardRole();
    if (!isExploring()) {
      if (isSatchelOpen()) setSatchelOpen(false);
      document.querySelector(".world-coach")?.remove();
      host.querySelectorAll(".world-touch").forEach((mark) => mark.remove());
      return;
    }
    if (!host.querySelector(".world-coach")) showCoachOnce(host);
  });
  observer.observe(container, { attributes: true, attributeFilter: ["data-explore-hud"] });
}
