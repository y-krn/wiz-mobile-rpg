type EquipmentSlot = Readonly<{
  id: string;
  itemType: string;
  label: string;
}>;

const SLOT_DEFINITIONS = [
  { id: "weapon", itemType: "weapon", label: "武器" },
  { id: "shield", itemType: "shield", label: "盾" },
  { id: "armor", itemType: "armor", label: "鎧" },
  { id: "accessory", itemType: "accessory", label: "装飾1" },
  { id: "accessory2", itemType: "accessory", label: "装飾2" }
] satisfies readonly EquipmentSlot[];

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = Object.freeze(
  SLOT_DEFINITIONS.map(slot => Object.freeze(slot))
);

export const EQUIPMENT_TYPE_LABELS = Object.freeze({
  weapon: "武器",
  shield: "盾",
  armor: "鎧",
  accessory: "装飾"
});

export function getEquipmentSlot(slotId: unknown): EquipmentSlot | null {
  return EQUIPMENT_SLOTS.find(slot => slot.id === slotId) || null;
}

export function getEquipmentSlotsForType(itemType: unknown): EquipmentSlot[] {
  return EQUIPMENT_SLOTS.filter(slot => slot.itemType === itemType);
}
