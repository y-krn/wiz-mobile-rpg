// One feat as a card: name and status, condition, progress bar, reward.
// Shared by the town summary and the feat list (#2007).

import { formatFeatProgress, formatFeatReward } from "../systems/feats.js";

export function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** One feat row: name and status, condition, progress bar, reward. */
export function createFeatCard({ feat, completed, progress }) {
  const card = document.createElement("article");
  card.className = `feat-card${completed ? " is-completed" : ""}`;
  card.setAttribute?.("data-feat-id", feat.id);
  card.setAttribute?.("data-feat-completed", String(completed));

  const heading = document.createElement("div");
  heading.className = "feat-card-heading";
  appendText(heading, "strong", "feat-card-name", feat.name);
  appendText(heading, "span", "feat-card-status", completed ? "達成" : formatFeatProgress(feat, progress));
  card.appendChild(heading);
  appendText(card, "p", "feat-card-condition", feat.condition);

  const bar = document.createElement("div");
  bar.className = "feat-card-bar";
  bar.setAttribute?.("role", "progressbar");
  bar.setAttribute?.("aria-valuemin", "0");
  bar.setAttribute?.("aria-valuemax", String(progress.target));
  bar.setAttribute?.("aria-valuenow", String(completed ? progress.target : progress.current));
  bar.setAttribute?.("aria-label", `${feat.name}の進み具合`);
  const fill = document.createElement("span");
  if (fill.style) fill.style.width = `${Math.round((completed ? 1 : progress.ratio) * 100)}%`;
  bar.appendChild(fill);
  card.appendChild(bar);

  appendText(card, "span", "feat-card-reward", `報酬 ${formatFeatReward(feat)}${completed ? "（受け取り済み）" : ""}`);
  return card;
}
