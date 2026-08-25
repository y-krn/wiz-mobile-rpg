import { state } from "../state.js";
import { openSubmenu } from "../navigation.js";
import { getRunQuestBoardCandidates } from "../systems/run_quests.js";

let boardCandidates = null;
let selectedTemplateIds = new Set();
let pendingTemplateIds = null;

function getBoardStartFloor() {
  return Math.max(1, ...(state.unlockedMilestones || []));
}

function formatReward(template) {
  return Object.entries(template.reward?.materials || {})
    .map(([name, quantity]) => `${name} ${quantity}`)
    .join("・") || "なし";
}

function renderBoard(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid run-quest-board-grid";

  const note = document.createElement("div");
  note.className = "run-quest-board-note";
  note.textContent = `候補3件から1〜2件を選択（基準開始地点：B${getBoardStartFloor()}F）。開始地点に応じて目標階を確定します。`;
  optGrid.appendChild(note);

  boardCandidates.forEach(template => {
    const button = document.createElement("button");
    const selected = selectedTemplateIds.has(template.id);
    button.type = "button";
    button.className = `btn btn-neon run-quest-card${selected ? " is-selected" : ""}`;
    button.dataset.questTemplateId = template.id;
    button.setAttribute("aria-pressed", String(selected));

    const title = document.createElement("strong");
    title.textContent = template.name;
    const description = document.createElement("span");
    description.textContent = template.description;
    const reward = document.createElement("small");
    reward.textContent = `報酬：${formatReward(template)}`;
    button.append(title, description, reward);
    button.addEventListener("click", () => {
      if (selectedTemplateIds.has(template.id)) {
        selectedTemplateIds.delete(template.id);
      } else if (selectedTemplateIds.size < 2) {
        selectedTemplateIds.add(template.id);
      }
      renderBoard(optGrid);
    });
    optGrid.appendChild(button);
  });

  const selectedSummary = document.createElement("div");
  selectedSummary.className = "run-quest-board-selection";
  selectedSummary.textContent = selectedTemplateIds.size > 0
    ? `選択中：${[...selectedTemplateIds].map(id => boardCandidates.find(template => template.id === id)?.name).filter(Boolean).join("・")}`
    : "未選択なら、従来どおりランダムで1〜2件を割り当てます。";
  optGrid.appendChild(selectedSummary);

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn btn-neon btn-block run-quest-board-confirm";
  confirm.textContent = "選択した依頼で潜行準備へ";
  confirm.disabled = selectedTemplateIds.size === 0;
  confirm.addEventListener("click", () => {
    pendingTemplateIds = [...selectedTemplateIds];
    openSubmenu("solo_start", "クラスを選択：依頼を受けて潜行");
  });
  optGrid.appendChild(confirm);

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "btn btn-secondary btn-block";
  skip.textContent = "依頼を選ばず出発準備へ";
  skip.addEventListener("click", () => {
    pendingTemplateIds = null;
    openSubmenu("solo_start", "クラスを選択：潜行ごとにLv1から開始");
  });
  optGrid.appendChild(skip);
}

export function renderRunQuestBoard(optGrid) {
  if (!boardCandidates) {
    boardCandidates = getRunQuestBoardCandidates({ startFloor: getBoardStartFloor() });
  }
  renderBoard(optGrid);
}

export function consumeSelectedRunQuestTemplateIds() {
  const selected = pendingTemplateIds;
  pendingTemplateIds = null;
  selectedTemplateIds = new Set();
  boardCandidates = null;
  return selected;
}
