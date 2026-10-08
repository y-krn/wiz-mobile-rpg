// The saved draw of likely Core families and when it changes (#2058, #2061).
//
// - Every dungeon holds three likely families, drawn from the save seed.
// - A run takes its dungeon's three at departure; a redraw never changes a
//   run already under way.
// - When a run that reached the third floor of its dungeon ends, every
//   dungeon draws again, whatever the outcome.
// - A run that carries a treasure out again lets the player fix one family
//   of one open dungeon before the next departure.
import { DUNGEONS } from "../data/dungeons.js";
import { getDungeonFloor, getDungeonForFloor } from "../rules/dungeons.js";
import { drawCoreFamilies, getAvailableCoreFamilyIds, isCoreFamilyId, pinCoreFamily } from "../rules/core_families.js";
import { normalizeCoreFamilyState } from "../state/core_families_state.js";
import { getGeneratableCoreIds } from "./equipment_generation.js";
import { getWorkshopGrants } from "./workshop.js";
import { listDungeons } from "./dungeon_progress.js";

/** A run whose deepest floor inside its dungeon is this or deeper redraws. */
export const CORE_FAMILY_REDRAW_FLOOR = 3;

/** Families that can be drawn with the save's Workshop unlocks. */
export function getDrawableCoreFamilyIds(stateLike) {
  return getAvailableCoreFamilyIds(getGeneratableCoreIds(getWorkshopGrants(stateLike?.workshop).affixIds));
}

// Dungeons are drawn in order, each avoiding the sets drawn before it.
function drawAll(stateLike, draws) {
  const available = getDrawableCoreFamilyIds(stateLike);
  const byDungeon = {};
  DUNGEONS.forEach(dungeon => {
    byDungeon[dungeon.id] = drawCoreFamilies(stateLike?.seed, draws, dungeon.id, available, Object.values(byDungeon));
  });
  return byDungeon;
}

/**
 * The current draw, with any dungeon that has none yet drawn now. A save
 * from before #2061 is drawn on first use.
 */
export function ensureCoreFamilyDraw(stateLike) {
  const current = normalizeCoreFamilyState(stateLike.coreFamilies);
  const missing = DUNGEONS.some(dungeon => !current.byDungeon[dungeon.id]);
  if (missing) {
    const drawn = drawAll(stateLike, current.draws);
    DUNGEONS.forEach(dungeon => {
      if (!current.byDungeon[dungeon.id]) current.byDungeon[dungeon.id] = drawn[dungeon.id];
    });
  }
  stateLike.coreFamilies = current;
  return current;
}

/** The three likely families of a dungeon right now. */
export function getLikelyCoreFamilies(stateLike, dungeonId) {
  return [...(ensureCoreFamilyDraw(stateLike).byDungeon[dungeonId] || [])];
}

/**
 * The likely families a run takes with it, for the dungeon of `entryFloor`.
 * Departing also ends a treasure's chance to fix a family: it is not banked.
 */
export function takeCoreFamiliesForRun(stateLike, entryFloor) {
  const draw = ensureCoreFamilyDraw(stateLike);
  draw.treasurePin = false;
  return [...(draw.byDungeon[getDungeonForFloor(entryFloor).id] || [])];
}

/** Whether a run that went this deep redraws when it ends. */
export function doesRunRedrawCoreFamilies(run) {
  const deepest = Number(run?.deepestFloor);
  return Number.isInteger(deepest) && deepest >= 1 && getDungeonFloor(deepest) >= CORE_FAMILY_REDRAW_FLOOR;
}

/**
 * Settle the draw when a run ends. `treasure` is true when this run carried
 * out a treasure that had been carried out before. Returns what changed.
 */
export function settleCoreFamilyRedraw(stateLike, run, { treasure = false } = {}) {
  if (!doesRunRedrawCoreFamilies(run)) return { redrawn: false, treasurePin: false };
  const current = normalizeCoreFamilyState(stateLike.coreFamilies);
  const draws = current.draws + 1;
  stateLike.coreFamilies = {
    draws,
    byDungeon: drawAll(stateLike, draws),
    treasurePin: treasure === true,
    pinned: null
  };
  return { redrawn: true, treasurePin: treasure === true };
}

/** Whether the treasure's fixing can be used on this dungeon now. */
export function canPinCoreFamily(stateLike, dungeonId) {
  const draw = normalizeCoreFamilyState(stateLike?.coreFamilies);
  return draw.treasurePin && listDungeons(stateLike).some(dungeon => dungeon.id === dungeonId && dungeon.open);
}

/**
 * Use the treasure: fix `familyId` as one of the dungeon's three. The other
 * two stay as drawn. Returns false when it cannot be used.
 */
export function pinCoreFamilyForDungeon(stateLike, dungeonId, familyId) {
  if (!isCoreFamilyId(familyId) || !canPinCoreFamily(stateLike, dungeonId)) return false;
  if (!getDrawableCoreFamilyIds(stateLike).includes(familyId)) return false;
  const draw = ensureCoreFamilyDraw(stateLike);
  draw.byDungeon[dungeonId] = pinCoreFamily(draw.byDungeon[dungeonId] || [], familyId);
  draw.treasurePin = false;
  draw.pinned = { dungeonId, familyId };
  return true;
}
