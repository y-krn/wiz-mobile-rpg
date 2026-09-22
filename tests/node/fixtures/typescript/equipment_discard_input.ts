import type {
  DiscardEntry,
  DiscardEquipmentOptions
} from "../../../../src/systems/equipment_discard.js";

export const discardEntriesFixture: DiscardEntry[] = [
  { index: 0, expectedItemKey: "DAGGER", preview: { slot: "weapon" } }
];

export const discardOptionsFixture: DiscardEquipmentOptions = {
  stateLike: {
    inventory: ["DAGGER"],
    party: []
  },
  character: null
};
