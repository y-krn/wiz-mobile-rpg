import { isCurseLocked } from "./identification_rules.js";
import { getItemData } from "./item_rules.js";
import { getEquipmentSlotValue, getTargetSlot, isEquipmentItem } from "./equipment_preview.js";
import { getEquipmentHandConflict } from "./equipment_hands.js";

export function canEquipEquipment(char, itemKey, requestedSlot = null) {
  if (!char) {
    return { ok: false, reason: "装備対象がありません" };
  }
  const item = getItemData(itemKey);
  if (!isEquipmentItem(item)) {
    return { ok: false, reason: "装備品ではありません" };
  }
  const slot = getTargetSlot(char, item.type, requestedSlot);
  if (!slot) {
    return { ok: false, reason: "装備先がありません" };
  }
  if (isCurseLocked(getEquipmentSlotValue(char.equipment, slot))) {
    return { ok: false, reason: "現在の呪い装備を外せません" };
  }
  const handConflict = getEquipmentHandConflict(char, itemKey, slot);
  if (handConflict) {
    return {
      ok: false,
      code: "hands_exceeded",
      reason: handConflict.message,
      hands: handConflict.hands,
      maxHands: handConflict.maxHands
    };
  }
  return { ok: true, reason: "", slot };
}
