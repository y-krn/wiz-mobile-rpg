// Which dungeons are open, and what a returning run opens (#2058, #2060).
// A dungeon is cleared when a run beats its guardian and then comes home.
// The saved list of cleared bottom floors is `state.unlockedMilestones`, the
// same list that once held the unlocked start floors, so an old save keeps
// what it had: a guardian it has beaten is a dungeon it has cleared.
import { DUNGEONS } from "../data/dungeons.js";
import {
  getDungeonBottomFloor,
  getDungeonIndexForFloor,
  isDungeonBottomFloor,
  isDungeonOpen
} from "../rules/dungeons.js";

function getClearedFloors(stateLike) {
  return Array.isArray(stateLike?.unlockedMilestones) ? stateLike.unlockedMilestones : [];
}

/** Every dungeon in order, with whether a run may enter it now. */
export function listDungeons(stateLike) {
  const cleared = getClearedFloors(stateLike);
  return DUNGEONS.map(dungeon => ({
    ...dungeon,
    open: isDungeonOpen(dungeon.index, cleared),
    cleared: cleared.includes(getDungeonBottomFloor(dungeon.index))
  }));
}

/** The dungeon whose clearing opens `dungeonIndex`, or null for the first. */
export function getDungeonOpener(dungeonIndex) {
  return dungeonIndex > 0 ? DUNGEONS[dungeonIndex - 1] || null : null;
}

/**
 * The next dungeon a guardian victory on `floor` would open once the run
 * comes home, or null when nothing new would open.
 */
export function getDungeonOpenedByClearing(stateLike, floor) {
  if (!isDungeonBottomFloor(floor)) return null;
  const next = DUNGEONS[getDungeonIndexForFloor(floor) + 1];
  if (!next?.built) return null;
  return isDungeonOpen(next.index, getClearedFloors(stateLike)) ? null : next;
}

/**
 * Record the dungeons this run cleared. Call once, for a run that came home.
 * A round-trip run clears a dungeon only by carrying its treasure out.
 * Returns the ids of the dungeons that opened because of it.
 */
// Bottom floors whose treasure this run carries out: the guardians it beat,
// unless a round-trip run left the treasure behind.
function getClearedByRun(run) {
  const defeated = Array.isArray(run?.defeatedMilestones) ? run.defeatedMilestones : [];
  const carriedOut = !run?.roundTrip || run.roundTrip.treasure === true;
  return carriedOut ? defeated.filter(isDungeonBottomFloor) : [];
}

/**
 * Whether a run that came home carried out a treasure for the second time
 * or later (#2061). Call before `settleDungeonClears` records this run.
 */
export function carriesOutRepeatedTreasure(stateLike, run) {
  const cleared = getClearedFloors(stateLike);
  return getClearedByRun(run).some(floor => cleared.includes(floor));
}

export function settleDungeonClears(stateLike, run) {
  const clearedNow = getClearedByRun(run);
  if (clearedNow.length === 0) return [];
  const before = new Set(listDungeons(stateLike).filter(dungeon => dungeon.open).map(dungeon => dungeon.id));
  stateLike.unlockedMilestones = [...new Set([...getClearedFloors(stateLike), ...clearedNow])]
    .sort((a, b) => a - b);
  return listDungeons(stateLike)
    .filter(dungeon => dungeon.open && !before.has(dungeon.id))
    .map(dungeon => dungeon.id);
}
