import { getClassJpName } from "../data.js";
import { state } from "../state.js";

function outcomeLabel(run) {
  if (run?.outcome === "death" || run?.returnReason === "gameover") return "死亡";
  if (run?.outcome === "abandon" || run?.returnReason === "abandon") return "断念";
  if (run?.returnReason === "escape_scroll") return "帰還の翼";
  if (run?.returnReason === "milestone_portal") return "帰還の門";
  return "帰還";
}

function outcomeClass(run) {
  const outcome = outcomeLabel(run);
  return outcome === "死亡" ? "death" : outcome === "断念" ? "abandon" : "returned";
}

function floorLabel(floor) {
  return Number(floor) > 0 ? `B${Number(floor)}F` : "未記録";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLastRunSummary(run) {
  if (!run) {
    return `
      <p class="town-last-run-empty">まだ冒険の記録はありません。次の潜行が最初の一頁になります。</p>
    `;
  }

  const className = run.className || run.class;
  const classLabel = className ? getClassJpName(className) : "冒険者";
  const outcome = outcomeLabel(run);
  const lost = outcome === "死亡" || outcome === "断念";
  return `
    <div class="town-last-run-status ${outcomeClass(run)}">
      <strong>${escapeHtml(outcome)}</strong>
      <span>${escapeHtml(classLabel)} / ${floorLabel(run.deepestFloor)}まで</span>
    </div>
    <p class="town-last-run-fact">
      ${lost ? "物は失っても、記録と知識は残っています。" : "戦果を確定し、次の潜行へ進めます。"}
    </p>
  `;
}

export function renderTownHome() {
  const summary = document.getElementById("town-last-run-summary");
  if (!summary) return;
  const lastRun = Array.isArray(state.runHistory) ? state.runHistory[0] : null;
  summary.innerHTML = getLastRunSummary(lastRun);
}
