import {
  getEquipmentSlot,
  getEquipmentSlotsForType
} from "../../../../src/rules/equipment_slots";

export function exerciseEquipmentSlotInputTypes(
  unknownSlotId: unknown,
  unknownItemType: unknown
) {
  const knownSlot = getEquipmentSlot("weapon");
  const unknownSlot = getEquipmentSlot(unknownSlotId);
  const unknownType = getEquipmentSlotsForType(unknownItemType);
  const undefinedType = getEquipmentSlotsForType(undefined);

  return [knownSlot, unknownSlot, unknownType, undefinedType];
}
