import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getClassJpName, getItemBaseId } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { getFloorLabel } from "../data/floor_themes.js";

function formatMaterials(materials) {
  const entries = Object.entries(materials || {}).filter(([, quantity]) => quantity > 0);
  if (entries.length === 0) return '<span class="list-empty">なし</span>';
  return entries.map(([name, quantity]) => `<span class="result-material-chip">${name}<strong>×${quantity}</strong></span>`).join("");
}

function getReasonText(reason) {
  if (reason === "escape_scroll") return "帰還の翼で撤退";
  if (reason === "milestone_portal") return "節目ポータルで撤退";
  if (reason === "stairs") return "階段から帰還";
  if (reason === "gameover") return "迷宮で死亡";
  return "ラン終了";
}

function getRecordHtml(run) {
  const result = run.recordResult;
  if (!result?.updated) {
    return '<div class="result-record-steady"><span>記録</span><strong>更新なし</strong></div>';
  }
  const updateLabels = result.updates.map(update => update === `${result.className}最深`
    ? `${getClassJpName(result.className)}最深`
    : update);
  return `
    <div class="result-record-new" role="status" aria-live="polite">
      <span class="result-record-kicker">NEW DEPTH RECORD</span>
      <strong>B${result.depth}F</strong>
      <small>${updateLabels.join(" / ")}</small>
    </div>
  `;
}

function getQuestHtml(run) {
  const quests = run.quests || [];
  if (quests.length === 0) return '<div class="list-empty">クエストなし</div>';
  return quests.map(quest => {
    const reward = Object.entries(quest.reward?.materials || {})
      .map(([name, quantity]) => `${name}×${quantity}`)
      .join(" / ");
    return `
      <div class="result-quest-row ${quest.completed ? "completed" : "failed"}">
        <span>${quest.completed ? "達成" : "未達"}</span>
        <strong>${quest.name}</strong>
        <small>${quest.completed ? reward : `${quest.currentValue || 0}/${quest.targetValue}`}</small>
      </div>
    `;
  }).join("");
}

function leaveResult(overlay) {
  overlay.style.display = "none";
  state.gameState = "town";
  state.currentRun = null;
  state.party = [];
  addLog("街へ戻った。次の潜行に備えよう。");
  saveGame();
  saveAutosave();
  updateUI();
}

export function getEvaluationText(run, isSuccess) {
  if (!run) return "";
  return isSuccess
    ? `${getFloorLabel(state, run.deepestFloor)}から帰還した。`
    : `${getFloorLabel(state, run.deepestFloor)}で力尽き、素材の30%を持ち帰った。`;
}

export function renderResultScreen() {
  const overlay = document.getElementById("result-overlay");
  if (!overlay || !state.currentRun) return;

  const run = state.currentRun;
  const isSuccess = run.returnReason !== "gameover";
  const rawTotal = Object.values(run.materialsBeforeBanking || {}).reduce((sum, quantity) => sum + quantity, 0);
  const bankedTotal = Object.values(run.bankedMaterials || {}).reduce((sum, quantity) => sum + quantity, 0);
  const codexTotal = Object.values(run.codexRewards || {}).reduce((sum, quantity) => sum + quantity, 0);

  overlay.innerHTML = `
    <div class="result-header ${isSuccess ? "success" : "failed"}">
      <span class="result-outcome">${getReasonText(run.returnReason)}</span>
      <h1 class="result-title">今回の深度 <strong>B${run.deepestFloor}F</strong></h1>
    </div>
    <div class="result-body">
      ${getRecordHtml(run)}
      <section class="result-focus-section" aria-labelledby="result-material-title">
        <h2 class="result-section-heading" id="result-material-title">
          <span>素材収支</span><strong>${rawTotal} → ${bankedTotal}</strong>
        </h2>
        <div class="result-banking-rate">ラン内取得 → ${isSuccess ? "撤退100%" : "死亡30%"} 持ち帰り</div>
        <div class="result-material-flow">
          <div><small>取得</small><div>${formatMaterials(run.materialsBeforeBanking)}</div></div>
          <div><small>持ち帰り</small><div>${formatMaterials(run.bankedMaterials)}</div></div>
        </div>
        ${codexTotal > 0 ? `<div class="result-codex-bonus"><span>初討伐メタ報酬</span><div>${formatMaterials(run.codexRewards)}</div></div>` : ""}
      </section>
      <section class="result-focus-section" aria-labelledby="result-quest-title">
        <h2 class="result-section-heading" id="result-quest-title"><span>ランクエスト</span></h2>
        <div class="result-quest-list">${getQuestHtml(run)}</div>
      </section>
      <div class="result-run-note">${getEvaluationText(run, isSuccess)}</div>
    </div>
    <div class="result-footer-actions">
      <button id="btn-result-castle" class="btn btn-neon btn-block">街へ戻る</button>
    </div>
  `;

  document.getElementById("btn-result-castle")?.addEventListener("click", () => {
    const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
    if (hasCrystal) {
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      playSound("level_up");
      addLog("浮遊石を持ち帰り、初踏破が記録された！");
    } else {
      playSound(isSuccess ? "heal" : "bump");
    }
    leaveResult(overlay);
  });
}
