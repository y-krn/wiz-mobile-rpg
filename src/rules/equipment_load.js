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

const LOAD_SCORE = Object.freeze({ light: -1, standard: 0, heavy: 1 });
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
  return loadClass ? LOAD_SCORE[loadClass] : 0;
}

export function getCharacterEquipmentLoad(character) {
  const score = Object.values(character?.equipment || {})
    .reduce((sum, item) => sum + getEquipmentLoadScore(item), 0);
  const loadClass = score < 0 ? "light" : score > 0 ? "heavy" : "standard";
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
