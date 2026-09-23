import {
  getCharacterEquipmentHands,
  getEquipmentHandConflict,
  getEquipmentHands,
  getEquipmentHandSummary
} from "../../src/rules/equipment_hands.js";

const legacyItem = { baseId: "CLAYMORE", identified: true, rarity: "rare" };
const unknownItem: unknown = { legacyShape: [1, "two"] };
const partialCharacter = { equipment: { weapon: legacyItem, legacySlot: "SMALL_SHIELD" } };
const partialOptions = { replacingSlot: "weapon", nextItem: legacyItem };

getEquipmentHands("CLAYMORE");
getEquipmentHands(legacyItem);
getEquipmentHands(unknownItem);
getCharacterEquipmentHands(partialCharacter, partialOptions);
getCharacterEquipmentHands(null, { nextItem: unknownItem });
getEquipmentHandSummary(unknownItem);
getEquipmentHandConflict(partialCharacter, legacyItem, "weapon");
