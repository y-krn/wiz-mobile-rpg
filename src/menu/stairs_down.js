import { describeFloor } from "../ui/floor_label.js";
import { descendToFloor } from "../movement.js";
import { closeSubmenu } from "../navigation.js";
import { state } from "../state.js";
import { EVENT_TYPES } from "../constants/events.js";
import { isMilestoneFloor } from "../run_map_generator.js";
import {
  MILESTONE_CLEARED_STRUCTURE_MESSAGE,
  MILESTONE_STRUCTURE_MESSAGE
} from "../ui/milestone_disclosure.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { trackExplorationDecision } from "../telemetry.js";
import { getExplorationRecoveryOutlook } from "../systems/exploration_recovery.js";

function findMilestoneEvent(eventType) {
  for (let y = 0; y < state.map?.length; y++) {
    for (let x = 0; x < state.map[y].length; x++) {
      const cell = state.map[y][x];
      if (cell?.event === eventType && cell.milestoneFloor === state.floor) {
        return { cell, x, y };
      }
    }
  }
  return null;
}

function createFacilityStatus(label, eventType, guardianDefeated) {
  const location = findMilestoneEvent(eventType);
  const item = document.createElement("div");
  item.className = "milestone-disclosure-item";
  item.dataset.facility = eventType;

  const name = document.createElement("strong");
  name.textContent = label;

  const visited = document.createElement("span");
  visited.className = "milestone-disclosure-status";
  visited.textContent = location && state.visitedMap?.[location.y]?.[location.x]
    ? "訪問済み"
    : "未訪問";

  const availability = document.createElement("span");
  availability.className = guardianDefeated
    ? "milestone-disclosure-available"
    : "milestone-disclosure-locked";
  availability.textContent = guardianDefeated ? "利用可能" : "守護者を倒すと開く";

  item.append(name, visited, availability);
  return item;
}

function createMilestoneDisclosure(guardianDefeated) {
  const disclosure = document.createElement("section");
  disclosure.className = "milestone-disclosure";
  disclosure.setAttribute("aria-label", "節目の階の施設情報");

  const title = document.createElement("h2");
  title.className = "milestone-disclosure-title";
  title.textContent = "この階にあるもの";

  const intro = document.createElement("p");
  intro.className = "milestone-disclosure-intro";
  intro.textContent = guardianDefeated
    ? MILESTONE_CLEARED_STRUCTURE_MESSAGE
    : MILESTONE_STRUCTURE_MESSAGE;

  const facilities = document.createElement("div");
  facilities.className = "milestone-disclosure-list";
  facilities.append(
    createFacilityStatus("深層商人", EVENT_TYPES.MERCHANT, guardianDefeated),
    createFacilityStatus("帰還の門", EVENT_TYPES.RETURN_PORTAL, guardianDefeated)
  );

  disclosure.append(title, intro, facilities);
  return disclosure;
}

// Descending no longer heals (#1993): say what this floor can still give back
// before the player leaves it. Nothing is shown when there is nothing to gain.
function createRecoveryNote() {
  const outlook = getExplorationRecoveryOutlook(state);
  if (!outlook || outlook.suspended) return null;
  const amounts = [];
  if (outlook.hp > 0) amounts.push(`HP ${outlook.hp}`);
  if (outlook.mp > 0) amounts.push(`MP ${outlook.mp}`);
  if (amounts.length === 0) return null;

  const note = document.createElement("p");
  note.className = "submenu-info stairs-recovery-note";
  if (note.dataset) note.dataset.testid = "stairs-recovery-note";
  const amount = document.createElement("strong");
  amount.textContent = `この階を歩けば、あと${amounts.join("・")}回復できる。`;
  note.append(amount, " 階段を降りても回復はしない。");
  return note;
}

export function renderStairsDown(optGrid) {
  optGrid.replaceChildren();
  const nextFloor = state.floor + 1;
  const guardianDefeated = state.currentRun?.defeatedMilestones?.includes(state.floor) === true;
  // The caller titles the menu with the stored floor label; a floor not
  // reached yet is named by its number only.
  const menuTitle = document.getElementById("submenu-title");
  if (menuTitle) menuTitle.textContent = `${describeFloor(state, nextFloor)}への下り階段`;

  if (isMilestoneFloor(state.floor)) {
    optGrid.appendChild(createMilestoneDisclosure(guardianDefeated));
  }

  const descend = document.createElement("button");
  descend.type = "button";
  descend.className = "btn btn-neon btn-block";
  descend.textContent = `${describeFloor(state, nextFloor)}へ降りる`;
  if (isMilestoneFloor(state.floor) && !guardianDefeated) {
    descend.disabled = true;
    descend.className = "btn btn-block disabled";
    descend.textContent = "守護者を倒すまで降りられない";
  }
  descend.addEventListener("click", () => {
    // The submenu closes with an animation; a second tap during it must not
    // start another descent.
    if (state.transitioning) return;
    trackExplorationDecision("descend", { state, source: "stairs-down" });
    closeSubmenu();
    descendToFloor(nextFloor);
  });

  const stay = document.createElement("button");
  stay.type = "button";
  stay.className = "btn btn-block";
  stay.textContent = "降りずに進む";
  stay.addEventListener("click", () => {
    trackExplorationDecision("continue", { state, source: "stairs-down" });
    closeSubmenu();
  });

  const recoveryNote = createRecoveryNote();
  optGrid.append(createRunStakesSummary(), ...(recoveryNote ? [recoveryNote] : []), descend, stay);
}
