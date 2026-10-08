// The up stairs are the way home (#2066, #2062). From the dungeon's first
// floor they lead out and end the run safely; walking out is the only way to
// carry the treasure and bring a keeper home.
import { describeFloor } from "../ui/floor_label.js";
import { ascendToFloor } from "../movement.js";
import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { state } from "../state.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { getEscortNames } from "../systems/facilities.js";
import { isDungeonEntryFloor } from "../rules/dungeons.js";

function createNote(text, testId) {
  const note = document.createElement("p");
  note.className = "submenu-info stairs-up-note";
  if (note.dataset) note.dataset.testid = testId;
  note.textContent = text;
  return note;
}

function describeWayHome(roundTrip, floor) {
  const escort = getEscortNames(state.currentRun);
  const carried = [
    roundTrip?.treasure ? "至宝を持ち" : "",
    escort ? `${escort}を連れ` : ""
  ].filter(Boolean).join("、");
  if (!isDungeonEntryFloor(floor)) {
    return roundTrip?.awake
      ? "迷宮は目を覚ましている。後ろから追われながら、来た道を戻る。"
      : "ここで引き返すと迷宮が目を覚まし、後ろから追われる。戻った階は来たときのまま残っている。";
  }
  return carried
    ? `地上へ出ると冒険が終わる。${carried}て街へ戻る。`
    : "地上へ出ると冒険が終わる。素材と未使用の持ち込み品を守って街へ戻る。";
}

export function renderStairsUp(optGrid) {
  optGrid.replaceChildren();
  const floor = state.floor;
  const roundTrip = state.currentRun?.roundTrip;

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "btn btn-neon btn-block";
  const climbs = !isDungeonEntryFloor(floor);
  if (leave.dataset) leave.dataset.stairsUp = climbs ? "ascend" : "surface";
  leave.textContent = climbs
    ? `${describeFloor(state, floor - 1)}へ戻る`
    : "地上へ出て冒険を終える";
  leave.addEventListener("click", () => {
    // The submenu closes with an animation; a second tap must not climb twice.
    if (state.transitioning) return;
    if (climbs) {
      closeSubmenu();
      ascendToFloor(floor - 1);
      return;
    }
    triggerRunResult("surface");
  });

  const stay = document.createElement("button");
  stay.type = "button";
  stay.className = "btn btn-block";
  stay.textContent = "とどまる";
  stay.addEventListener("click", () => {
    closeSubmenu();
  });

  optGrid.append(
    createRunStakesSummary(),
    createNote(describeWayHome(roundTrip, floor), "stairs-up-note"),
    leave,
    stay
  );
}
