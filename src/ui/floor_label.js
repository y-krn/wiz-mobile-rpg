import { getFloorLabel, isFloorVisited } from "../data/floor_themes.js";

// How a floor is named on screen. A floor not reached yet has no name to
// show, so it is named by its number only instead of "???（地下2階）".
export function describeFloor(stateLike, floor) {
  return isFloorVisited(stateLike, floor) ? getFloorLabel(stateLike, floor) : `地下${floor}階`;
}
