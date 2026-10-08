// balance-impact: none — remembered departure choices only (#2002).
//
// The last preparation is what the player chose for the previous departure:
// kit, optional Workshop weapon, crafted tools, and the dungeon, kept as the
// running number of its first floor (#2060). It only pre-fills the next
// preparation. It never grants or discounts anything.

import { isStartingKitId, type StartingKitId } from "./starting_kit.js";

export interface LastPreparation {
  kitId: StartingKitId;
  startingGear: string | null;
  recipeIds: string[];
  startFloor: number;
  /** The round-trip prototype rule was chosen (#2066). */
  roundTrip: boolean;
}

export type NormalizedLastPreparation = LastPreparation | null;

/** More tools than the bag and the powder recipes can ever hold. */
export const LAST_PREPARATION_RECIPE_LIMIT = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A run starts on the first floor of a dungeon: 1, 6, 11, ... A start floor
// saved by the old start-floor choice (5, 10, ...) is no longer a start and
// loads as the first dungeon.
function isStartFloor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= 1 && (value - 1) % 5 === 0;
}

export function isNormalizedLastPreparation(value: unknown): value is NormalizedLastPreparation {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return isStartingKitId(value.kitId) &&
    (value.startingGear === null || (typeof value.startingGear === "string" && value.startingGear.length > 0)) &&
    Array.isArray(value.recipeIds) &&
    value.recipeIds.length <= LAST_PREPARATION_RECIPE_LIMIT &&
    value.recipeIds.every(recipeId => typeof recipeId === "string" && recipeId.length > 0) &&
    isStartFloor(value.startFloor) &&
    typeof value.roundTrip === "boolean";
}

/**
 * Normalize a stored preparation. Anything without a known kit is treated as
 * "no last preparation", which is also how saves from before #2002 load.
 */
export function normalizeLastPreparation(value: unknown): NormalizedLastPreparation {
  if (!isRecord(value) || !isStartingKitId(value.kitId)) return null;
  const recipeIds = (Array.isArray(value.recipeIds) ? value.recipeIds : [])
    .filter((recipeId): recipeId is string => typeof recipeId === "string" && recipeId.length > 0)
    .slice(0, LAST_PREPARATION_RECIPE_LIMIT);
  return {
    kitId: value.kitId,
    startingGear: typeof value.startingGear === "string" && value.startingGear.length > 0
      ? value.startingGear
      : null,
    recipeIds,
    startFloor: isStartFloor(value.startFloor) ? value.startFloor : 1,
    roundTrip: value.roundTrip === true
  };
}
