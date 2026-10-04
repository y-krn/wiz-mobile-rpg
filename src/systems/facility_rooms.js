// Which room a floor's special-room cell holds while a facility keeper is
// still in the dungeon (#2009), and once the facility has rebuilt it (#2010).
// Only the room kind on the already placed cell changes: floor generation and
// its random streams are untouched.
//
// Every facility owns the third floor of its biome band, in every cycle
// (#2018). The facility data names the band and the rooms.

import { getBiomeForFloor } from "../data/biomes.js";
import { FACILITIES, KEEPER_ROOM_FACILITY } from "../data/facilities.js";
import { getSpecialRoom } from "../rules/special_rooms.js";
import { normalizeCompanions } from "../state/facilities_state.js";
import { isFacilityNodeBought, isFacilityOpen } from "./facilities.js";

/** The facility whose keeper waits on this floor, or null. */
export function getFacilityForFloor(floor) {
  if ((floor - 1) % 5 !== 2) return null;
  const biomeId = getBiomeForFloor(floor)?.id;
  return FACILITIES.find(facility => facility.site.biomeId === biomeId) || null;
}

/** The third floor of the collapsed mine band, in every cycle. */
export function isForemanFloor(floor) {
  return getFacilityForFloor(floor)?.id === "miner_guild";
}

/**
 * The room kind that replaces the biome's special room on this floor, or null.
 * The keeper waits there until brought home; a run that is already leading the
 * keeper out does not meet them again. Once the keeper is home and the
 * facility has rebuilt the room, the rebuilt room stands there instead.
 */
export function getFacilityRoomKind(floor, { feats, run, facilities } = {}) {
  const facility = getFacilityForFloor(floor);
  if (!facility) return null;
  if (isFacilityOpen(feats, facility.id)) {
    const rebuilt = facility.nodes.find(node => node.grants.room && isFacilityNodeBought(facilities, node.id));
    return rebuilt ? rebuilt.grants.room : null;
  }
  if (normalizeCompanions(run?.companions).includes(facility.companion.id)) return null;
  return facility.site.keeperRoom;
}

/** Swap the placed biome room for the facility room. Returns true when swapped. */
export function applyFacilityRoom(grid, floor, context = {}) {
  const kind = getFacilityRoomKind(floor, context);
  const biomeRoom = getBiomeForFloor(floor)?.gimmicks?.specialRoom;
  if (!kind || !biomeRoom || !Array.isArray(grid)) return false;
  for (const row of grid) {
    for (const cell of row || []) {
      const room = getSpecialRoom(cell);
      if (room?.kind === biomeRoom && !room.used) {
        room.kind = kind;
        return true;
      }
    }
  }
  return false;
}

/** The facility whose keeper still waits on this floor, or null. */
export function getWaitingKeeperFacility(grid) {
  for (const row of Array.isArray(grid) ? grid : []) {
    for (const cell of row || []) {
      const room = getSpecialRoom(cell);
      if (room && !room.used && KEEPER_ROOM_FACILITY.has(room.kind)) return KEEPER_ROOM_FACILITY.get(room.kind);
    }
  }
  return null;
}

/** True when the floor holds a facility keeper who has not been freed. */
export function hasWaitingKeeper(grid) {
  return Boolean(getWaitingKeeperFacility(grid));
}

/**
 * A fight started in a keeper's room was won: the keeper joins the run and
 * the room is spent. Returns the facility, or null when the cell holds no
 * waiting keeper who is freed by a fight.
 */
export function freeKeeperAfterFight(cell, run) {
  const room = getSpecialRoom(cell);
  const facility = room && !room.used ? KEEPER_ROOM_FACILITY.get(room.kind) : null;
  if (!facility || facility.site.rescue.kind !== "fight" || !run) return null;
  run.companions = normalizeCompanions([...(run.companions || []), facility.companion.id]);
  room.used = true;
  room.discovered = true;
  return facility;
}
