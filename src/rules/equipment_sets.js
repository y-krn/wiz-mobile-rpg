// Equipment families (系統のそろい効果, #2024).
//
// Every piece of equipment shows its families (tags). When three or more
// equipped, identified pieces share one of the families below, that family's
// set effect applies: one Support-sized bonus on an axis the family already
// stands for. Nothing is stored; the count is read from the loadout.
//
// Only the families a loadout can actually reach three of are sets: iron
// (weapon, great shield, heavy armor), ward (shield, armor, accessory), spirit
// (medium, robe, accessory), and ambush (dagger, small shield, accessory).

import { ITEMS } from "../data/items.js";

/** Pieces of one family a loadout needs for its set effect. */
export const EQUIPMENT_SET_SIZE = 3;

const set = definition => Object.freeze({ ...definition, bonus: Object.freeze({ ...definition.bonus }) });

/**
 * `bonus` maps a stat axis to its value: `def` is added to the character's
 * DEF, every other axis is read through the Support affix sum.
 */
export const EQUIPMENT_SETS = Object.freeze([
  set({ id: "iron", label: "鉄", effect: "防御力+2", bonus: { def: 2 } }),
  set({ id: "ward", label: "守勢", effect: "魔除け+10%", bonus: { spellGuard: 10 } }),
  set({ id: "spirit", label: "霊", effect: "術力+10%", bonus: { spellPower: 10 } }),
  set({ id: "ambush", label: "奇襲", effect: "先制+5", bonus: { firstStrike: 5 } })
]);

const SLOT_IDS = Object.freeze(["weapon", "shield", "armor", "accessory", "accessory2"]);

function getEquippedItems(char) {
  const equipment = char?.equipment;
  if (!equipment || typeof equipment !== "object") return [];
  return SLOT_IDS.map(slot => equipment[slot]).filter(Boolean);
}

/**
 * The families one equipped item counts for. A plain base id counts with its
 * base families; a generated item counts with its own families once it is
 * identified, and with none while it is not.
 */
export function getItemSetFamilies(item) {
  if (!item) return [];
  if (typeof item === "string") return [...new Set(ITEMS[item]?.tags || [])];
  if (item.identified !== true) return [];
  const tags = Array.isArray(item.tags) ? item.tags : ITEMS[item.baseId]?.tags;
  return [...new Set(Array.isArray(tags) ? tags : [])];
}

/** How many equipped pieces carry each set family. */
export function getEquipmentSetCounts(char) {
  const counts = Object.fromEntries(EQUIPMENT_SETS.map(definition => [definition.id, 0]));
  getEquippedItems(char).forEach(item => {
    getItemSetFamilies(item).forEach(family => {
      if (Object.hasOwn(counts, family)) counts[family] += 1;
    });
  });
  return counts;
}

/** Every set with its count and whether its effect applies, in authored order. */
export function listEquipmentSets(char) {
  const counts = getEquipmentSetCounts(char);
  return EQUIPMENT_SETS.map(definition => ({
    ...definition,
    count: counts[definition.id],
    active: counts[definition.id] >= EQUIPMENT_SET_SIZE
  }));
}

// DEF is a base stat owned by `getCharDef`; every other axis is a Support
// affix axis owned by `getCharAffixSum`. Each entry point asks for its own
// kind, so no bonus can be counted twice.
const BASE_STAT_AXES = new Set(["def"]);
const SET_AXES = new Set(EQUIPMENT_SETS.flatMap(definition => Object.keys(definition.bonus)));

function getActiveSetBonus(char, axis) {
  if (!SET_AXES.has(axis) || !char?.equipment) return 0;
  const counts = getEquipmentSetCounts(char);
  return EQUIPMENT_SETS.reduce(
    (sum, definition) => sum + (counts[definition.id] >= EQUIPMENT_SET_SIZE ? definition.bonus[axis] || 0 : 0),
    0
  );
}

/** The bonus the active sets add to a base stat (DEF). */
export function getEquipmentSetStatBonus(char, axis) {
  return BASE_STAT_AXES.has(axis) ? getActiveSetBonus(char, axis) : 0;
}

/** The bonus the active sets add on a Support affix axis. */
export function getEquipmentSetAffixBonus(char, axis) {
  return BASE_STAT_AXES.has(axis) ? 0 : getActiveSetBonus(char, axis);
}

/**
 * What changed between two loadouts, for the preview and the log: sets that
 * became active, sets that stopped, and sets whose count moved.
 */
export function compareEquipmentSets(beforeChar, afterChar) {
  const before = listEquipmentSets(beforeChar);
  const after = listEquipmentSets(afterChar);
  return after
    .map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      effect: entry.effect,
      before: before[index].count,
      after: entry.count,
      gained: entry.active && !before[index].active,
      lost: !entry.active && before[index].active
    }))
    .filter(change => change.before !== change.after);
}
