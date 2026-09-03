import { state, saveGame, saveAutosave, addLog } from "../state.js";
import { getClassJpName, getItemBaseId, getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { getFloorLabel } from "../data/floor_themes.js";
import { setRepresentativeItem } from "../systems/run_return.js";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getOutcomeMeta(reason) {
  if (reason === "milestone_portal") {
    return {
      key: "portal",
      label: "帰還の門から帰還",
      detail: "未確定の戦果をすべて確定して、街へ戻った。",
      success: true
    };
  }
  if (reason === "escape_scroll") {
    return {
      key: "wing",
      label: "帰還の翼で離脱",
      detail: "帰還の翼を使い、追加の危険を受けずに街へ戻った。",
      success: true
    };
  }
  if (reason === "gameover") {
    return {
      key: "death",
      label: "迷宮で死亡",
      detail: "物は失っても、今回の記録と新しい知識は残る。",
      success: false
    };
  }
  if (reason === "abandon") {
    return {
      key: "abandon",
      label: "冒険を断念",
      detail: "持ち帰っていない戦果を手放し、街へ戻った。",
      success: false
    };
  }
  return {
    key: "stairs",
    label: "階段から帰還",
    detail: "今回の戦果を確定して、街へ戻った。",
    success: true
  };
}

function getReasonText(reason) {
  return getOutcomeMeta(reason).label;
}

function itemTypeLabel(item) {
  const type = getItemData(item)?.type;
  return type === "weapon" ? "武器" : type === "shield" ? "盾" : type === "armor" ? "防具" : type === "accessory" ? "装身具" : "道具";
}

function getItemLabel(item) {
  const data = getItemData(item);
  if (!data) return getItemBaseId(item) || "不明な戦果";
  if (typeof item === "object" && item.identified === false) {
    return item.unidentifiedName || `未鑑定の${itemTypeLabel(item)}`;
  }
  return data.name;
}

function getFoundItems(run) {
  return [...(run.itemsFound || []), ...(run.equipmentFound || [])].filter(Boolean);
}

function getDepartureItems(run) {
  if (Array.isArray(run.returnedTownItems)) {
    return run.returnedTownItems;
  }
  return Array.isArray(run.departureItems) ? run.departureItems : [];
}

function getResultLoot(run, outcome) {
  const found = getFoundItems(run);
  const explicitReturned = Array.isArray(run.recoveredItems) ? run.recoveredItems
    : Array.isArray(run.salvagedItems) ? run.salvagedItems : [
    ...(run.bankedObjectLoot || [])
  ];
  const explicitLost = Array.isArray(run.lostObjectLoot) ? run.lostObjectLoot : null;
  if (Array.isArray(explicitReturned) || Array.isArray(explicitLost)) {
    return {
      returned: Array.isArray(explicitReturned) ? explicitReturned : [],
      lost: Array.isArray(explicitLost) ? explicitLost : []
    };
  }
  return outcome.success
    ? { returned: found, lost: [] }
    : { returned: [], lost: found };
}

function formatLootList(items, emptyText) {
  if (!items.length) return `<span class="list-empty">${emptyText}</span>`;
  return items.map(item => `<span class="result-loot-chip">${escapeHtml(getItemLabel(item))}</span>`).join("");
}

function getLootHtml(run, outcome) {
  const { returned, lost } = getResultLoot(run, outcome);
  const departure = getDepartureItems(run);
  return `
    <section class="result-focus-section result-loot-section" aria-labelledby="result-loot-title" data-result-loot>
      <h2 class="result-section-heading" id="result-loot-title"><span>戦果のゆくえ</span><strong>${returned.length ? `${returned.length}点を回収` : lost.length ? `${lost.length}点を喪失` : "記録なし"}</strong></h2>
      <div class="result-loot-note">持込品は確定済みの所有物。Dungeon戦果とは別に扱われます。</div>
      <div class="result-loot-group result-loot-returned">
        <small>${outcome.key === "wing" ? "翼で救出した戦果" : "街へ回収した戦果"}</small>
        <div>${formatLootList(returned, "なし")}</div>
      </div>
      ${lost.length > 0 ? `<div class="result-loot-group result-loot-lost"><small>Dungeonで失われた戦果</small><div>${formatLootList(lost, "なし")}</div></div>` : ""}
      <div class="result-loot-group result-loot-carried"><small>持込品（未使用分）</small><div>${formatLootList(departure, "なし")}</div></div>
    </section>
  `;
}

function getRepresentativeFacts(run, outcome) {
  const facts = [outcome.detail, `${getFloorLabel(state, run.deepestFloor)}まで到達`];
  const death = run.deathLogs?.at(-1);
  if (outcome.key === "death" && death) {
    facts.push(`死因: ${death.cause || death.source || "原因未記録"}`);
  }
  const found = getFoundItems(run);
  if (found.length > 0) facts.push(`代表的な戦果: ${getItemLabel(found[0])}`);
  if (run.defeatedMilestones?.length > 0) {
    facts.push(`階層守護者を${run.defeatedMilestones.at(-1)}Fで撃破`);
  }
  if (run.codexDiscoveries?.length > 0) {
    facts.push(`Codexに新規記録: ${run.codexDiscoveries.slice(0, 2).join(" / ")}`);
  }
  if (run.workshopDiscoveries?.length > 0) {
    facts.push("Workshopに新しい可能性が開いた");
  }
  return [...new Set(facts)].slice(0, 5);
}

function getMemoryHtml(run, outcome) {
  return `
    <section class="result-memory-section" aria-labelledby="result-memory-title" data-result-memory>
      <div class="result-memory-heading"><span class="result-section-kicker">今回の記憶</span><h2 id="result-memory-title">物は失う。物語は残る。</h2></div>
      <ul class="result-memory-list">
        ${getRepresentativeFacts(run, outcome).map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function getDiscoveryHtml(run) {
  const codex = (run.codexInsights?.length ? [] : run.codexDiscoveries || [])
    .map(name => `<li>${escapeHtml(name)}をCodexに記録</li>`);
  const workshop = (run.workshopUnlocks?.length ? [] : run.workshopDiscoveries || [])
    .map(name => `<li>${escapeHtml(name)}に関わる可能性が開いた</li>`);
  if (!codex.length && !workshop.length) return "";
  return `
    <section class="result-discovery-section" aria-label="新しく増えた記録と可能性" data-result-discoveries>
      ${codex.length ? `<div><h2>新しく分かったこと</h2><ul>${codex.join("")}</ul></div>` : ""}
      ${workshop.length ? `<div><h2>広がった可能性</h2><ul>${workshop.join("")}</ul></div>` : ""}
    </section>
  `;
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

const RETURN_RARITY_LABELS = {
  common: "通常",
  magic: "魔法",
  rare: "希少",
  epic: "逸品",
  legendary: "伝説"
};

function getReturnItemStatusLabel(status) {
  return status === "lost" ? "喪失" : status === "rescued" ? "救出" : status === "returned" ? "帰還" : "観測";
}

function getReturnProcessingHtml(run) {
  const representative = run.representativeItem;
  const history = Array.isArray(run.meaningfulItemHistory) ? run.meaningfulItemHistory : [];
  const insights = Array.isArray(run.codexInsights) ? run.codexInsights : [];
  const unlocks = Array.isArray(run.workshopUnlocks) ? run.workshopUnlocks : [];
  if (!representative && history.length === 0 && insights.length === 0 && unlocks.length === 0) return "";

  return `
    <section class="result-focus-section" aria-labelledby="result-return-record-title">
      <h2 class="result-section-heading" id="result-return-record-title"><span>帰還の記録</span></h2>
      ${representative ? `
        <div class="result-return-representative">
          <small>${representative.status === "lost" ? "失われた代表品" : "今回の代表品"}</small>
          <strong>${representative.name}</strong>
          <span>${RETURN_RARITY_LABELS[representative.rarity] || "通常"} / ${getReturnItemStatusLabel(representative.status)}</span>
        </div>
      ` : ""}
      ${history.length > 0 ? `
        <div class="result-return-history">
          <small>重要な個体履歴（能力値への恒久ボーナスなし）</small>
          ${history.map((item, index) => `<div><span>${item.name}</span><span>${getReturnItemStatusLabel(item.status)} / B${item.depth}F <button type="button" class="result-return-representative-button" data-return-history-index="${index}">代表に設定</button></span></div>`).join("")}
        </div>
      ` : ""}
      ${insights.length > 0 ? `
        <div class="result-return-insights"><small>図鑑に記録した新しい気づき</small>${insights.map(insight => `<div>${insight.label}</div>`).join("")}</div>
      ` : ""}
      ${unlocks.length > 0 ? `
        <div class="result-return-unlocks"><small>工房で横方向に解禁</small>${unlocks.map(unlock => `<div><strong>${unlock.name}</strong><span>${unlock.description}</span></div>`).join("")}</div>
      ` : ""}
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
  const outcome = getOutcomeMeta(run.returnReason);
  const isSuccess = outcome.success;
  const rawTotal = Object.values(run.materialsBeforeBanking || {}).reduce((sum, quantity) => sum + quantity, 0);
  const bankedTotal = Object.values(run.bankedMaterials || {}).reduce((sum, quantity) => sum + quantity, 0);
  const codexTotal = Object.values(run.codexRewards || {}).reduce((sum, quantity) => sum + quantity, 0);

  overlay.innerHTML = `
    <div class="result-header ${outcome.success ? "success" : "failed"} result-outcome-${outcome.key}" data-result-outcome="${outcome.key}">
      <span class="result-outcome">${getReasonText(run.returnReason)}</span>
      <h1 class="result-title">今回の深度 <strong>B${run.deepestFloor}F</strong></h1>
      <p class="result-outcome-detail">${outcome.detail}</p>
    </div>
    <div class="result-body">
      ${getMemoryHtml(run, outcome)}
      ${getRecordHtml(run)}
      ${getLootHtml(run, outcome)}
      ${getDiscoveryHtml(run)}
      ${getReturnProcessingHtml(run)}
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
      <section class="result-focus-section" aria-labelledby="result-quest-title">
        <h2 class="result-section-heading" id="result-quest-title"><span>今回の依頼</span></h2>
        <div class="result-quest-list">${getQuestHtml(run)}</div>
      </section>
      <div class="result-run-note">${getEvaluationText(run, isSuccess)}</div>
    </div>
    <div class="result-footer-actions">
      <button id="btn-result-castle" class="btn btn-neon btn-block" data-result-next="town">街へ戻る</button>
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

  (overlay.querySelectorAll?.("[data-return-history-index]") || []).forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.returnHistoryIndex);
      const item = run.meaningfulItemHistory?.[index];
      if (!item || !setRepresentativeItem(state, item)) return;
      saveGame();
      saveAutosave();
      renderResultScreen();
    });
  });
}
