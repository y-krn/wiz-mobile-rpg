import assert from "node:assert/strict";
import {
  buildBleedingEventTelemetry,
  normalizeBleedingBuildKey
} from "../../../src/telemetry_bleeding_event.ts";
import { bleedingEventInputFixture } from "../fixtures/typescript/telemetry_bleeding_event_input.ts";

const built = buildBleedingEventTelemetry(bleedingEventInputFixture);
assert.equal(built.eventName, "bleeding_applied");
assert.deepEqual(Object.keys(built.payload), [
  "floor", "enemyId", "isBoss", "isMidboss", "remainingTurns", "payoffDamage",
  "reason", "source", "buildKey", "damageContribution", "directDamage"
]);
assert.equal(built.payload.buildKey, "bleedingAtk:12.5");
assert.equal(normalizeBleedingBuildKey("bleedingAtk:999999"), "bleedingAtk:100");
assert.equal(normalizeBleedingBuildKey("bleedingAtk:-2"), "bleedingAtk:0");
assert.equal(normalizeBleedingBuildKey("bleedingAtk:12.50"), "bleedingAtk:12.5");
assert.equal(normalizeBleedingBuildKey("bleedingAtk: 12"), "other");
assert.equal(normalizeBleedingBuildKey("VULNERA"), "other");

const calls = [];
const record = (name, value) => () => { calls.push(name); return value; };
const ordered = buildBleedingEventTelemetry({
  ...bleedingEventInputFixture,
  get event() { calls.push("event"); return "unlisted"; },
  getFloor: record("floor", ""),
  getCharacter: record("character", null),
  getBuildSnapshotFields: () => { calls.push("buildSnapshot"); return {}; },
  getEnemyId: record("enemyId", "other"),
  getIsBoss: record("isBoss", 1),
  getIsMidboss: record("isMidboss", 0),
  getRemainingTurns: record("remainingTurns", false),
  getPayoffDamage: record("payoffDamage", null),
  getReason: record("reason", ""),
  getSource: record("source", " "),
  getBuildKey: record("buildKey", "bad"),
  getDamageContribution: record("damageContribution", "invalid"),
  getDirectDamage: record("directDamage", 2)
});
assert.equal(ordered.eventName, "bleeding_other");
assert.deepEqual(calls, [
  "event", "floor", "character", "enemyId", "isBoss", "isMidboss", "remainingTurns",
  "payoffDamage", "reason", "source", "buildKey", "damageContribution", "directDamage"
]);
assert.equal(ordered.payload.floor, 0);
assert.equal(ordered.payload.remainingTurns, 0);
assert.equal(ordered.payload.payoffDamage, 0);
assert.equal(ordered.payload.reason, null);
assert.equal(ordered.payload.source, "other");
assert.equal(ordered.payload.damageContribution, null);
assert.equal(ordered.payload.isBoss, true);
assert.equal(ordered.payload.isMidboss, false);
assert.equal(Object.hasOwn(ordered.payload, "buildSnapshot"), false);

console.log("[PASS] TypeScript bleeding telemetry owner preserves legacy normalization and order");
