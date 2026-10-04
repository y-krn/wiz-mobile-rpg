// The dungeon guidebook screen (#2013): decoded pages to read, and the next
// page to decode with fragments brought home.

import { state, addLog, saveGame } from "../state.js";
import { playSound } from "../audio.js";
import { decodeNextGuidebookPage, getNextGuidebookPage, listGuidebookPages } from "../systems/guidebook.js";
import { normalizeGuidebookState } from "../state/guidebook_state.js";
import { formatFeatReward, settleTownFeats } from "../systems/feats.js";

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function decodeNextPage(optGrid) {
  const decoded = decodeNextGuidebookPage(state.guidebook);
  if (!decoded.ok) return;
  state.guidebook = decoded.guidebook;
  playSound("item");
  addLog(`手引き書の頁「${decoded.page.title}」を解読した。`);
  // Reading pages is progress made in the town, so its feat settles here.
  const settled = settleTownFeats(state.feats, counters => {
    counters.guidePagesDecoded = decoded.guidebook.decoded;
  }, state.records?.totalRuns);
  state.feats = settled.feats;
  Object.entries(settled.rewards).forEach(([name, quantity]) => {
    state.metaMaterials[name] = (state.metaMaterials[name] || 0) + quantity;
  });
  settled.completed.forEach(feat => {
    addLog(`【偉業達成】${feat.name}（${feat.condition}）。報酬 ${formatFeatReward(feat)}`);
  });
  saveGame();
  renderGuidebook(optGrid, `[data-guidebook-page="${decoded.page.id}"]`);
}

export function renderGuidebook(optGrid, focusSelector = null) {
  optGrid.innerHTML = "";
  optGrid.className = "submenu-grid guidebook-grid";
  const guidebook = normalizeGuidebookState(state.guidebook);
  const pages = listGuidebookPages(guidebook);
  const next = getNextGuidebookPage(guidebook);

  const summary = appendText(
    optGrid,
    "p",
    "guidebook-summary",
    `断片 ${guidebook.fragments}枚・解読 ${guidebook.decoded} / ${pages.length}頁。断片は強敵と階層守護者から得られ、生還した時だけ持ち帰れる。`
  );
  summary.setAttribute("data-guidebook-fragments", String(guidebook.fragments));

  pages.forEach(({ page, number, decoded }) => {
    const card = document.createElement("article");
    card.className = `guidebook-page${decoded ? " is-decoded" : ""}`;
    card.setAttribute("data-guidebook-page", page.id);
    card.setAttribute("data-guidebook-decoded", String(decoded));
    card.tabIndex = -1;
    appendText(card, "strong", "guidebook-page-title", `第${number}頁：${decoded ? page.title : "（未解読）"}`);
    if (decoded) {
      page.lines.forEach(line => appendText(card, "p", "guidebook-page-line", line));
    } else if (page === next) {
      const enough = guidebook.fragments >= page.cost;
      const button = document.createElement("button");
      button.type = "button";
      button.id = "btn-guidebook-decode";
      button.className = "btn btn-neon btn-block guidebook-decode";
      button.textContent = `解読する（断片 ${page.cost}枚・所持 ${guidebook.fragments}枚）`;
      button.disabled = !enough;
      button.addEventListener("click", () => decodeNextPage(optGrid));
      card.appendChild(button);
      if (!enough) {
        appendText(card, "p", "guidebook-page-note", `あと${page.cost - guidebook.fragments}枚で解読できる。`);
      }
    } else {
      appendText(card, "p", "guidebook-page-note", "前の頁を解読すると読めるようになる。");
    }
    optGrid.appendChild(card);
  });

  if (focusSelector) optGrid.querySelector?.(focusSelector)?.focus?.();
}
