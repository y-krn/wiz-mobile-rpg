import assert from "node:assert/strict";
import {
  buildVulnerableEventTelemetry,
  normalizeVulnerableBuildKey
} from "../../../src/telemetry_vulnerable_event.ts";
import { vulnerableEventInputFixture } from "../fixtures/typescript/telemetry_vulnerable_event_input.ts";

const built = buildVulnerableEventTelemetry(vulnerableEventInputFixture);
assert.equal(built.eventName, "vulnerable_consumed");
assert.deepEqual(Object.keys(built.payload), [
  "floor", "enemyId", "isBoss", "isMidboss", "remainingTurns", "multiplier", "reason",
  "source", "buildKey", "qualifyingHitType", "latencyTurns", "damageContribution", "directDamage"
]);
assert.equal(built.payload.multiplier, 2.5);
assert.equal(built.payload.latencyTurns, 2.5);
assert.equal(normalizeVulnerableBuildKey("VULNERA"), "VULNERA");
for (const value of ["vulnera", " VULNERA", "VULNERA ", null, undefined, 1]) {
  assert.equal(normalizeVulnerableBuildKey(value), "other");
}

const calls = [];
const value = (name, result) => () => { calls.push(name); return result; };
const ordered = buildVulnerableEventTelemetry({
  ...vulnerableEventInputFixture,
  get event() { calls.push("event"); return " APPLIED "; },
  getFloor: value("floor", ""),
  getCharacter: value("character", null),
  getBuildSnapshotFields: () => { calls.push("buildSnapshot"); return {}; },
  getEnemyId: value("enemyId", "other"),
  getIsBoss: value("isBoss", 1),
  getIsMidboss: value("isMidboss", 0),
  getRemainingTurns: value("remainingTurns", false),
  getMultiplier: value("multiplier", null),
  getReason: value("reason", ""),
  getSource: value("source", " "),
  getBuildKey: value("buildKey", "vulnera"),
  getQualifyingHitType: value("qualifyingHitType", "unknown"),
  getLatencyTurns: value("latencyTurns", null),
  getDamageContribution: value("damageContribution", "invalid"),
  getDirectDamage: value("directDamage", 2)
});
assert.equal(ordered.eventName, "vulnerable_other");
assert.deepEqual(calls, [
  "event", "floor", "character", "enemyId", "isBoss", "isMidboss", "remainingTurns", "multiplier",
  "reason", "source", "buildKey", "qualifyingHitType", "latencyTurns", "damageContribution", "directDamage"
]);
assert.equal(ordered.payload.floor, 0);
assert.equal(ordered.payload.remainingTurns, 0);
assert.equal(ordered.payload.multiplier, 1);
assert.equal(ordered.payload.reason, null);
assert.equal(ordered.payload.source, "other");
assert.equal(ordered.payload.qualifyingHitType, "other");
assert.equal(ordered.payload.latencyTurns, 0);
assert.equal(ordered.payload.damageContribution, null);
assert.equal(ordered.payload.isBoss, true);
assert.equal(ordered.payload.isMidboss, false);
assert.equal(Object.hasOwn(ordered.payload, "buildSnapshot"), false);

console.log("[PASS] TypeScript vulnerable telemetry owner preserves normalization and evaluation order");
