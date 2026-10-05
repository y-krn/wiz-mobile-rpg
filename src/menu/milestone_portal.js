import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { createBagCapacitySummary } from "../ui/bag_summary.js";
import { state } from "../state.js";
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
  section.setAttribute("aria-label", "この先の気配");
  const title = document.createElement("strong");
  title.textContent = "この先の気配";
  const text = document.createElement("p");
  text.textContent = clue;
  section.append(title, text);
  return section;
}

// One line: how full the bag is. HP and MP stay on the adventurer panel below
// the menu, so the portal does not repeat them.
function createPortalBagSummary() {
  return createBagCapacitySummary(state.inventory, {
    className: "milestone-portal-bag",
    showSlots: false,
    showNote: false
  });
}

function createPortalMaterialSummary() {
  const summary = createRunStakesSummary();
  summary.classList.add("milestone-portal-materials");
  summary.dataset.infoRole = "materials-side-info";
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
    createPortalMaterialSummary(),
    createPortalBagSummary()
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
