// The feat list: every feat with its condition, progress, and reward (#2007).

import { state } from "../state.js";
import { listFeats } from "../systems/feats.js";
import { appendText, createFeatCard } from "../ui/feat_card.js";

export function renderFeatList(optGrid) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid feat-list-grid";
  const entries = listFeats(state.feats);
  const achievedCount = entries.filter(entry => entry.completed).length;

  const summary = document.createElement("p");
  summary.className = "feat-list-summary";
  summary.textContent = `達成 ${achievedCount} / ${entries.length}。進み具合は帰還・死亡を問わず積み上がる。`;
  optGrid.appendChild(summary);

  const groups = [
    { title: "これから", entries: entries.filter(entry => !entry.completed) },
    { title: "達成済み", entries: entries.filter(entry => entry.completed) }
  ];
  groups.forEach(group => {
    if (group.entries.length === 0) return;
    const section = document.createElement("section");
    section.className = "feat-list-section";
    section.setAttribute("aria-label", group.title);
    appendText(section, "h3", "feat-list-heading", group.title);
    group.entries.forEach(entry => section.appendChild(createFeatCard(entry)));
    optGrid.appendChild(section);
  });
}
