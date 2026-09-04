import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { appendOwnershipBadge, getItemOwnership } from "../ui/common_shell.js";
import { state } from "../state.js";
import { getCharMaxMp, getItemData } from "../data.js";
import { trackExplorationDecision, trackPortalDecision } from "../telemetry.js";
import {
  getBandIndexForFloor,
  getBandClue,
  getBandTrialForFloor,
  getStoredBandTrial
} from "../rules/floor_trials.js";

let pendingPortalDecision = null;

function createNextBandClue() {
  const nextFloor = state.floor + 1;
  const runSeed = state.currentRun?.runSeed;
  if (!runSeed) return null;
  const bandIndex = getBandIndexForFloor(nextFloor);
  const trial = getBandTrialForFloor(runSeed, nextFloor, state.currentRun?.trialBands?.[bandIndex]);
  const storedTrial = getStoredBandTrial(trial);
  if (storedTrial && !state.currentRun.trialBands?.[bandIndex]) {
    state.currentRun.trialBands ||= {};
    state.currentRun.trialBands[bandIndex] = storedTrial;
  }
  const clue = getBandClue(trial, nextFloor);
  if (!clue) return null;

  const section = document.createElement("section");
  section.className = "milestone-portal-clue";
  section.dataset.infoRole = "next-band-clue";
  section.setAttribute("aria-label", "次の階層帯の兆候");
  const title = document.createElement("strong");
  title.textContent = "次の階層帯の兆候";
  const text = document.createElement("p");
  text.textContent = clue;
  section.append(title, text);
  return section;
}

function createPortalVitals() {
  const section = document.createElement("section");
  section.className = "milestone-portal-vitals";
  section.dataset.infoRole = "vitals";
  section.setAttribute("aria-label", "現在のHPとMP");

  const title = document.createElement("strong");
  title.className = "milestone-portal-section-title";
  title.textContent = "現在の状態";
  section.appendChild(title);

  const party = document.createElement("div");
  party.className = "milestone-portal-party";
  (state.party || []).forEach(character => {
    const row = document.createElement("div");
    row.className = "milestone-portal-vital-row";
    const name = document.createElement("span");
    name.className = "milestone-portal-vital-name";
    name.textContent = character.name || "冒険者";
    const hp = document.createElement("span");
    hp.className = "milestone-portal-hp";
    hp.textContent = `HP ${character.hp ?? 0}/${character.maxHp ?? 0}`;
    const mp = document.createElement("span");
    mp.className = "milestone-portal-mp";
    mp.textContent = `MP ${character.mp ?? 0}/${getCharMaxMp(character)}`;
    row.append(name, hp, mp);
    party.appendChild(row);
  });
  if ((state.party || []).length === 0) {
    party.textContent = "現在のHP / MPを確認できません";
  }
  section.appendChild(party);
  return section;
}

function createPortalBagSummary() {
  return createBagCapacitySummary(state.inventory, {
    className: "milestone-portal-bag",
    note: "装備中の品は枠外。ここに表示される空き枠は、次の戦果を拾う余地です。"
  });
}

function getLootDisplayName(item) {
  const data = getItemData(item);
  return item?.unidentifiedName || data?.name || item?.name || "不明な戦果";
}

function createPortalLootSummary() {
  const entries = (state.currentRun?.unbankedObjectLoot || [])
    .filter(entry => entry?.item);
  const section = document.createElement("section");
  section.className = "milestone-portal-loot";
  section.dataset.infoRole = "unbanked-object-loot";
  section.setAttribute("aria-label", "未確定object lootの内訳");

  const heading = document.createElement("div");
  heading.className = "milestone-portal-section-heading";
  const title = document.createElement("strong");
  title.className = "milestone-portal-section-title";
  title.textContent = "未確定 object loot";
  const count = document.createElement("span");
  count.className = "milestone-portal-loot-count";
  count.dataset.lootCount = String(entries.length);
  count.textContent = `${entries.length}点`;
  heading.append(title, count);
  section.appendChild(heading);

  const note = document.createElement("p");
  note.className = "milestone-portal-note";
  note.textContent = "Returnなら全点が確定。Pushなら全点を次のPortalまで賭け続けます。";
  section.appendChild(note);

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "未確定のobject lootはありません。";
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("div");
  list.className = "milestone-portal-loot-list";
  entries.forEach(entry => {
    const row = document.createElement("div");
    row.className = "milestone-portal-loot-row";
    row.dataset.lootId = entry.id || "";
    const name = document.createElement("span");
    name.className = "milestone-portal-loot-name";
    name.textContent = getLootDisplayName(entry.item);
    const detail = document.createElement("span");
    detail.className = "milestone-portal-loot-detail";
    detail.textContent = getItemData(entry.item)?.type || "object";
    row.append(name, detail);
    appendOwnershipBadge(row, getItemOwnership(entry.item, {
      state,
      lootEntryId: entry.id
    }));
    list.appendChild(row);
  });
  section.appendChild(list);
  return section;
}

