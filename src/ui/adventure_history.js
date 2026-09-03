import { getClassJpName } from "../data.js";
import { DEATH_TYPE_LABELS, getStartingKit, summarizeDeathLogs } from "../state.js";

const ACHIEVEMENT_LABELS = {
  first_b5_reached: "初めてB5Fへ到達",
  first_b5_broken: "初めてB5Fを突破",
  first_b10_reached: "初めてB10Fへ到達"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function floorText(floor) {
  return Number(floor) > 0 ? `B${Number(floor)}F` : "未記録";
}

function outcomeLabel(run) {
  if (run?.outcome === "death" || run?.returnReason === "gameover") return "死亡";
  if (run?.outcome === "abandon" || run?.returnReason === "abandon") return "断念";
  return "撤退";
}

function outcomeClass(run) {
  const label = outcomeLabel(run);
  return label === "撤退" ? "retreat" : label === "死亡" ? "death" : "abandon";
}

function runNumber(run, index, totalRuns) {
  return Number(run?.runNumber) > 0 ? run.runNumber : Math.max(1, totalRuns - index);
}

function classLabel(run) {
  if (run?.startingKit) return getStartingKit(run.startingKit)?.name || "開始キット";
  return run?.className || run?.class
    ? getClassJpName(run.className || run.class)
    : "冒険者";
}

function decisionText(run) {
  const outcome = outcomeLabel(run);
  if (outcome === "死亡") {
    const cause = run.deathCause?.label || run.deathCause?.source || "原因未記録";
    return `${floorText(run.deathCause?.floor || run.deepestFloor)}で${escapeHtml(cause)}に倒れた`;
  }
  if (outcome === "断念") return `${floorText(run.deepestFloor)}で潜行を断念した`;
  if (run.returnReason === "milestone_portal") return `${floorText(run.deepestFloor)}で帰還の門を選び、戦利品を持ち帰った`;
  if (run.returnReason === "escape_scroll") return `${floorText(run.deepestFloor)}で帰還の翼を使い、撤退を決断した`;
  return `${floorText(run.deepestFloor)}で撤退を決断した`;
}

function getHistoryCards(history, totalRuns) {
  if (history.length === 0) return `<p class="adventure-empty">まだ冒険の記録はありません。最初の潜行が年代記の1ページになります。</p>`;
  return history.map((run, index) => {
    const number = runNumber(run, index, totalRuns);
    const badges = [
      ...(Array.isArray(run.milestones) ? run.milestones.map(id => `★ ${ACHIEVEMENT_LABELS[id] || id}`) : []),
      ...(Array.isArray(run.recordUpdates) ? run.recordUpdates
        .filter(label => label.includes("記録"))
        .map(label => `★ ${label}`) : [])
    ];
    return `
      <article class="adventure-run-card ${outcomeClass(run)}">
        <div class="adventure-run-header">
          <strong>第${number}回の冒険</strong>
          <span>${outcomeLabel(run)}</span>
        </div>
        <div class="adventure-run-class">${escapeHtml(classLabel(run))}</div>
        <div class="adventure-run-depth">${floorText(run.deepestFloor)}まで到達</div>
        <div class="adventure-run-facts">
          <span>${Number(run.kills) || 0}体を倒した</span>
          <span>宝箱を${Number(run.chestsOpened) || 0}個開けた</span>
        </div>
        <p class="adventure-run-decision">${decisionText(run)}</p>
        ${badges.length > 0 ? `<div class="adventure-run-badges">${badges.map(badge => `<span>${escapeHtml(badge)}</span>`).join("")}</div>` : ""}
      </article>
    `;
  }).join("");
}

function getChronicleHtml(records) {
  const achievements = Array.isArray(records.firstAchievements) ? records.firstAchievements : [];
  if (achievements.length === 0) return `<p class="adventure-empty">初めての達成は、次の潜行で記録されます。</p>`;
  return achievements.map(entry => `
    <div class="adventure-achievement">
      <strong>第${Number(entry.runNumber) || "?"}回</strong>
      <span>${escapeHtml(ACHIEVEMENT_LABELS[entry.id] || entry.label || entry.id)}</span>
      <small>${floorText(entry.floor)}</small>
    </div>
  `).join("");
}

function getPersonalBestHtml(records) {
  const best = records.personalBests || {};
  const loot = Number(best.lootCount) || 0;
  const gold = Number(best.goldEarned) || 0;
  return `
    <div class="adventure-best-grid">
      <div><span>最深到達</span><strong>${floorText(best.deepestFloor)}</strong></div>
      <div><span>最多撃破</span><strong>${Number(best.kills) || 0}体</strong></div>
      <div><span>最多宝箱</span><strong>${Number(best.chestsOpened) || 0}個</strong></div>
      <div><span>${gold > 0 ? "最大獲得Gold" : "最大戦利品"}</span><strong>${gold > 0 ? `${gold}G` : `${loot}個`}</strong></div>
    </div>
  `;
}

function getRetreatTrend(history) {
  const recent = history.slice(0, 10);
  const previous = history.slice(10, 20);
  if (recent.length < 2 || previous.length === 0) return "最近の傾向は、もう少し冒険を重ねると見えてきます。";
  const retreatAtB5 = runs => runs.filter(run => outcomeLabel(run) === "撤退" && Number(run.deepestFloor) <= 5).length;
  const recentRate = retreatAtB5(recent) / recent.length;
  const previousRate = retreatAtB5(previous) / previous.length;
  if (recentRate < previousRate) return "最近はB5Fでの撤退が減っています。";
  if (recentRate > previousRate) return "最近はB5Fでの撤退が増えています。次の準備を見直せそうです。";
  return "最近のB5Fでの撤退は、これまでと同じ傾向です。";
}

function getTrendHtml(records, history) {
  const stats = records.adventureStats || {};
  const total = Math.max(0, Number(records.totalRuns) || 0);
  const distribution = stats.floorDistribution || {};
  const buckets = [
    ["B1–B4", distribution["B1-B4"]],
    ["B5", distribution.B5],
    ["B6–B9", distribution["B6-B9"]],
    ["B10+", distribution["B10+"]]
  ];
  const max = Math.max(1, ...buckets.map(([, count]) => Number(count) || 0));
  return `
    <p class="adventure-trend-lead">${total}回中${Number(stats.brokeB5) || 0}回、B5Fを越えています。</p>
    <p class="adventure-trend-lead">${total}回中${Number(stats.reachedB10) || 0}回、B10Fまで到達しています。</p>
    <p class="adventure-trend-note">${getRetreatTrend(history)}</p>
    <div class="adventure-distribution" aria-label="これまでの到達階分布">
      ${buckets.map(([label, count]) => {
        const value = Number(count) || 0;
        return `<div class="adventure-distribution-row"><span>${label}</span><i style="--bar-size: ${(value / max) * 100}%"></i><strong>${value}回</strong></div>`;
      }).join("")}
    </div>
    <div class="adventure-rate-note">B5突破率 ${total ? Math.round(((Number(stats.brokeB5) || 0) / total) * 100) : 0}% / B10到達率 ${total ? Math.round(((Number(stats.reachedB10) || 0) / total) * 100) : 0}%</div>
  `;
}

function getDeathCauseHtml(stateLike) {
  let causes = Array.isArray(stateLike.records?.deathCauses) ? stateLike.records.deathCauses : [];
  if (causes.length === 0) causes = summarizeDeathLogs(stateLike.deathLogs || []);
  causes = causes.filter(cause => Number(cause.count) > 0).sort((a, b) => Number(b.count) - Number(a.count));
  if (causes.length === 0) return `<p class="adventure-empty">まだ死亡記録はありません。</p>`;
  return causes.slice(0, 5).map(cause => `
    <div class="adventure-death-row">
      <strong>${floorText(cause.floor)} ${escapeHtml(cause.source || cause.cause || "原因未記録")}</strong>
      <span>${escapeHtml(DEATH_TYPE_LABELS[cause.type] || "分類済み")} / ${Number(cause.count)}回</span>
    </div>
  `).join("");
}

export function getAdventureRecordsHtml(stateLike) {
  const records = stateLike.records || {};
  const history = Array.isArray(stateLike.runHistory) ? stateLike.runHistory : [];
  const totalRuns = Number(records.totalRuns) || history.length;
  return `
    <div class="adventure-records" data-adventure-records>
      <section class="adventure-record-section adventure-chronicle">
        <h3>冒険者の足跡</h3>
        <div class="adventure-achievement-list">${getChronicleHtml(records)}</div>
      </section>
      <section class="adventure-record-section adventure-recent-history">
        <h3>最近の冒険 <small>直近${history.length}回 / 最大20回</small></h3>
        <div class="adventure-history-list">${getHistoryCards(history, totalRuns)}</div>
      </section>
      <section class="adventure-record-section">
        <h3>自己ベスト</h3>
        ${getPersonalBestHtml(records)}
      </section>
      <section class="adventure-record-section">
        <h3>あなたの冒険</h3>
        ${getTrendHtml(records, history)}
      </section>
      <section class="adventure-record-section">
        <h3>主な死因</h3>
        <div class="adventure-death-list">${getDeathCauseHtml(stateLike)}</div>
      </section>
    </div>
  `;
}
