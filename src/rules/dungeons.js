// A run is one dungeon of five floors (#2058, #2060). `state.floor` stays a
// running number so maps, seeds, and per-floor ledgers keep one key per floor:
// floors 1-5 are the first dungeon, 6-10 the second, and so on. Rules that set
// strength or reward read the floor inside the dungeon, never the running
// number, so every dungeon starts at the same strength for a fresh adventurer.
import { DUNGEONS, DUNGEON_FLOOR_COUNT } from "../data/dungeons.js";

const toFloor = floor => Math.max(1, Math.floor(Number(floor) || 1));

/** Which dungeon a running floor number belongs to (0-based). */
export function getDungeonIndexForFloor(floor) {
  return Math.floor((toFloor(floor) - 1) / DUNGEON_FLOOR_COUNT);
}

/** The floor inside its dungeon, 1 to 5. Strength and reward read this. */
export function getDungeonFloor(floor) {
  return ((toFloor(floor) - 1) % DUNGEON_FLOOR_COUNT) + 1;
}

export function getDungeonEntryFloor(dungeonIndex) {
  return Math.max(0, Math.floor(Number(dungeonIndex) || 0)) * DUNGEON_FLOOR_COUNT + 1;
}

export function getDungeonBottomFloor(dungeonIndex) {
  return (Math.max(0, Math.floor(Number(dungeonIndex) || 0)) + 1) * DUNGEON_FLOOR_COUNT;
}

export function isDungeonEntryFloor(floor) {
  return Number.isInteger(floor) && floor >= 1 && getDungeonFloor(floor) === 1;
}

export function isDungeonBottomFloor(floor) {
  return Number.isInteger(floor) && floor >= 1 && getDungeonFloor(floor) === DUNGEON_FLOOR_COUNT;
}

export function getDungeonForFloor(floor) {
  return DUNGEONS[getDungeonIndexForFloor(floor) % DUNGEONS.length];
}

/** A floor as the player reads it inside a run: B3F. */
export function formatFloorCode(floor) {
  return `B${getDungeonFloor(floor)}F`;
}

/**
 * A floor in a record that spans dungeons: 坑道 B3F. A record without a
 * floor (0, or anything that is not a floor) reads as not recorded.
 */
export function formatDungeonFloor(floor) {
  if (!Number.isFinite(floor) || floor < 1) return "未記録";
  return `${getDungeonForFloor(floor).shortName} ${formatFloorCode(floor)}`;
}

/** Per-dungeon multipliers on enemy stats; see `DUNGEONS[].strength`. */
export function getDungeonStrength(floor) {
  return getDungeonForFloor(floor).strength;
}

/**
 * A dungeon opens when the one before it has been cleared: its guardian
 * beaten by a run that then came home. `clearedBottomFloors` is the saved
 * list of those bottom floors (`state.unlockedMilestones`).
 */
export function isDungeonOpen(dungeonIndex, clearedBottomFloors = []) {
  const dungeon = DUNGEONS[dungeonIndex];
  if (!dungeon || !dungeon.built) return false;
  if (dungeonIndex === 0) return true;
  return Array.isArray(clearedBottomFloors) &&
    clearedBottomFloors.includes(getDungeonBottomFloor(dungeonIndex - 1));
}

/** Entry floors a run may start from right now, in dungeon order. */
export function getOpenEntryFloors(clearedBottomFloors = []) {
  return DUNGEONS
    .filter(dungeon => isDungeonOpen(dungeon.index, clearedBottomFloors))
    .map(dungeon => getDungeonEntryFloor(dungeon.index));
}
