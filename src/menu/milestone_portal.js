import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { state } from "../state.js";
import { getCharMaxMp } from "../data.js";
import { trackExplorationDecision, trackPortalDecision, trackUxDecisionOpened, trackUxDecisionResolved } from "../telemetry.js";
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
    note: "装備中の品は枠外。空き枠は迷宮で拾う品の余地です。"
  });
}

function createPortalMaterialSummary() {
  const summary = createRunStakesSummary();
  summary.classList.add("milestone-portal-materials");
  summary.dataset.infoRole = "materials-side-info";
  const label = document.createElement("div");
  label.className = "milestone-portal-side-info-label";
  label.textContent = "帰還で守られる賭け金";
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
  title.textContent = "この帰還の門で決める";
  section.appendChild(title);
  section.appendChild(createPortalDecisionCard(
    "return",
    "ここで帰還",
    "素材と未使用の持ち込み品を守って、今回の冒険を終える。",
    "素材と持ち込み品を持って帰還"
  ));
  section.appendChild(createPortalDecisionCard(
    "push",
    "さらに深く進む",
    "素材と未使用の持ち込み品を賭けたまま、さらに深く進む。",
    "賭け金を持ってさらに進む"
  ));
  return section;
}

function confirmPortalDecision() {
  const decision = pendingPortalDecision;
  if (!decision) return false;
  trackUxDecisionResolved("portal", "commit");
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
  title.textContent = pendingPortalDecision === "return"
    ? "ここで帰還しますか？"
    : "さらに深く進みますか？";
  const description = document.createElement("p");
  description.textContent = pendingPortalDecision === "return"
    ? "素材と未使用の持ち込み品を守って帰還します。"
    : "素材と未使用の持ち込み品を賭けたまま、さらに深く進みます。";
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
    ? "ここで帰還する"
    : "さらに深く進む";
  confirm.addEventListener("click", confirmPortalDecision);
  const change = document.createElement("button");
  change.id = "btn-portal-change";
  change.type = "button";
  change.className = "btn btn-block milestone-portal-choice milestone-portal-change";
  change.textContent = "判断を選び直す";
  change.addEventListener("click", () => {
    trackUxDecisionResolved("portal", "back");
    pendingPortalDecision = null;
    renderPortalSurface(document.getElementById("submenu-options"));
    trackUxDecisionOpened("portal");
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
  trackUxDecisionOpened("portal");
  renderPortalSurface(optGrid);
}
