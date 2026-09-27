import type { BuildShiftInput } from "../../../../src/telemetry_build_shift.js";

export const buildShiftInputFixture: BuildShiftInput = {
  runId: "run-fixture",
  context: { floor: 2 },
  action: "equip",
  fromBuildRole: "convert",
  toBuildRole: "pivot",
  fromEquipmentId: "WAND",
  toEquipmentId: "SHORT_SWORD"
};
