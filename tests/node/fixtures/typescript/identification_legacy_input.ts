import {
  identifyEquipment,
  type IdentificationStateLike
} from "../../../../src/systems/identification";

export function identifyLegacyInput(): ReturnType<typeof identifyEquipment> {
  const partialState: Partial<IdentificationStateLike> = { identifyTickets: 1 };
  const legacyShapedItem = {
    baseId: "SHORT_SWORD",
    identified: false,
    tags: ["blade"],
    affixes: [{ type: "atk", value: 4 }]
  };
  return identifyEquipment(partialState, legacyShapedItem, { equipment: {} }, () => 0);
}
