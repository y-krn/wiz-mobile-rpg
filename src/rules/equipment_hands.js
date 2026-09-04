import { getItemBaseId, getItemData } from "./item_rules.js";

export const MAX_EQUIPMENT_HANDS = 2;

export function getEquipmentHands(itemOrKey) {
  const item = getItemData(itemOrKey);
  if (!item) return 0;
  if (item.type === "shield") return 1;
  if (item.type !== "weapon") return 0;
  const hands = Number(item.hands);
  return hands === 2 ? 2 : 1;
}

export function getCharacterEquipmentHands(char, { replacingSlot = null, nextItem = null } = {}) {
  const equipment = char?.equipment || {};
  const equippedHands = Object.entries(equipment).reduce((total, [slot, item]) => {
    if (slot === replacingSlot) return total;
    return total + getEquipmentHands(item);
  }, 0);
  return equippedHands + getEquipmentHands(nextItem);
}

export function getEquipmentHandSummary(itemOrKey) {
  const item = getItemData(itemOrKey);
  if (!item || !["weapon", "shield"].includes(item.type)) return "";
  return getEquipmentHands(item) === 2 ? "両手" : "片手";
}

export function getEquipmentHandConflict(char, itemOrKey, replacingSlot = null) {
  const item = getItemData(itemOrKey);
  if (!item || !["weapon", "shield"].includes(item.type)) return null;
  const hands = getCharacterEquipmentHands(char, { replacingSlot, nextItem: itemOrKey });
  if (hands <= MAX_EQUIPMENT_HANDS) return null;

  const itemName = item.name || getItemBaseId(itemOrKey) || "この装備";
  const message = item.type === "shield"
    ? `${itemName}を装備するには、両手武器を先に外してください。`
    : `${itemName}は両手武器のため、盾を先に外してください。`;
  return { hands, maxHands: MAX_EQUIPMENT_HANDS, message };
}
