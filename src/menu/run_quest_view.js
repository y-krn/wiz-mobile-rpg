import { state } from "../state.js";
import { formatRunQuestProgress } from "../systems/run_quests.js";

export function renderRunQuests(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid run-quest-grid";
  if (!state.currentRun?.quests?.length) {
    const empty = document.createElement("div");
    empty.className = "submenu-info";
    empty.textContent = "このランにクエストはありません。";
    optGrid.appendChild(empty);
    return;
  }
  state.currentRun.quests.forEach(quest => {
    const card = document.createElement("div");
    card.className = `run-quest-card${quest.completed ? " completed" : ""}`;
    const reward = Object.entries(quest.reward.materials || {})
      .map(([name, quantity]) => `${name}×${quantity}`)
      .join(" / ");
    card.innerHTML = `
      <div class="run-quest-heading"><strong>${quest.name}</strong><span>${formatRunQuestProgress(quest, state.currentRun)}</span></div>
      <p>${quest.description}</p>
      <small>達成報酬 ${reward}</small>
    `;
    optGrid.appendChild(card);
  });
}
