// balance-impact: none — saved shape of the likely Core family draw (#2061).
//
// `byDungeon` holds each dungeon's three likely families for the current
// draw; `draws` counts the redraws so the next one is a new draw. A run that
// carried a treasure out again leaves `treasurePin` set until the next
// departure: the player may then fix one family of one open dungeon, and
// `pinned` remembers that choice for display until the next redraw.

import { CORE_FAMILY_IDS, LIKELY_CORE_FAMILY_COUNT } from "../data/core_families.js";
import { DUNGEONS } from "../data/dungeons.js";

export interface CoreFamilyPin {
  dungeonId: string;
  familyId: string;
}

export interface CoreFamilyState {
  draws: number;
  byDungeon: Record<string, string[]>;
  treasurePin: boolean;
  pinned: CoreFamilyPin | null;
}

const DUNGEON_IDS: readonly string[] = DUNGEONS.map(dungeon => dungeon.id);
const FAMILY_IDS: readonly string[] = CORE_FAMILY_IDS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFamilyList(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length >= 1 && value.length <= LIKELY_CORE_FAMILY_COUNT &&
    value.every(id => typeof id === "string" && FAMILY_IDS.includes(id)) &&
    new Set(value).size === value.length;
}

function isPin(value: unknown): value is CoreFamilyPin {
  return isRecord(value) &&
    typeof value.dungeonId === "string" && DUNGEON_IDS.includes(value.dungeonId) &&
    typeof value.familyId === "string" && FAMILY_IDS.includes(value.familyId);
}

export function createDefaultCoreFamilyState(): CoreFamilyState {
  return { draws: 0, byDungeon: {}, treasurePin: false, pinned: null };
}

export function isNormalizedCoreFamilyState(value: unknown): value is CoreFamilyState {
  if (!isRecord(value) || !isRecord(value.byDungeon)) return false;
  return typeof value.draws === "number" && Number.isInteger(value.draws) && value.draws >= 0 &&
    Object.entries(value.byDungeon).every(([id, families]) => DUNGEON_IDS.includes(id) && isFamilyList(families)) &&
    typeof value.treasurePin === "boolean" &&
    (value.pinned === null || isPin(value.pinned));
}

/**
 * Normalize a stored draw. A save from before #2061 has none and loads as
 * "not drawn yet"; the first look at the dungeons draws it.
 */
export function normalizeCoreFamilyState(value: unknown): CoreFamilyState {
  if (!isRecord(value)) return createDefaultCoreFamilyState();
  const byDungeon: Record<string, string[]> = {};
  if (isRecord(value.byDungeon)) {
    Object.entries(value.byDungeon).forEach(([id, families]) => {
      if (DUNGEON_IDS.includes(id) && isFamilyList(families)) byDungeon[id] = [...families];
    });
  }
  const draws = typeof value.draws === "number" && Number.isInteger(value.draws) && value.draws >= 0
    ? value.draws
    : 0;
  return {
    draws,
    byDungeon,
    treasurePin: value.treasurePin === true,
    pinned: isPin(value.pinned) ? { dungeonId: value.pinned.dungeonId, familyId: value.pinned.familyId } : null
  };
}
