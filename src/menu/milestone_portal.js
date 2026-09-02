import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { state } from "../state.js";
import { trackExplorationDecision, trackPortalDecision } from "../telemetry.js";
import {
  getBandIndexForFloor,
  getBandClue,
  getBandTrialForFloor,
  getStoredBandTrial
} from "../rules/floor_trials.js";

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
  section.setAttribute("aria-label", "次の階層帯の兆候");
  const title = document.createElement("strong");
  title.textContent = "次の階層帯の兆候";
  const text = document.createElement("p");
  text.textContent = clue;
  section.append(title, text);
  return section;
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
  optGrid.innerHTML = "";
  const retreat = document.createElement("button");
  retreat.type = "button";
  retreat.className = "btn btn-neon btn-block milestone-portal-action";
  retreat.textContent = "撤退して素材を100%、未確定戦果をすべて持ち帰る";
  retreat.addEventListener("click", () => {
    trackExplorationDecision("return", { state, source: "return_portal" });
    trackPortalDecision("return", { state, portalType: "milestone_portal", ...getNextBandTrialIds() });
    triggerRunResult("milestone_portal");
  });
  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "btn btn-block milestone-portal-action";
  continueButton.textContent = "探索を続ける";
  continueButton.addEventListener("click", () => {
    trackExplorationDecision("continue", { state, source: "return_portal" });
    trackPortalDecision("push", { state, portalType: "milestone_portal", ...getNextBandTrialIds() });
    closeSubmenu();
  });
  const clue = createNextBandClue();
  optGrid.append(createRunStakesSummary(), ...(clue ? [clue] : []), retreat, continueButton);
}
