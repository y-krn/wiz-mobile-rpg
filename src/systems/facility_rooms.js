// Which room a floor's special-room cell holds while a facility keeper is
// still in the dungeon (#2009). Only the room kind on the already placed cell
// changes: floor generation and its random streams are untouched.

import { getBiomeForFloor } from "../data/biomes.js";
import { SPECIAL_ROOMS, getSpecialRoom } from "../rules/special_rooms.js";
import { isFacilityNodeBought, isFacilityOpen } from "./facilities.js";

/** The third floor of the collapsed mine band, in every cycle. */
export function isForemanFloor(floor) {
  return getBiomeForFloor(floor)?.id === "collapsed_mine" && (floor - 1) % 5 === 2;
}

/**
 * The room kind that replaces the mine vein on this floor, or null.
 * The foreman waits there until he has been brought home; a run that is
 * already leading him out does not meet him again. Once he is home and the
 * guild has built its outpost, the outpost stands there instead (#2010).
 */
export function getFacilityRoomKind(floor, { feats, run, facilities } = {}) {
  if (!isForemanFloor(floor)) return null;
  if (isFacilityOpen(feats, "miner_guild")) {
    return isFacilityNodeBought(facilities, "miner_outpost") ? SPECIAL_ROOMS.MINER_OUTPOST : null;
  }
  if (run?.companion === "foreman") return null;
  return SPECIAL_ROOMS.TRAPPED_FOREMAN;
}

/** Swap the placed mine vein for the facility room. Returns true when swapped. */
export function applyFacilityRoom(grid, floor, context = {}) {
  const kind = getFacilityRoomKind(floor, context);
  if (!kind || !Array.isArray(grid)) return false;
  for (const row of grid) {
    for (const cell of row || []) {
      const room = getSpecialRoom(cell);
      if (room?.kind === SPECIAL_ROOMS.MINE_VEIN && !room.used) {
        room.kind = kind;
        return true;
      }
    }
  }
  return false;
}

/** True when the floor holds a facility keeper who has not been dug out. */
export function hasWaitingKeeper(grid) {
  return Array.isArray(grid) && grid.some(row => (row || []).some(cell => {
    const room = getSpecialRoom(cell);
    return room?.kind === SPECIAL_ROOMS.TRAPPED_FOREMAN && !room.used;
  }));
}
