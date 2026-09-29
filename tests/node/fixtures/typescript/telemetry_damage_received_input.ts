import {
  buildDamageReceivedPayload,
  type DamageReceivedPayload,
  type DamageReceivedPayloadInput
} from "../../../../src/telemetry_damage_received.js";

export const damageReceivedPayloadInputFixture: DamageReceivedPayloadInput = {
  runId: "run-fixture",
  combatId: "combat-fixture",
  defenseBreakdown: { equipmentDef: "4.5" },
  safeAttackTypes: new Set(["physical", "other"]),
  safeGuardProfileIds: new Set(["light"]),
  readDamageField(field) {
    const values: Partial<Record<typeof field, unknown>> = {
      floor: 3,
      enemyId: "fixture-enemy",
      attackType: "physical",
      rawDamage: "6.5",
      finalDamage: 2,
      defResistance: 0.5,
      guardProfileId: "light"
    };
    return values[field];
  },
  normalizeEnemyId: value => String(value),
  resolveBuildSnapshot: () => ({ schemaVersion: 1 })
};

export const damageReceivedPayloadFixture: DamageReceivedPayload =
  buildDamageReceivedPayload(damageReceivedPayloadInputFixture);
