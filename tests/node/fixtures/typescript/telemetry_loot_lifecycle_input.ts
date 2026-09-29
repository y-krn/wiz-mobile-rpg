import {
  buildLootLifecyclePayload,
  type LootLifecyclePayload,
  type LootLifecyclePayloadInput
} from "../../../../src/telemetry_loot_lifecycle.js";

const input: LootLifecyclePayloadInput = {
  runId: "run-fixture",
  context: { floor: 1 },
  lifecycleStage: "banked",
  lootSequence: 2,
  safeSources: new Set(["dungeon"]),
  safeOwnerships: new Set(["town"]),
  getItemKey: () => null,
  source: "dungeon",
  ownership: undefined,
  getStateFloor: () => 1,
  getSafeItemId: () => null,
  getItemCategory: () => "other",
  getEquipmentBuildRole: () => null,
  getLootSupplyFields: () => ({ lootRole: null, lootTier: null, runeSupplyBand: null }),
  getLootValueProxy: () => null,
  normalizeRarity: () => null,
  summary: { count: 0, valueProxy: 0 }
};

export const lootLifecyclePayloadFixture: LootLifecyclePayload = buildLootLifecyclePayload(input);
