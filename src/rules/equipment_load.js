import { getItemData } from "./item_rules.js";

export const EQUIPMENT_LOAD_CLASSES = Object.freeze(["light", "standard", "heavy"]);
export const EQUIPMENT_LOAD_LABELS = Object.freeze({
  light: "速い",
  standard: "標準",
  heavy: "遅い"
});
export const EQUIPMENT_LOAD_INITIATIVE_MODIFIERS = Object.freeze({
  light: 2,
  standard: 0,
  heavy: -2
});

// A heavier item must never be cancelled by a lighter item in another slot.
// The aggregate therefore uses the maximum burden among equipped
// load-bearing items instead of a signed sum.
const LOAD_BURDEN = Object.freeze({ light: 0, standard: 1, heavy: 2 });
const LOAD_BEARING_TYPES = new Set(["weapon", "shield", "armor"]);

function normalizeLoadClass(value) {
  return EQUIPMENT_LOAD_CLASSES.includes(value) ? value : "standard";
}

export function getEquipmentLoadClass(item) {
  const data = getItemData(item);
  if (!data || !LOAD_BEARING_TYPES.has(data.type)) return null;
  return normalizeLoadClass(data.loadClass);
}

export function getEquipmentLoadScore(item) {
  const loadClass = getEquipmentLoadClass(item);
  return loadClass ? LOAD_BURDEN[loadClass] : null;
}

export function getCharacterEquipmentLoad(character) {
  const scores = Object.values(character?.equipment || {})
    .map(item => getEquipmentLoadScore(item))
    .filter(score => score !== null);
  // Empty/non-load-bearing equipment is the neutral standard burden. Once a
  // load-bearing item is equipped, the heaviest equipped class determines the
  // result, so heavy gear cannot be masked by light gear.
  const score = scores.length ? Math.max(...scores) : LOAD_BURDEN.standard;
  const loadClass = EQUIPMENT_LOAD_CLASSES[score];
  return {
    class: loadClass,
    label: EQUIPMENT_LOAD_LABELS[loadClass],
    score,
    initiativeModifier: EQUIPMENT_LOAD_INITIATIVE_MODIFIERS[loadClass]
  };
}

export function getCharacterEquipmentLoadModifier(character) {
  return getCharacterEquipmentLoad(character).initiativeModifier;
}
