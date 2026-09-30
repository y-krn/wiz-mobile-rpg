import {
  buildCombatEndPayload,
  type CombatEndPayload,
  type CombatEndPayloadInput
} from "../../../../src/telemetry_combat_end.js";

export const combatEndPayloadInputFixture: CombatEndPayloadInput = {
  runId: "run-fixture",
  combatId: "combat-fixture",
  context: { contextOnly: "kept" },
  combat: null,
  result: "victory",
  maxEnemySnapshot: 8
};

export const combatEndPayloadFixture: CombatEndPayload =
  buildCombatEndPayload(combatEndPayloadInputFixture);
