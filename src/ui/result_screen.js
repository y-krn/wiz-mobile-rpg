import { state, saveGame, addLog, getStartingKit } from "../state.js";
import { getItemBaseId, getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { getFloorLabel } from "../data/floor_themes.js";
import { setRepresentativeItem } from "../systems/run_return.js";
import { clearPhase4cV1CharacterBaseline } from "../rules/phase4c_v1_trial.js";
import { formatFeatProgress, formatFeatReward, getFeat } from "../systems/feats.js";
import { COMPANIONS, FACILITY_BY_ID } from "../data/facilities.js";

const ACHIEVEMENT_LABELS = {
  first_b5_reached: "初めてB5Fへ到達",
  first_b5_broken: "初めてB5Fを突破",
  first_b10_reached: "初めてB10Fへ到達"
};

// The repeat departure lives with the preparation menu. It is injected so
// this screen does not import the departure and dungeon-entry modules.
let departureActions = null;

/**
 * @param {{
 *   getPlan: () => object | null,
 *   formatCost: (plan: object) => string,
 *   repeat: () => boolean,
 *   review: () => void
 * } | null} actions
 */
export function setResultDepartureActions(actions) {
  departureActions = actions;
}

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function fragmentNode() {
  return typeof document.createDocumentFragment === "function"
    ? document.createDocumentFragment()
    : document.createElement("span");
}

function setAttributeSafe(element, name, value) {
  if (typeof element.setAttribute === "function") element.setAttribute(name, value);
}

function createMaterialContent(materials) {
  const content = fragmentNode();
  const entries = Object.entries(materials || {}).filter(([, quantity]) => quantity > 0);
  if (entries.length === 0) {
    content.appendChild(textElement("span", "list-empty", "なし"));
    return content;
  }
  entries.forEach(([name, quantity]) => {
    const chip = textElement("span", "result-material-chip");
    chip.textContent = name;
    chip.appendChild(textElement("strong", null, `×${quantity}`));
    content.appendChild(chip);
  });
  return content;
}

function getOutcomeMeta(reason) {
  if (reason === "milestone_portal") {
    return {
      key: "portal",
      label: "帰還の門から帰還",
      detail: "帰還の門から街へ戻った。",
      success: true
    };
  }
  if (reason === "escape_scroll") {
    return {
      key: "wing",
      label: "帰還の翼で帰還",
      detail: "素材と未使用の持ち込み品を守り、追加の危険なく街へ戻った。",
      success: true
    };
  }
  if (reason === "gameover") {
    return {
      key: "death",
      label: "迷宮で死亡",
      detail: "素材の一部を持ち帰った。未使用の持ち込み品は失った。記録と知識は残る。",
      success: false
    };
  }
  if (reason === "abandon") {
    return {
      key: "abandon",
      label: "冒険を断念",
      detail: "素材は死亡時と同じ割合で持ち帰り、未使用の持ち込み品は失った。",
      success: false
    };
  }
  return {
    key: "stairs",
    label: "帰還",
    detail: "街へ戻った。",
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
  if (!data) return getItemBaseId(item) || "不明な品";
  if (typeof item === "object" && item.identified === false) {
    return item.unidentifiedName || `未鑑定の${itemTypeLabel(item)}`;
  }
  return data.name;
}

function getFoundItems(run) {
  return [...(run.itemsFound || []), ...(run.equipmentFound || [])].filter(Boolean);
}

function createLootList(items, emptyText) {
  const list = document.createElement("div");
  if (!items.length) {
    list.appendChild(textElement("span", "list-empty", emptyText));
    return list;
  }
  items.forEach(item => list.appendChild(textElement("span", "result-loot-chip", getItemLabel(item))));
  return list;
}

function createLootSection(run) {
  const found = getFoundItems(run);
  const section = document.createElement("section");
  section.className = "result-focus-section result-loot-section";
  setAttributeSafe(section, "aria-labelledby", "result-loot-title");
  setAttributeSafe(section, "data-result-loot", "");
  const heading = textElement("h2", "result-section-heading");
  heading.id = "result-loot-title";
  heading.appendChild(textElement("span", null, "今回見つけた品"));
  heading.appendChild(textElement("strong", null, `${found.length}点`));
  section.appendChild(heading);
  section.appendChild(createLootList(found, "品は見つからなかった"));
  return section;
}

function getRepresentativeFacts(run, outcome) {
  const facts = [outcome.detail, `${getFloorLabel(state, run.deepestFloor)}まで到達`];
  const death = run.deathLogs?.at(-1);
  if (outcome.key === "death" && death) {
    facts.push(`死因: ${death.cause || death.source || "原因未記録"}`);
  }
  const found = getFoundItems(run);
  if (found.length > 0) facts.push(`この冒険を象徴する品: ${getItemLabel(found[0])}`);
  if (run.defeatedMilestones?.length > 0) {
    facts.push(`階層守護者を${run.defeatedMilestones.at(-1)}Fで撃破`);
  }
  if (run.codexDiscoveries?.length > 0) {
    facts.push(`Codexに新規記録: ${run.codexDiscoveries.slice(0, 2).join(" / ")}`);
  }
  if (run.workshopDiscoveries?.length > 0) {
    facts.push("工房で新しい選択肢が利用可能になった");
  }
  return [...new Set(facts)].slice(0, 5);
}

function createMemorySection(run, outcome) {
  const section = document.createElement("section");
  section.className = "result-memory-section";
  setAttributeSafe(section, "aria-labelledby", "result-memory-title");
  setAttributeSafe(section, "data-result-memory", "");
  const heading = textElement("div", "result-memory-heading");
  const memoryTitle = textElement("h2", null, "物は失う。物語は残る。");
  heading.appendChild(textElement("span", "result-section-kicker", "今回の記憶"));
  memoryTitle.id = "result-memory-title";
  heading.appendChild(memoryTitle);
  const list = textElement("ul", "result-memory-list");
  getRepresentativeFacts(run, outcome).forEach(fact => list.appendChild(textElement("li", null, fact)));
  section.appendChild(heading);
  section.appendChild(list);
  return section;
}

const NEAR_MISS_ENEMY_KIND_LABELS = {
  guardian: "階層守護者",
  elite: "強敵"
};

// The enemy state stays the same three-step state combat shows. Exact HP is
// hidden during combat, so the result screen must not reveal it afterwards.
const NEAR_MISS_ENEMY_STATE_TEXT = {
  "重傷": name => `${name}を重傷まで追い込んでいた`,
  "負傷": name => `${name}に傷を負わせていた`,
  "健在": name => `${name}は健在だった`,
  "状態不明": name => `${name}の状態は分からなかった`
};

function getNearMissItemName(itemId) {
  const name = getItemData(itemId)?.name || itemId;
  return String(name).replace(/\s*[（(].*?[）)]/g, "");
}

export function getNearMissFacts(nearMiss) {
  if (!nearMiss) return [];
  const facts = [];
  (nearMiss.enemies || []).forEach(enemy => {
    const kind = NEAR_MISS_ENEMY_KIND_LABELS[enemy.kind];
    const describe = NEAR_MISS_ENEMY_STATE_TEXT[enemy.state] || NEAR_MISS_ENEMY_STATE_TEXT["状態不明"];
    facts.push(describe(`${kind ? `${kind}・` : ""}${enemy.name}`));
  });
  if (nearMiss.defeatedInBattle > 0) {
    facts.push(`この戦闘で${nearMiss.defeatedInBattle}体を倒していた`);
  }
  if (nearMiss.bestDepth) {
    facts.push(nearMiss.bestDepth.gap > 0
      ? `自己最深 B${nearMiss.bestDepth.best}F まであと${nearMiss.bestDepth.gap}階だった`
      : `自己最深 B${nearMiss.bestDepth.best}F に並んでいた`);
  }
  if (nearMiss.portal?.kind === "ahead") {
    facts.push(`次の帰還の門（B${nearMiss.portal.floor}F）まであと${nearMiss.portal.gap}階だった`);
  } else if (nearMiss.portal?.kind === "guardian_ahead") {
    facts.push("帰還の門は、この階の階層守護者の先にあった");
  } else if (nearMiss.portal?.kind === "guardian_defeated") {
    facts.push("階層守護者は倒していた。帰還の門は同じ階にあった");
  }
  if (nearMiss.unused?.length > 0) {
    const items = nearMiss.unused
      .map(item => `${getNearMissItemName(item.itemId)}×${item.count}`)
      .join("、");
    facts.push(`使わずに残っていた物：${items}`);
  }
  return facts;
}

function createNearMissSection(run, outcome) {
  if (outcome.key !== "death") return null;
  const facts = getNearMissFacts(run.nearMiss);
  if (facts.length === 0) return null;
  const section = textElement("section", "result-focus-section result-near-miss-section");
  setAttributeSafe(section, "aria-labelledby", "result-near-miss-title");
  setAttributeSafe(section, "data-result-near-miss", "");
  const heading = textElement("h2", "result-section-heading");
  heading.id = "result-near-miss-title";
  heading.appendChild(textElement("span", null, "あと少しだった点"));
  section.appendChild(heading);
  const list = textElement("ul", "result-near-miss-list");
  facts.forEach(fact => list.appendChild(textElement("li", null, fact)));
  section.appendChild(list);
  return section;
}

function createDiscoverySection(run) {
  const codex = run.codexInsights?.length ? [] : run.codexDiscoveries || [];
  const workshop = run.workshopUnlocks?.length ? [] : run.workshopDiscoveries || [];
  if (!codex.length && !workshop.length) return null;
  const section = textElement("section", "result-discovery-section");
  setAttributeSafe(section, "aria-label", "新しく増えた記録と可能性");
  setAttributeSafe(section, "data-result-discoveries", "");
  const appendColumn = (headingText, names, format) => {
    if (!names.length) return;
    const column = document.createElement("div");
    column.appendChild(textElement("h2", null, headingText));
    const list = document.createElement("ul");
    names.forEach(name => list.appendChild(textElement("li", null, format(name))));
    column.appendChild(list);
    section.appendChild(column);
  };
  appendColumn("新しく分かったこと", codex, name => `${name}をCodexに記録`);
  appendColumn("広がった可能性", workshop, name => `工房で${name}を選べるようになった`);
  return section;
}

function createRecordSection(run) {
  const result = run.recordResult;
  if (!result?.updated) {
    const steady = textElement("div", "result-record-steady");
    steady.appendChild(textElement("span", null, "記録"));
    steady.appendChild(textElement("strong", null, "更新なし"));
    return steady;
  }
  const updateLabels = [...new Set([
    ...(result.updates || []),
    ...(result.milestones || []).map(id => ACHIEVEMENT_LABELS[id] || id)
  ])].filter(update => typeof update === "string" && (
    ["最深到達記録", "撤退最深", "死亡最深"].includes(update) || !update.endsWith("最深")
  )).map(update => update === "撤退最深" ? "帰還最深" : update);
  const hasDepthRecord = (result.updates || []).some(update => ["最深到達記録", "撤退最深", "死亡最深"].includes(update));
  const record = textElement("div", "result-record-new");
  setAttributeSafe(record, "role", "status");
  setAttributeSafe(record, "aria-live", "polite");
  record.appendChild(textElement("span", "result-record-kicker", hasDepthRecord ? "NEW DEPTH RECORD" : "ADVENTURE RECORD"));
  record.appendChild(textElement("strong", null, `B${result.depth}F`));
  record.appendChild(textElement("small", null, updateLabels.join(" / ")));
  return record;
}

// Feats achieved this run and how far the closest ones moved. The stored
// result holds ids and numbers only; names and wording come from the catalog.
export function getFeatResultRows(featResult, run = null) {
  const rows = [];
  // Someone who was being led out stays in the dungeon unless the run walked
  // out. Say so plainly: they can be found again on the next run.
  const companion = COMPANIONS[run?.companion];
  const leftBehind = companion && run.outcome !== "retreat"
    ? FACILITY_BY_ID.get(companion.facilityId)?.featId
    : null;
  if (leftBehind) {
    const feat = getFeat(leftBehind);
    rows.push({
      id: leftBehind,
      status: "失敗",
      completed: false,
      failed: true,
      name: feat?.name || companion.name,
      detail: `${companion.name}は迷宮に残された`
    });
  }
  if (!featResult) return rows;
  (featResult.completed || []).forEach(featId => {
    const feat = getFeat(featId);
    if (!feat) return;
    rows.push({ id: feat.id, status: "達成", completed: true, name: feat.name, detail: `報酬 ${formatFeatReward(feat)}` });
  });
  (featResult.progress || []).forEach(entry => {
    const feat = getFeat(entry.id);
    if (!feat || entry.id === leftBehind) return;
    const progress = formatFeatProgress(feat, { current: entry.after, target: entry.target });
    const gained = entry.after - entry.before;
    rows.push({
      id: feat.id,
      status: gained > 0 ? "前進" : "次の目標",
      completed: false,
      name: feat.name,
      detail: gained > 0 && feat.metric.unit !== "floor" ? `${progress}（今回 +${gained}）` : progress
    });
  });
  return rows;
}

function createFeatSection(run) {
  const rows = getFeatResultRows(run.featResult, run);
  if (rows.length === 0) return null;
  const section = textElement("section", "result-focus-section result-feat-section");
  setAttributeSafe(section, "aria-labelledby", "result-feat-title");
  setAttributeSafe(section, "data-result-feats", "");
  const heading = textElement("h2", "result-section-heading");
  heading.id = "result-feat-title";
  heading.appendChild(textElement("span", null, "偉業"));
  section.appendChild(heading);
  const list = textElement("div", "result-feat-list");
  rows.forEach(entry => {
    const row = textElement("div", `result-feat-row ${entry.completed ? "completed" : entry.failed ? "failed" : "pending"}`);
    setAttributeSafe(row, "data-feat-id", entry.id);
    row.appendChild(textElement("span", null, entry.status));
    row.appendChild(textElement("strong", null, entry.name));
    row.appendChild(textElement("small", null, entry.detail));
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

const RETURN_RARITY_LABELS = {
  common: "通常",
  magic: "魔法",
  rare: "希少",
  epic: "逸品",
  legendary: "伝説"
};

function createReturnProcessingSection(run) {
  const representative = run.representativeItem;
  const history = Array.isArray(run.meaningfulItemHistory) ? run.meaningfulItemHistory : [];
  const insights = Array.isArray(run.codexInsights) ? run.codexInsights : [];
  const unlocks = Array.isArray(run.workshopUnlocks) ? run.workshopUnlocks : [];
  if (!representative && history.length === 0 && insights.length === 0 && unlocks.length === 0) return null;

  const section = textElement("section", "result-focus-section");
  setAttributeSafe(section, "aria-labelledby", "result-return-record-title");
  const heading = textElement("h2", "result-section-heading");
  heading.id = "result-return-record-title";
  heading.appendChild(textElement("span", null, "今回の冒険"));
  section.appendChild(heading);
  if (representative) {
    const representativeNode = textElement("div", "result-return-representative");
    representativeNode.appendChild(textElement("small", null, "この冒険を象徴する品"));
    representativeNode.appendChild(textElement("strong", null, representative.name));
    representativeNode.appendChild(textElement("span", null, RETURN_RARITY_LABELS[representative.rarity] || "通常"));
    section.appendChild(representativeNode);
  }
  if (history.length > 0) {
    const historyNode = textElement("div", "result-return-history");
    historyNode.appendChild(textElement("small", null, "印象に残った品（能力値への効果なし）"));
    history.forEach((item, index) => {
      const row = document.createElement("div");
      row.appendChild(textElement("span", null, item.name));
      const detail = document.createElement("span");
      detail.textContent = `B${item.depth}F `;
      const button = textElement("button", "result-return-representative-button", "この冒険を象徴する品にする");
      button.type = "button";
      setAttributeSafe(button, "data-return-history-index", String(index));
      detail.appendChild(button);
      row.appendChild(detail);
      historyNode.appendChild(row);
    });
    section.appendChild(historyNode);
  }
  if (insights.length > 0) {
    const node = textElement("div", "result-return-insights");
    node.appendChild(textElement("small", null, "図鑑に記録した新しい気づき"));
    insights.forEach(insight => node.appendChild(textElement("div", null, insight.label)));
    section.appendChild(node);
  }
  if (unlocks.length > 0) {
    const node = textElement("div", "result-return-unlocks");
    node.appendChild(textElement("small", null, "工房で利用可能になった内容"));
    unlocks.forEach(unlock => {
      const row = document.createElement("div");
      row.appendChild(textElement("strong", null, unlock.name));
      row.appendChild(textElement("span", null, unlock.description));
      node.appendChild(row);
    });
    section.appendChild(node);
  }
  return section;
}

function leaveResult(overlay, { announce = true } = {}) {
  overlay.style.display = "none";
  state.gameState = "town";
  clearPhase4cV1CharacterBaseline(state);
  state.currentRun = null;
  state.party = [];
  if (announce) addLog("街へ戻った。次の潜行に備えよう。");
  saveGame();
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

  overlay.replaceChildren();
  const header = textElement("div", `result-header ${outcome.success ? "success" : "failed"} result-outcome-${outcome.key}`);
  setAttributeSafe(header, "data-result-outcome", outcome.key);
  header.appendChild(textElement("span", "result-outcome", getReasonText(run.returnReason)));
  const resultTitle = textElement("h1", "result-title", "今回の深度 ");
  resultTitle.appendChild(textElement("strong", null, `B${run.deepestFloor}F`));
  header.appendChild(resultTitle);
  header.appendChild(textElement("p", "result-outcome-detail", outcome.detail));

  const body = document.createElement("div");
  body.className = "result-body";
  body.appendChild(createMemorySection(run, outcome));
  const nearMiss = createNearMissSection(run, outcome);
  if (nearMiss) body.appendChild(nearMiss);
  const featSection = createFeatSection(run);
  if (featSection) body.appendChild(featSection);
  body.appendChild(createRecordSection(run));
  body.appendChild(createLootSection(run));
  const discoveries = createDiscoverySection(run);
  if (discoveries) body.appendChild(discoveries);
  const returnProcessing = createReturnProcessingSection(run);
  if (returnProcessing) body.appendChild(returnProcessing);

  const materialsSection = textElement("section", "result-focus-section");
  setAttributeSafe(materialsSection, "aria-labelledby", "result-material-title");
  const materialsHeading = textElement("h2", "result-section-heading");
  materialsHeading.id = "result-material-title";
  materialsHeading.appendChild(textElement("span", null, "素材収支"));
  materialsHeading.appendChild(textElement("strong", null, `${rawTotal} → ${bankedTotal}`));
  materialsSection.appendChild(materialsHeading);
  materialsSection.appendChild(textElement("div", "result-banking-rate", `潜行中に取得 → ${isSuccess ? "帰還100%" : run.returnReason === "abandon" ? "断念30%（死亡時と同じ）" : "死亡30%"} 持ち帰り`));
  const materialFlow = textElement("div", "result-material-flow");
  const appendMaterialColumn = (label, materials) => {
    const column = document.createElement("div");
    column.appendChild(textElement("small", null, label));
    const content = document.createElement("div");
    content.appendChild(createMaterialContent(materials));
    column.appendChild(content);
    materialFlow.appendChild(column);
  };
  appendMaterialColumn("取得", run.materialsBeforeBanking);
  appendMaterialColumn("持ち帰り", run.bankedMaterials);
  materialsSection.appendChild(materialFlow);
  if (codexTotal > 0) {
    const bonus = textElement("div", "result-codex-bonus");
    bonus.appendChild(textElement("span", null, "初討伐メタ報酬"));
    const content = document.createElement("div");
    content.appendChild(createMaterialContent(run.codexRewards));
    bonus.appendChild(content);
    materialsSection.appendChild(bonus);
  }
  body.appendChild(materialsSection);

  body.appendChild(textElement("div", "result-run-note", getEvaluationText(run, isSuccess)));

  const footer = textElement("div", "result-footer-actions");
  // Every exit from the result settles the same things first: the first-clear
  // record, the run and party, and the save. The guard makes a replayed tap
  // on any exit a no-op, so a repeat departure pays and starts only once.
  const settleResult = ({ announce = true } = {}) => {
    if (state.gameState !== "result" || state.currentRun !== run) return false;
    const hasCrystal = state.inventory.some(item => getItemBaseId(item) === "ANTIGRAVITY_CRYSTAL");
    if (hasCrystal) {
      state.cleared = true;
      state.inventory = state.inventory.filter(item => getItemBaseId(item) !== "ANTIGRAVITY_CRYSTAL");
      playSound("level_up");
      addLog("浮遊石を持ち帰り、初踏破が記録された！");
    } else {
      playSound(isSuccess ? "heal" : "bump");
    }
    leaveResult(overlay, { announce });
    return true;
  };

  const plan = departureActions?.getPlan() || null;
  if (plan) {
    const kitName = getStartingKit(plan.kitId)?.name || "前回のキット";
    const againButton = textElement("button", "btn btn-neon btn-primary btn-block result-again-button");
    againButton.id = "btn-result-again";
    setAttributeSafe(againButton, "type", "button");
    if (plan.canRepeat) {
      setAttributeSafe(againButton, "data-result-next", "repeat");
      againButton.appendChild(textElement("strong", null, "同じ準備でもう一度"));
      againButton.appendChild(textElement(
        "span",
        "result-again-detail",
        `${kitName}・B${plan.startFloor}Fから・${departureActions.formatCost(plan)}`
      ));
      againButton.addEventListener("click", () => {
        if (settleResult({ announce: false })) departureActions.repeat();
      });
    } else {
      setAttributeSafe(againButton, "data-result-next", "review");
      againButton.appendChild(textElement("strong", null, "準備を見直して出発"));
      againButton.appendChild(textElement(
        "span",
        "result-again-detail",
        `${kitName}・前回と同じ準備は揃えられない`
      ));
      againButton.addEventListener("click", () => {
        if (settleResult({ announce: false })) departureActions.review();
      });
    }
    footer.appendChild(againButton);
  }
  // One filled primary action: the repeat departure when it is offered,
  // otherwise the return to town.
  const castleButton = textElement(
    "button",
    `btn btn-block ${plan ? "btn-secondary" : "btn-neon btn-primary"}`,
    "街へ戻る"
  );
  castleButton.id = "btn-result-castle";
  setAttributeSafe(castleButton, "data-result-next", "town");
  footer.appendChild(castleButton);
  overlay.appendChild(header);
  overlay.appendChild(body);
  overlay.appendChild(footer);

  castleButton.addEventListener("click", () => {
    settleResult();
  });

  const historyButtons = typeof overlay.querySelectorAll === "function"
    ? overlay.querySelectorAll("[data-return-history-index]")
    : [];
  historyButtons.forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-return-history-index"));
      const item = run.meaningfulItemHistory?.[index];
      if (!item || !setRepresentativeItem(state, item)) return;
      saveGame();
      renderResultScreen();
    });
  });
}
