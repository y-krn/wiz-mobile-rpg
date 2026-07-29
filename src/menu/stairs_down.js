import { getFloorLabel } from "../data/floor_themes.js";
import { descendToFloor } from "../movement.js";
import { closeSubmenu } from "../navigation.js";
import { state } from "../state.js";

export function renderStairsDown(optGrid) {
  optGrid.replaceChildren();
  const nextFloor = state.floor + 1;

  const descend = document.createElement("button");
  descend.type = "button";
  descend.className = "btn btn-neon btn-block";
  descend.textContent = `${getFloorLabel(state, nextFloor)}へ降りる`;
  descend.addEventListener("click", () => {
    closeSubmenu();
    descendToFloor(nextFloor);
  });

  const stay = document.createElement("button");
  stay.type = "button";
  stay.className = "btn btn-block";
  stay.textContent = "降りずに進む";
  stay.addEventListener("click", closeSubmenu);

  optGrid.append(descend, stay);
}
