// Victory result band (#1840). Condenses experience, materials, first-kill
// rewards, drops, and level-ups into one glanceable card over the dungeon
// view. It never blocks input: a tap closes it and it auto-hides otherwise.
// The combat log keeps the full record.

export const VICTORY_TOAST_MS = 3200;
export const VICTORY_TOAST_LEVEL_UP_MS = 4800;

let hideTimer = null;

function formatMaterials(materials) {
  return Object.entries(materials || {})
    .filter(([, qty]) => qty > 0)
    .map(([mat, qty]) => `${mat} x${qty}`)
    .join("、");
}

/**
 * Pure formatter so the summary contract stays unit-testable.
 * @param {{ exp?: number, materials?: Record<string, number>,
 *   firstKillMaterials?: Record<string, number>, bonusTickets?: number,
 *   items?: string[], levelUps?: Array<{ name: string, levelBefore: number,
 *   level: number, maxHpBefore: number, maxHp: number }> }} summary
 */
export function formatVictorySummary(summary) {
  const rewards = [];
  if (summary?.exp > 0) rewards.push(`経験値 +${summary.exp}`);
  const materials = formatMaterials(summary?.materials);
  if (materials) rewards.push(`素材 ${materials}`);
  const firstKill = formatMaterials(summary?.firstKillMaterials);
  const firstKillParts = [];
  if (firstKill) firstKillParts.push(firstKill);
  if (summary?.bonusTickets > 0) firstKillParts.push(`鑑定粉 +${summary.bonusTickets}`);
  if (firstKillParts.length > 0) rewards.push(`初討伐 ${firstKillParts.join("、")}`);
  (summary?.items || []).forEach(name => rewards.push(`入手 ${name}`));

  const levelUps = (summary?.levelUps || []).map(entry => ({
    heading: `${entry.name} Lv${entry.levelBefore} → Lv${entry.level}`,
    stat: `最大HP ${entry.maxHpBefore} → ${entry.maxHp}（+${entry.maxHp - entry.maxHpBefore}）`
  }));

  return { title: levelUps.length > 0 ? "勝利！ レベルアップ" : "勝利！", rewards, levelUps };
}

function hideVictoryToast() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  const toast = document.getElementById("victory-toast");
  if (toast) toast.hidden = true;
}

function ensureToastElement(panel) {
  let toast = document.getElementById("victory-toast");
  if (!toast) {
    toast = document.createElement("button");
    toast.type = "button";
    toast.id = "victory-toast";
    toast.className = "victory-toast";
    toast.setAttribute("aria-live", "polite");
    toast.hidden = true;
    toast.addEventListener("click", hideVictoryToast);
  }
  if (toast.parentElement !== panel) panel.appendChild(toast);
  return toast;
}

function appendLine(parent, className, text) {
  const line = document.createElement("span");
  line.className = className;
  line.textContent = text;
  parent.appendChild(line);
}

/** @param {Parameters<typeof formatVictorySummary>[0]} summary */
export function showVictoryToast(summary) {
  if (typeof document === "undefined" || !summary) return;
  const panel = document.getElementById("viewport-panel");
  if (!panel) return;
  const { title, rewards, levelUps } = formatVictorySummary(summary);
  const toast = ensureToastElement(panel);
  toast.replaceChildren();
  toast.classList.toggle("has-level-up", levelUps.length > 0);
  appendLine(toast, "victory-toast-title", title);
  rewards.forEach(text => appendLine(toast, "victory-toast-reward", text));
  levelUps.forEach(({ heading, stat }) => {
    appendLine(toast, "victory-toast-level", `★ ${heading}`);
    appendLine(toast, "victory-toast-stat", stat);
  });
  toast.setAttribute("aria-label", `${title}。タップで閉じる`);
  toast.hidden = false;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hideVictoryToast, levelUps.length > 0 ? VICTORY_TOAST_LEVEL_UP_MS : VICTORY_TOAST_MS);
}