function createPortalMaterialSummary() {
  const summary = createRunStakesSummary();
  summary.classList.add("milestone-portal-materials");
  summary.dataset.infoRole = "materials-side-info";
  const label = document.createElement("div");
  label.className = "milestone-portal-side-info-label";
  label.textContent = "素材（object lootとは別管理）";
  summary.prepend(label);
  return summary;
}

function createPortalDecisionCard(decision, name, description, buttonText) {
  const card = document.createElement("section");
  card.className = "milestone-portal-choice-card";
  card.dataset.portalDecision = decision;
  const label = document.createElement("strong");
  label.className = "milestone-portal-choice-label";
  label.textContent = name;
  const copy = document.createElement("p");
  copy.className = "milestone-portal-choice-description";
  copy.textContent = description;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-block milestone-portal-choice";
  button.dataset.portalDecision = decision;
  button.textContent = buttonText;
  button.addEventListener("click", () => {
    pendingPortalDecision = decision;
    renderPortalSurface(document.getElementById("submenu-options"));
  });
  card.append(label, copy, button);
  return card;
}

function createPortalChoiceSurface() {
  const section = document.createElement("section");
  section.className = "milestone-portal-choices";
  section.setAttribute("aria-label", "帰還の門での判断");
  const title = document.createElement("strong");
  title.className = "milestone-portal-section-title";
  title.textContent = "このPortalで決める";
  section.appendChild(title);
  section.appendChild(createPortalDecisionCard(
    "return",
    "Return",
    "未確定戦果をすべて確定してrunを終了し、安全に帰還します。",
    "撤退して素材を100%、未確定戦果をすべて持ち帰る"
  ));
  section.appendChild(createPortalDecisionCard(
    "push",
    "Push",
    "今の確定機会を見送り、戦果を失わずに次のPortalまで進みます。",
    "探索を続ける"
  ));
  return section;
}

function confirmPortalDecision() {
  const decision = pendingPortalDecision;
  if (!decision) return false;
  trackExplorationDecision(decision === "return" ? "return" : "continue", {
    state,
    source: "return_portal"
  });
  trackPortalDecision(decision, {
    state,
    portalType: "milestone_portal",
    ...getNextBandTrialIds()
  });
  if (decision === "return") {
    triggerRunResult("milestone_portal");
  } else {
    closeSubmenu();
  }
  pendingPortalDecision = null;
  return true;
}

function createPortalConfirmation() {
  const section = document.createElement("section");
  section.className = "milestone-portal-confirmation";
  section.dataset.portalDecision = pendingPortalDecision;
  section.setAttribute("aria-live", "polite");
  const title = document.createElement("strong");
  title.className = "milestone-portal-confirmation-title";
  title.textContent = `${pendingPortalDecision === "return" ? "Return" : "Push"}を確定しますか？`;
  const description = document.createElement("p");
  description.textContent = pendingPortalDecision === "return"
    ? "未確定 object lootをすべて確定し、追加の危険なしでrunを終了します。"
    : "未確定 object lootは失われません。次のPortalまでそのまま賭け続けます。";
  section.append(title, description);
  return section;
}

function createPortalConfirmationActions() {
  const actions = document.createElement("div");
  actions.className = "milestone-portal-confirmation-actions";
  const confirm = document.createElement("button");
  confirm.id = "btn-portal-confirm";
  confirm.type = "button";
  confirm.className = "btn btn-block milestone-portal-choice";
  confirm.textContent = pendingPortalDecision === "return"
    ? "Returnを確定して安全に帰還"
    : "Pushを確定して探索を続ける";
  confirm.addEventListener("click", confirmPortalDecision);
  const change = document.createElement("button");
  change.id = "btn-portal-change";
  change.type = "button";
  change.className = "btn btn-block milestone-portal-choice milestone-portal-change";
  change.textContent = "Return / Pushを選び直す";
  change.addEventListener("click", () => {
    pendingPortalDecision = null;
    renderPortalSurface(document.getElementById("submenu-options"));
  });
  actions.append(confirm, change);
  return actions;
}

function renderPortalSurface(optGrid) {
  if (!optGrid) return;
  optGrid.innerHTML = "";
  optGrid.append(
    createPortalVitals(),
    createPortalBagSummary(),
    createPortalLootSummary(),
    createPortalMaterialSummary()
  );
  const clue = createNextBandClue();
  if (clue) optGrid.appendChild(clue);
  if (pendingPortalDecision) {
    optGrid.append(createPortalConfirmation(), createPortalConfirmationActions());
  } else {
    optGrid.appendChild(createPortalChoiceSurface());
  }
}

function getNextBandTrialIds() {
  const nextFloor = state.floor + 1;
  const runSeed = state.currentRun?.runSeed;
  if (!runSeed) return {};
  const bandIndex = getBandIndexForFloor(nextFloor);
  const trial = getBandTrialForFloor(runSeed, nextFloor, state.currentRun?.trialBands?.[bandIndex]);
  return { nextBandMainId: trial?.mainId, nextBandSubId: trial?.subId };
}

export function renderMilestonePortal(optGrid) {
  pendingPortalDecision = null;
  renderPortalSurface(optGrid);
}
