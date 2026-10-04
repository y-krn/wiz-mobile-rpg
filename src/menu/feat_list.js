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

  // Ahead: the feats currently within reach first, closest first; the later
  // steps of each chain follow in their authored order.
  const ahead = entries
    .filter(entry => !entry.completed)
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      Number(right.entry.offered) - Number(left.entry.offered) ||
      (left.entry.offered ? right.entry.progress.ratio - left.entry.progress.ratio : 0) ||
      left.index - right.index)
    .map(({ entry }) => entry);
  const groups = [
    { title: "これから", entries: ahead },
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
