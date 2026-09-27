import type { EquipmentDecisionInput } from "../../../../src/telemetry_equipment_decision.js";

export const equipmentDecisionInputFixture: EquipmentDecisionInput = {
  runId: "run-fixture",
  context: { floor: 2 },
  action: "equip",
  candidateId: "DAGGER",
  currentEquipmentId: "WAND",
  candidateBuildRole: "pivot",
  currentBuildRole: "convert",
  buildDecision: "transition",
  slot: "weapon",
  safeEquipmentSlots: new Set(["weapon", "armor"]),
  candidateRarity: "rare",
  candidateIdentified: true,
  candidateEnhancementLevel: 1,
  primaryDiff: 2,
  diffRows: [{ key: "attack", diff: 2 }],
  safeComparisonStatKeys: new Set(["attack", "defense"]),
  maxResourceValue: 1_000_000,
  maxComparisonRows: 24
};
