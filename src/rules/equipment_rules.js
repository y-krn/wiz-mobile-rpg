import { isCurseLocked } from "./identification_rules.js";
import { getItemData } from "./item_rules.js";
import { getEquipmentSlotValue, getTargetSlot, isEquipmentItem } from "./equipment_preview.js";

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
  return { ok: true, reason: "", slot };
}
