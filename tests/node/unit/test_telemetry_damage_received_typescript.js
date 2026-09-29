import assert from "node:assert/strict";
import { buildDamageReceivedPayload } from "../../../src/telemetry_damage_received.ts";
import {
  damageReceivedPayloadFixture,
  damageReceivedPayloadInputFixture
} from "../fixtures/typescript/telemetry_damage_received_input.ts";

const payload = buildDamageReceivedPayload(damageReceivedPayloadInputFixture);
assert.deepEqual(payload, damageReceivedPayloadFixture);
assert.deepEqual(Object.keys(payload), [
  "runId", "combatId", "floor", "enemyId", "attackType", "rawDamage", "preDefDamage",
  "postDefDamage", "finalDamage", "finalDef", "defResistance", "baseDef", "equipmentDef",
  "buffDef", "frontGuardDef", "firstStrikeDefense", "tempDefDown", "playerHpBefore",
  "playerHpAfter", "playerMp", "isDefending", "guardProfileId"
]);
assert.equal(payload.baseDef, 4.5);
assert.equal(payload.equipmentDef, 4.5);
assert.equal(payload.rawDamage, 6.5);
assert.equal(payload.defResistance, 0.5);

console.log("[PASS] TypeScript damage_received payload has explicit, stable shape");
