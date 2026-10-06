import { state } from "../state.js";
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { captureException } from "../sentry.js";
import { getExplorationRecoveryOutlook } from "../systems/exploration_recovery.js";

const reportedStatFallbacks = new Set();

function reportStatFallback(error, stat) {
  if (reportedStatFallbacks.has(stat)) return;
  reportedStatFallbacks.add(stat);
  captureException(error, {
    level: "warning",
    tags: {
      subsystem: "ui",
      op: "solo-hud-stat",
      recovery: "use-stored-stat",
      stat
    }
  });
}

// The share of a bar that walking unvisited cells can still refill on this
// floor (#1993). A HUD refresh must never fail on it.
function getRecoveryReserve(showExplorationRecovery) {
  if (!showExplorationRecovery) return null;
  try {
    return getExplorationRecoveryOutlook(state);
  } catch (error) {
    reportStatFallback(error, "explorationRecovery");
    return null;
  }
}

export function updateSoloHUD({ showExplorationRecovery = false } = {}) {
  const hud = document.getElementById("character-hud");
  if (!hud) return;
  hud.replaceChildren();

  const char = Array.isArray(state.party) ? state.party[0] : null;
  if (!char) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "冒険者未選択";
    hud.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "character-card";
  let maxHp;
  let maxMp;
  try {
    maxHp = getCharMaxHp(char);
  } catch (error) {
    reportStatFallback(error, "maxHp");
    maxHp = Math.max(1, Number(char.maxHp) || 1);
  }
  try {
    maxMp = getCharMaxMp(char);
  } catch (error) {
    reportStatFallback(error, "maxMp");
    maxMp = Math.max(0, Number(char.maxMp) || 0);
  }
  const clampPercent = value => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const hpPct = clampPercent(maxHp > 0 ? (char.hp / maxHp) * 100 : 0);
  const mpPct = clampPercent(maxMp > 0 ? (char.mp / maxMp) * 100 : 0);

  const identity = document.createElement("div");
  identity.className = "character-identity";
  const name = document.createElement("strong");
  name.textContent = char.name;
  // Level and status share the line under the name, so the status badge
  // never sits on top of the HP and MP numbers.
  const meta = document.createElement("div");
  meta.className = "character-meta";
  const level = document.createElement("span");
  level.textContent = `Lv.${char.level}`;
  meta.appendChild(level);
  if (char.status !== "ok") {
    const status = document.createElement("span");
    status.className = `character-status ${char.status}`;
    status.textContent = char.status.toUpperCase();
    meta.appendChild(status);
  }
  identity.appendChild(name);
  identity.appendChild(meta);

  const vitals = document.createElement("div");
  vitals.className = "character-vitals";
  const reserve = getRecoveryReserve(showExplorationRecovery);
  const createVitalRow = (kind, labelText, current, maximum, percent, hidden = false) => {
    const row = document.createElement("div");
    row.className = `bar-container ${kind}-row`;
    row.hidden = hidden;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = labelText;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = `bar-fill ${kind}`;
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);
    // Striped stretch after the fill: what exploring this floor can still restore.
    const reservePoints = reserve?.[kind] || 0;
    if (reservePoints > 0 && maximum > 0) {
      const reserveFill = document.createElement("div");
      reserveFill.className = `bar-reserve ${kind}`;
      reserveFill.style.width = `${Math.min(100 - percent, clampPercent((reservePoints / maximum) * 100))}%`;
      bar.appendChild(reserveFill);
      if (row.dataset) row.dataset.recoveryReserve = String(reservePoints);
      const note = document.createElement("span");
      note.className = "sr-only";
      note.textContent = `この階を歩けば、あと${reservePoints}回復できる`;
      row.appendChild(note);
    }
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${current}/${maximum}`;
    row.appendChild(label);
    row.appendChild(bar);
    row.appendChild(value);
    return row;
  };
  vitals.appendChild(createVitalRow("hp", "HP", char.hp, maxHp, hpPct));
  vitals.appendChild(createVitalRow("mp", "MP", char.mp, maxMp, mpPct, maxMp <= 0));
  card.appendChild(identity);
  card.appendChild(vitals);
  hud.appendChild(card);
}

// A hit on the party shows a damage badge and a red frame on the HUD card, so
// damage taken reads as an event and not only as a shorter HP bar. The badge
// lives on the persistent #character-hud element because updateSoloHUD()
// rebuilds the card on every UI refresh.
const HUD_HIT_MS = Object.freeze({ standard: 1100, reduced: 1600 });
let hudHitTimer = null;

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function showSoloHudHit(amount) {
  const hud = document.getElementById("character-hud");
  if (!hud) return;
  hud.dataset.hitDamage = `-${amount}`;
  hud.classList.remove("is-hit");
  // Restart the CSS animation when hits arrive back to back.
  void hud.offsetWidth;
  hud.classList.add("is-hit");
  clearTimeout(hudHitTimer);
  hudHitTimer = setTimeout(() => {
    hud.classList.remove("is-hit");
    delete hud.dataset.hitDamage;
  }, prefersReducedMotion() ? HUD_HIT_MS.reduced : HUD_HIT_MS.standard);
}
