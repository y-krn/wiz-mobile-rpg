import { getItemEquippedStatus } from "../../../../src/rules/equipment_equipped.js";

type FixtureCharacter = {
  equipment?: Partial<Record<"weapon" | "armor", unknown>>;
};

type FixtureState = {
  party: FixtureCharacter[];
};

const normalState: FixtureState = {
  party: [{ equipment: { weapon: "DAGGER" } }]
};
const partialEquipmentState: FixtureState = { party: [{}] };
const unknownItemKey: unknown = { legacy: true };

export const normalEquipmentStatus = getItemEquippedStatus(normalState, "DAGGER");
export const partialEquipmentStatus = getItemEquippedStatus(partialEquipmentState, unknownItemKey);
