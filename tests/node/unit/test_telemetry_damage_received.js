import assert from "node:assert/strict";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackCombatStart,
  trackDamageReceived,
  trackRunStart
} from "../../../src/telemetry.js";
import { resolveBuildSnapshot } from "../../../src/rules/build_snapshot.js";

function startTelemetry(events) {
  __resetTelemetryForTests();
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  const character = { level: 1, hp: 10, maxHp: 10, mp: 0, maxMp: 0, equipment: {} };
  trackRunStart({ startFloor: 1 }, character, { floor: 1, party: [character], inventory: [] });
  trackCombatStart({ floor: 1, player: character, monsters: [] }, { floor: 1, party: [character], inventory: [] });
}

const guardedReads = [];
__resetTelemetryForTests();
assert.doesNotThrow(() => trackDamageReceived(new Proxy({}, {
  get(_target, key) { guardedReads.push(key); throw new Error("guarded damage read"); }
})));
assert.deepEqual(guardedReads, []);

const events = [];
startTelemetry(events);
const reads = [];
const firstCharacter = { marker: "first" };
const secondCharacter = { level: 2, hp: 8, maxHp: 8, mp: 1, maxMp: 1, equipment: {} };
let characterReads = 0;
const breakdown = {
  get baseDef() { reads.push("breakdown.baseDef"); return undefined; },
  get equipmentDef() { reads.push("breakdown.equipmentDef"); return 3; },
  get buffDef() { reads.push("breakdown.buffDef"); return 1; },
  get frontGuardDef() { reads.push("breakdown.frontGuardDef"); return 2; },
  get firstStrikeDefense() { reads.push("breakdown.firstStrikeDefense"); return 4; },
  get tempDefDown() { reads.push("breakdown.tempDefDown"); return 0; }
};
const damage = new Proxy({
  defenseBreakdown: breakdown,
  floor: "2.5",
  enemyId: "Goblin A",
  attackType: " physical ",
  rawDamage: -2,
  preDefDamage: Number.POSITIVE_INFINITY,
  postDefDamage: "",
  finalDamage: 1.25,
  finalDef: 1_000_001,
  defResistance: -2,
  playerHpBefore: null,
  playerHpAfter: false,
  playerMp: "invalid",
  isDefending: "false",
  guardProfileId: " light "
}, {
  get(target, key, receiver) {
    reads.push(`damage.${String(key)}`);
    if (key === "character") return ++characterReads === 1 ? firstCharacter : secondCharacter;
    return Reflect.get(target, key, receiver);
  }
});

trackDamageReceived(damage);
const event = events.find(candidate => candidate.name === "damage_received");
assert.ok(event);
assert.equal(characterReads, 2);
assert.deepEqual(event.properties.buildSnapshot, resolveBuildSnapshot(secondCharacter));
assert.deepEqual(reads, [
  "damage.defenseBreakdown", "damage.floor", "damage.character", "damage.character",
  "damage.enemyId", "damage.attackType", "damage.rawDamage", "damage.preDefDamage",
  "damage.postDefDamage", "damage.finalDamage", "damage.finalDef", "damage.defResistance",
  "breakdown.baseDef", "breakdown.equipmentDef", "breakdown.equipmentDef", "breakdown.buffDef",
  "breakdown.frontGuardDef", "breakdown.firstStrikeDefense", "breakdown.tempDefDown",
  "damage.playerHpBefore", "damage.playerHpAfter", "damage.playerMp", "damage.isDefending",
  "damage.guardProfileId"
]);
assert.deepEqual(Object.keys(event.properties), [
  "schemaVersion", "runId", "combatId", "floor", "buildSnapshot", "enemyId", "attackType",
  "rawDamage", "preDefDamage", "postDefDamage", "finalDamage", "finalDef", "defResistance",
  "baseDef", "equipmentDef", "buffDef", "frontGuardDef", "firstStrikeDefense", "tempDefDown",
  "playerHpBefore", "playerHpAfter", "playerMp", "isDefending", "guardProfileId"
]);
assert.deepEqual([
  event.properties.floor, event.properties.enemyId, event.properties.attackType,
  event.properties.rawDamage, event.properties.preDefDamage, event.properties.postDefDamage,
  event.properties.finalDamage, event.properties.finalDef, event.properties.defResistance,
  event.properties.baseDef, event.properties.equipmentDef, event.properties.isDefending,
  event.properties.guardProfileId
], [2.5, "other", "other", 0, null, 0, 1.25, 1_000_000, -1, 3, 3, true, "other"]);
assert.equal(event.properties.playerHpBefore, 0);
assert.equal(event.properties.playerHpAfter, 0);
assert.equal(event.properties.playerMp, null);

const fallbackEvents = [];
startTelemetry(fallbackEvents);
const fallbackReads = [];
const fallbackDamage = new Proxy({ finalDef: "invalid", floor: 1 }, {
  get(target, key, receiver) {
    fallbackReads.push(String(key));
    if (key === "defenseBreakdown") return null;
    if (key === "character") return null;
    return Reflect.get(target, key, receiver);
  }
});
trackDamageReceived(fallbackDamage);
assert.deepEqual(fallbackReads.slice(0, 3), ["defenseBreakdown", "character", "finalDef"]);
assert.equal(fallbackReads.filter(key => key === "character").length, 2);
assert.ok(fallbackReads.indexOf("attackType") > fallbackReads.indexOf("floor"));

const falseyEvents = [];
startTelemetry(falseyEvents);
let falseyCharacterReads = 0;
trackDamageReceived({
  defenseBreakdown: {},
  get character() { falseyCharacterReads++; return 0; }
});
const falseyDamageEvent = falseyEvents.find(candidate => candidate.name === "damage_received");
assert.equal(falseyCharacterReads, 1);
assert.equal(Object.hasOwn(falseyDamageEvent.properties, "buildSnapshot"), false);

const nonObjectEvents = [];
startTelemetry(nonObjectEvents);
trackDamageReceived({ defenseBreakdown: false });
const nonObjectPayload = nonObjectEvents.find(candidate => candidate.name === "damage_received").properties;
for (const field of ["baseDef", "equipmentDef", "buffDef", "frontGuardDef", "firstStrikeDefense", "tempDefDown"]) {
  assert.equal(Object.hasOwn(nonObjectPayload, field), false);
}

__resetTelemetryForTests();
console.log("[PASS] JavaScript damage_received guards, getter order, normalization, and payload shape");
