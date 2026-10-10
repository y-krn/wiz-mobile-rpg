// The abyssal throne's rule (#2063): the adventurer may put out their own
// light. In the dark, monsters notice later (fewer encounters, the strong enemy
// senses from nearer) and chests are better (equipment one grade up), but less
// is seen: traps and floor features beside the adventurer are no longer noticed
// before they are stepped on. A light spell lights it again. Runtime state:
// `state.darkness`, cleared when a run starts or the dungeon has no such rule.
import { getDungeonRule } from "../rules/dungeons.js";

export function getDungeonDarkRule(floor) {
  if (!Number.isInteger(floor) || floor < 1) return null;
  const rule = getDungeonRule(floor);
  return rule?.id === "darkness" ? rule : null;
}

/** Whether the adventurer walks in the dark right now. */
export function isDark(stateLike) {
  return Boolean(stateLike?.darkness) && Boolean(getDungeonDarkRule(stateLike?.floor)) && !(stateLike.lightTurns > 0);
}

/** Put out or light the adventurer's own light. Returns the new darkness, or null without the rule. */
export function toggleDarkness(stateLike) {
  if (!getDungeonDarkRule(stateLike?.floor)) return null;
  stateLike.darkness = !stateLike.darkness;
  if (stateLike.darkness) {
    stateLike.lightTurns = 0;
    stateLike.lightPower = "";
  }
  return stateLike.darkness;
}

export function applyDarknessToEncounterChance(rate, stateLike) {
  return isDark(stateLike) ? rate * getDungeonDarkRule(stateLike.floor).encounterFactor : rate;
}

/** Multiplier on how far the strong enemy senses the adventurer. */
export function getDarknessDetectionFactor(stateLike) {
  return isDark(stateLike) ? getDungeonDarkRule(stateLike.floor).detectionFactor : 1;
}

/** Grades a chest's equipment rises when opened in the dark. */
export function getDarknessChestRarityBonus(stateLike) {
  return isDark(stateLike) ? getDungeonDarkRule(stateLike.floor).chestRarityBonus : 0;
}
