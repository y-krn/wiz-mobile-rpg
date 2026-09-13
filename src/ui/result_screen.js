import { state, saveGame, addLog } from "../state.js";
import { getItemBaseId, getItemData } from "../data.js";
import { playSound } from "../audio.js";
import { updateUI } from "./ui_root.js";
import { getFloorLabel } from "../data/floor_themes.js";
import { setRepresentativeItem } from "../systems/run_return.js";

const ACHIEVEMENT_LABELS = {
  first_b5_reached: "初めてB5Fへ到達",
  first_b5_broken: "初めてB5Fを突破",
  first_b10_reached: "初めてB10Fへ到達"
};

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
      label: "帰還",
      detail: "戦果をすべて持ち帰り、街へ戻った。",
      success: true
    };
  }
  if (reason === "escape_scroll") {
    return {
      key: "wing",
      label: "翼で帰還",
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
    label: "帰還",
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

function createLootList(items, emptyText) {
  const list = document.createElement("div");
  if (!items.length) {
    list.appendChild(textElement("span", "list-empty", emptyText));
    return list;
  }
  items.forEach(item => list.appendChild(textElement("span", "result-loot-chip", getItemLabel(item))));
  return list;
}

function createLootSection(run, outcome) {
  const { returned, lost } = getResultLoot(run, outcome);
  const departure = getDepartureItems(run);
  const section = document.createElement("section");
  section.className = "result-focus-section result-loot-section";
  setAttributeSafe(section, "aria-labelledby", "result-loot-title");
  setAttributeSafe(section, "data-result-loot", "");
  const heading = textElement("h2", "result-section-heading");
  heading.id = "result-loot-title";
  heading.appendChild(textElement("span", null, "戦果のゆくえ"));
  heading.appendChild(textElement("strong", null,
    returned.length ? `${returned.length}点を回収` : lost.length ? `${lost.length}点を喪失` : "記録なし"));
  section.appendChild(heading);
  section.appendChild(textElement("div", "result-loot-note", "持ち込んだ品は街の品として扱い、迷宮で得た戦果とは分けて表示します。"));
  const appendGroup = (className, label, items) => {
    const group = textElement("div", `result-loot-group ${className}`);
    group.appendChild(textElement("small", null, label));
    group.appendChild(createLootList(items, "なし"));
    section.appendChild(group);
  };
  appendGroup("result-loot-returned", outcome.key === "wing" ? "翼で持ち帰った戦果" : "街へ回収した戦果", returned);
  if (lost.length > 0) appendGroup("result-loot-lost", "迷宮で失われた戦果", lost);
  appendGroup("result-loot-carried", "持込品（未使用分）", departure);
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

function createQuestContent(run) {
  const quests = run.quests || [];
  if (quests.length === 0) return textElement("div", "list-empty", "クエストなし");
  const list = fragmentNode();
  quests.forEach(quest => {
    const reward = Object.entries(quest.reward?.materials || {})
      .map(([name, quantity]) => `${name}×${quantity}`)
      .join(" / ");
    const row = textElement("div", `result-quest-row ${quest.completed ? "completed" : "failed"}`);
    row.appendChild(textElement("span", null, quest.completed ? "達成" : "未達"));
    row.appendChild(textElement("strong", null, quest.name));
    row.appendChild(textElement("small", null, quest.completed ? reward : `${quest.currentValue || 0}/${quest.targetValue}`));
    list.appendChild(row);
  });
  return list;
}

const RETURN_RARITY_LABELS = {
  common: "通常",
  magic: "魔法",
  rare: "希少",
  epic: "逸品",
  legendary: "伝説"
};

function getReturnItemStatusLabel(status) {
  return status === "lost" ? "喪失" : status === "rescued" ? "翼で持ち帰り" : status === "returned" ? "帰還" : "観測";
}

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
    representativeNode.appendChild(textElement("small", null, representative.status === "lost" ? "この冒険を象徴する失われた品" : "この冒険を象徴する品"));
    representativeNode.appendChild(textElement("strong", null, representative.name));
    representativeNode.appendChild(textElement("span", null, `${RETURN_RARITY_LABELS[representative.rarity] || "通常"} / ${getReturnItemStatusLabel(representative.status)}`));
    section.appendChild(representativeNode);
  }
  if (history.length > 0) {
    const historyNode = textElement("div", "result-return-history");
    historyNode.appendChild(textElement("small", null, "印象に残った品（能力値への効果なし）"));
    history.forEach((item, index) => {
      const row = document.createElement("div");
      row.appendChild(textElement("span", null, item.name));
      const detail = document.createElement("span");
      detail.textContent = `${getReturnItemStatusLabel(item.status)} / B${item.depth}F `;
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

function leaveResult(overlay) {
  overlay.style.display = "none";
  state.gameState = "town";
  state.currentRun = null;
  state.party = [];
  addLog("街へ戻った。次の潜行に備えよう。");
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
  body.appendChild(createRecordSection(run));
  body.appendChild(createLootSection(run, outcome));
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

  const questSection = textElement("section", "result-focus-section");
  setAttributeSafe(questSection, "aria-labelledby", "result-quest-title");
  const questHeading = textElement("h2", "result-section-heading");
  questHeading.id = "result-quest-title";
  questHeading.appendChild(textElement("span", null, "今回の依頼"));
  const questList = textElement("div", "result-quest-list");
  questList.appendChild(createQuestContent(run));
  questSection.appendChild(questHeading);
  questSection.appendChild(questList);
  body.appendChild(questSection);
  body.appendChild(textElement("div", "result-run-note", getEvaluationText(run, isSuccess)));

  const footer = textElement("div", "result-footer-actions");
  const castleButton = textElement("button", "btn btn-neon btn-block", "街へ戻る");
  castleButton.id = "btn-result-castle";
  setAttributeSafe(castleButton, "data-result-next", "town");
  footer.appendChild(castleButton);
  overlay.appendChild(header);
  overlay.appendChild(body);
  overlay.appendChild(footer);

  castleButton.addEventListener("click", () => {
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
