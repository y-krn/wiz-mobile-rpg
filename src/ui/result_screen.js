import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getClassJpName, getItemBaseId, getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { getFloorLabel } from "../data/floor_themes.js";

const ACHIEVEMENT_LABELS = {
  first_b5_reached: "初めてB5Fへ到達",
  first_b5_broken: "初めてB5Fを突破",
  first_b10_reached: "初めてB10Fへ到達"
};

function formatMaterials(materials) {
  const entries = Object.entries(materials || {}).filter(([, quantity]) => quantity > 0);
  if (entries.length === 0) return '<span class="list-empty">なし</span>';
  return entries.map(([name, quantity]) => `<span class="result-material-chip">${name}<strong>×${quantity}</strong></span>`).join("");
}

function getReasonText(reason) {
  if (reason === "escape_scroll") return "帰還の翼で撤退";
  if (reason === "milestone_portal") return "帰還の門で撤退";
  if (reason === "stairs") return "階段から帰還";
  if (reason === "gameover") return "迷宮で死亡";
  if (reason === "abandon") return "冒険を断念";
  return "潜行終了";
}

function getRecordHtml(run) {
  const result = run.recordResult;
  if (!result?.updated) {
    return '<div class="result-record-steady"><span>記録</span><strong>更新なし</strong></div>';
  }
  const updateLabels = [...new Set([
    ...(result.updates || []),
    ...(result.milestones || []).map(id => ACHIEVEMENT_LABELS[id] || id)
  ])].map(update => update === `${result.className}最深`
    ? `${getClassJpName(result.className)}最深`
    : update);
  const hasDepthRecord = (result.updates || []).some(update => update === "最深到達記録" || update === "撤退最深" || update === "死亡最深" || update === `${result.className}最深`);
  return `
    <div class="result-record-new" role="status" aria-live="polite">
      <span class="result-record-kicker">${hasDepthRecord ? "NEW DEPTH RECORD" : "ADVENTURE RECORD"}</span>
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

function getObjectLootNames(items) {
  return (items || []).map(item => getItemData(item)?.name || getItemBaseId(item) || "不明な品");
}

function getObjectLootHtml(run) {
  const banked = getObjectLootNames([
    ...(run.returnedTownItems || []),
    ...(run.bankedObjectLoot || [])
  ]);
  const lost = getObjectLootNames(run.lostObjectLoot);
  if (banked.length === 0 && lost.length === 0) return "";
  const formatItems = items => items.length > 0
    ? items.map(item => `<span class="result-object-loot-chip">${item}</span>`).join("")
    : '<span class="list-empty">なし</span>';
  return `
    <section class="result-focus-section" aria-labelledby="result-object-loot-title">
      <h2 class="result-section-heading" id="result-object-loot-title"><span>戦果の帰還</span></h2>
      <div class="result-object-loot-group returned"><small>持ち帰り</small><div>${formatItems(banked)}</div></div>
      ${lost.length > 0 ? `<div class="result-object-loot-group lost"><small>失われた戦果</small><div>${formatItems(lost)}</div></div>` : ""}
    </section>
  `;
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
  if (run.returnReason === "abandon") {
    return `${getFloorLabel(state, run.deepestFloor)}で冒険を断念し、素材の30%を持ち帰った。`;
  }
  return isSuccess
    ? `${getFloorLabel(state, run.deepestFloor)}から帰還した。`
    : `${getFloorLabel(state, run.deepestFloor)}で力尽き、素材の30%を持ち帰った。`;
}

export function renderResultScreen() {
  const overlay = document.getElementById("result-overlay");
  if (!overlay || !state.currentRun) return;

  const run = state.currentRun;
  const isSuccess = run.returnReason !== "gameover" && run.returnReason !== "abandon";
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
        <div class="result-banking-rate">潜行中に取得 → ${isSuccess ? "撤退100%" : run.returnReason === "abandon" ? "断念30%（死亡時と同じ）" : "死亡30%"} 持ち帰り</div>
        <div class="result-material-flow">
          <div><small>取得</small><div>${formatMaterials(run.materialsBeforeBanking)}</div></div>
          <div><small>持ち帰り</small><div>${formatMaterials(run.bankedMaterials)}</div></div>
        </div>
        ${codexTotal > 0 ? `<div class="result-codex-bonus"><span>初討伐メタ報酬</span><div>${formatMaterials(run.codexRewards)}</div></div>` : ""}
      </section>
      ${getObjectLootHtml(run)}
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
