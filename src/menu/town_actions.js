import { state, saveAutosave, addLog, clearSave, DEATH_TYPE_LABELS, summarizeDeathLogs } from "../state.js";
import { playSound } from "../audio.js";
import { openArchivesOverlay, updateUI } from "../ui.js";
import { openSubmenu, closeSubmenu } from "../navigation.js";
import { getClassJpName, getItemBaseId } from "../data.js";
import { getAdventureRecordsHtml } from "../ui/adventure_history.js";

function isDebugMode() {
  return import.meta.env.DEV || new URLSearchParams(location.search).has("debug");
}

function isAbandonRun(run) {
  return run?.outcome === "abandon" || (!run?.outcome && run?.returnReason === "abandon");
}

export function handleTownOption(option) {
  if (option === "castle") {
    openSubmenu("castle_main", "おしろ - 記録");
  } else if (option === "run_quest_board") {
    openSubmenu("run_quest_board", "依頼板 - 潜行の目的");
  } else if (option === "workshop") {
    openSubmenu("workshop_main", "工房 - 広がった可能性");
  } else if (option === "archives") {
    openArchivesOverlay();
  }
}

export function renderCastleMain(optGrid) {
  optGrid.className = "submenu-grid castle-grid";
  optGrid.innerHTML = "";
  const records = state.records || { deepestRetreat: 0, deepestDeath: 0, deepestByClass: {}, totalRuns: 0 };
  const abandonCount = Array.isArray(state.runHistory) ? state.runHistory.filter(isAbandonRun).length : 0;

  const adventureRecords = document.createElement("div");
  adventureRecords.innerHTML = getAdventureRecordsHtml(state);
  optGrid.appendChild(adventureRecords.firstElementChild);

  const summary = document.createElement("div");
  summary.className = "records-menu-summary";
  summary.innerHTML = `
    <div><span>撤退最深</span><strong>${records.deepestRetreat ? `B${records.deepestRetreat}F` : "未記録"}</strong></div>
    <div><span>死亡最深</span><strong>${records.deepestDeath ? `B${records.deepestDeath}F` : "未記録"}</strong></div>
    <div><span>総潜行</span><strong>${records.totalRuns}回</strong></div>
    <div><span>断念</span><strong>${abandonCount}回</strong></div>
  `;
  optGrid.appendChild(summary);
  const classRecords = document.createElement("div");
  classRecords.className = "records-class-list";
  const entries = Object.entries(records.deepestByClass || {}).sort((a, b) => b[1] - a[1]);
  classRecords.textContent = entries.length
    ? entries.map(([className, floor]) => `${getClassJpName(className)} B${floor}F`).join(" / ")
    : "クラス別記録なし";
  optGrid.appendChild(classRecords);

  const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
  if (hasCrystal) {
    const button = document.createElement("button");
    button.className = "btn btn-neon btn-block";
    button.textContent = "浮遊石を王へ献上する";
    button.addEventListener("click", () => {
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      addLog("浮遊石を持ち帰り、初踏破が記録された！");
      playSound("level_up");
      saveAutosave();
      renderCastleMain(optGrid);
    });
    optGrid.appendChild(button);
  }
  const deathLogs = document.createElement("button");
  deathLogs.className = "btn btn-neon btn-block";
  deathLogs.textContent = "全滅ログ確認";
  deathLogs.addEventListener("click", () => openSubmenu("castle_death_logs", "おしろ - 全滅ログ"));
  optGrid.appendChild(deathLogs);

  if (isDebugMode()) {
    const debugReset = document.createElement("button");
    debugReset.className = "btn btn-danger btn-block";
    debugReset.textContent = "デバッグ: データ全初期化";
    debugReset.addEventListener("click", () => {
      if (confirm("【デバッグ】全データを初期化します。よろしいですか？")) {
        clearSave();
        state.gameState = "town";
        closeSubmenu();
        updateUI();
      }
    });
    optGrid.appendChild(debugReset);
  }
}

export function renderCastleDeathLogs(optGrid) {
  optGrid.className = "submenu-grid castle-death-logs-grid";
  optGrid.innerHTML = "";
  const logs = state.deathLogs || [];
  if (logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "detail-placeholder";
    empty.textContent = "全滅の記録はありません。";
    optGrid.appendChild(empty);
    return;
  }

  const summaries = summarizeDeathLogs(logs);
  if (summaries.length > 0) {
    const heading = document.createElement("h3");
    heading.className = "death-summary-heading";
    heading.textContent = "分類済み死因（件数順）";
    optGrid.appendChild(heading);

    const summaryList = document.createElement("div");
    summaryList.className = "death-cause-list";
    summaries.forEach(summary => {
      const row = document.createElement("div");
      row.className = "death-cause-row";
      const title = document.createElement("strong");
      title.textContent = `B${summary.floor}F ${formatDeathCause(summary)} ×${summary.count}`;
      const detail = document.createElement("span");
      detail.textContent = DEATH_TYPE_LABELS[summary.type] || "分類";
      row.append(title, detail);
      summaryList.appendChild(row);
    });
    optGrid.appendChild(summaryList);
    appendDeathCountermeasure(optGrid, summaries[0]);
  }

  const unclassifiedCount = logs.filter(log => !log?.type || !log?.source).length;
  if (unclassifiedCount > 0) {
    const note = document.createElement("div");
    note.className = "death-unclassified-note";
    note.textContent = `過去の未分類ログ ${unclassifiedCount}件は集計していません。`;
    optGrid.appendChild(note);
  }

  const historyHeading = document.createElement("h3");
  historyHeading.className = "death-history-heading";
  historyHeading.textContent = "個別ログ";
  optGrid.appendChild(historyHeading);
  logs.slice(0, 15).forEach(log => {
    const entry = document.createElement("div");
    entry.className = "death-history-entry";
    entry.textContent = `B${log.floor}F / ${log.cause || "戦闘"}`;
    optGrid.appendChild(entry);
  });
}

function formatDeathCause(summary) {
  if (summary.type === "combat" && summary.source !== "魔法反射") {
    return `${summary.source}との戦闘`;
  }
  if (summary.type === "status") return `${summary.source}のダメージ`;
  return summary.source;
}

function appendDeathCountermeasure(optGrid, summary) {
  const panel = document.createElement("section");
  panel.className = "death-countermeasure";
  const heading = document.createElement("h3");
  heading.textContent = `この記録から見直せること`;
  panel.appendChild(heading);
  const note = document.createElement("p");
  note.className = "death-countermeasure-note";
  note.textContent = `${formatDeathCause(summary)} / B${summary.floor}F / ${summary.count}件。次の潜行では複数の備えを比較できます。`;
  panel.appendChild(note);

  const actions = document.createElement("div");
  actions.className = "death-countermeasure-actions";
  appendDeathReviewButton(actions, "準備を見直す", "クラス・持込品・開始地点を比較する。", "solo_start", "潜行の準備");
  appendDeathReviewButton(actions, "広がった可能性を見る", "記録から横方向の候補を確認する。", "workshop_main", "工房 - 広がった可能性");
  panel.appendChild(actions);
  optGrid.appendChild(panel);
}

function appendDeathReviewButton(container, label, detail, submenuType, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-neon btn-block death-countermeasure-button";
  button.innerHTML = `<strong>${label}</strong><span>${detail}</span>`;
  button.addEventListener("click", () => openSubmenu(submenuType, title));
  container.appendChild(button);
}
