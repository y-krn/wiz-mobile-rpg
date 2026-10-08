// Likely Core families (#2061). Pure rules: which families can be drawn, the
// draw for one dungeon, and the families the first chest offers. The saved
// draw and the redraw live in `src/systems/core_families.js`.
//
// The draw is build-blind: it reads the save seed, how many redraws have
// happened, and which Cores can appear at all. It never reads the loadout,
// the starting kit, or the player's history.
import { CORE_FAMILIES, CORE_FAMILY_IDS, LIKELY_CORE_FAMILY_COUNT } from "../data/core_families.js";
import { createRng } from "../seed_rng.js";

const FAMILY_BY_ID = new Map(CORE_FAMILIES.map(family => [family.id, family]));
const FAMILY_BY_CORE = new Map(CORE_FAMILIES.flatMap(family => family.coreIds.map(coreId => [coreId, family])));

export function getCoreFamily(familyId) {
  return FAMILY_BY_ID.get(familyId) || null;
}

export function getCoreFamilyForCore(coreId) {
  return FAMILY_BY_CORE.get(coreId) || null;
}

export function isCoreFamilyId(value) {
  return typeof value === "string" && FAMILY_BY_ID.has(value);
}

/** Family names joined for one line: 技・構え・呪い. */
export function formatCoreFamilies(familyIds) {
  return (Array.isArray(familyIds) ? familyIds : [])
    .map(id => getCoreFamily(id)?.name)
    .filter(Boolean)
    .join("・");
}

/** Every Core of the given families, or null when no family is given. */
export function getCoreIdsForFamilies(familyIds) {
  if (!Array.isArray(familyIds) || familyIds.length === 0) return null;
  return new Set(familyIds.flatMap(id => getCoreFamily(id)?.coreIds || []));
}

/**
 * Families with at least one Core that can appear right now, in table order.
 * `generatableCoreIds` comes from equipment generation, so a family whose
 * Cores are all retired or still locked by the Workshop is never promised.
 */
export function getAvailableCoreFamilyIds(generatableCoreIds) {
  const generatable = new Set(generatableCoreIds || []);
  return CORE_FAMILY_IDS.filter(id => getCoreFamily(id).coreIds.some(coreId => generatable.has(coreId)));
}

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * The likely families of one dungeon for one draw. The same save seed, draw
 * number, dungeon, and available families always give the same three.
 */
export function drawCoreFamilies(seed, drawIndex, dungeonId, availableFamilyIds) {
  const rng = createRng(`${seed || "core-families"}:core-families:${drawIndex}:${dungeonId}`);
  return shuffled(availableFamilyIds, rng).slice(0, LIKELY_CORE_FAMILY_COUNT);
}

/**
 * Fix one family in a dungeon's draw (the treasure, #2061). The fixed family
 * takes the first place; the other two stay as drawn.
 */
export function pinCoreFamily(familyIds, familyId) {
  const rest = familyIds.filter(id => id !== familyId);
  return [familyId, ...rest].slice(0, LIKELY_CORE_FAMILY_COUNT);
}

function pickOne(values, rng) {
  return values.length > 0 ? values[Math.floor(rng() * values.length)] : null;
}

/**
 * The families the first chest of a run offers: two from the dungeon's likely
 * families and one from outside them, so one offer is never what the plan
 * expected. With too few families on either side the rest is filled from
 * whatever is left. The order is shuffled so the outsider has no fixed place.
 */
export function pickSeedFamilies(likelyFamilyIds, availableFamilyIds, rng, count = 3) {
  const available = [...availableFamilyIds];
  const likely = likelyFamilyIds.filter(id => available.includes(id));
  const outside = available.filter(id => !likely.includes(id));
  const picked = [];
  const take = pool => {
    const id = pickOne(pool.filter(candidate => !picked.includes(candidate)), rng);
    if (id) picked.push(id);
  };
  take(likely);
  take(likely);
  take(outside);
  while (picked.length < count && available.some(id => !picked.includes(id))) take(available);
  return shuffled(picked.slice(0, count), rng);
}
