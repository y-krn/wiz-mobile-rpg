import assert from "node:assert/strict";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackRunStart,
  trackTrapResolution
} from "../../../src/telemetry.js";

const run = { startFloor: 1 };
const character = { level: 1, hp: 10, maxHp: 10, mp: 0, maxMp: 0, equipment: {} };

__resetTelemetryForTests();
const guardedDetails = Object.defineProperty({}, "state", {
  get() { throw new Error("guarded details getter must not run"); }
});
assert.doesNotThrow(() => trackTrapResolution("triggered", guardedDetails));

const events = [];
__setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
const noRunDetails = Object.defineProperty({}, "state", {
  get() { throw new Error("runId guard must not read details"); }
});
assert.doesNotThrow(() => trackTrapResolution("triggered", noRunDetails));
trackRunStart(run, character, { floor: 2, party: [character], inventory: [] });

const reads = [];
const state = {
  get floor() { reads.push("state.floor"); return 2; },
  get party() { reads.push("state.party"); return [character]; },
  get inventory() { reads.push("state.inventory"); return []; }
};
let characterReads = 0;
let actionReads = 0;
let successRateReads = 0;
const details = {
  get state() { reads.push("details.state"); return state; },
  get floor() { reads.push("details.floor"); return undefined; },
  get x() { reads.push("details.x"); return undefined; },
  get y() { reads.push("details.y"); return undefined; },
  get trap() {
    reads.push("details.trap");
    return { position: { x: 4, y: 5 }, type: "damage", difficulty: 30 };
  },
  get source() { reads.push("details.source"); return "floor"; },
  get trapType() { reads.push("details.trapType"); return undefined; },
  get character() { reads.push(`details.character${++characterReads}`); return character; },
  get action() { actionReads++; return "disarm"; },
  get successRate() { successRateReads++; return 70; }
};

trackTrapResolution("triggered", details);
const firstTrapEvent = events.find(event => event.name === "trap_resolution");
assert.ok(firstTrapEvent);
assert.deepEqual(
  reads.slice(0, reads.indexOf("details.character1")),
  ["details.state", "details.floor", "state.floor", "details.x", "details.trap", "details.y", "details.trap", "details.source", "details.trapType", "details.trap"]
);
assert.equal(characterReads, 2);
assert.ok(reads.indexOf("state.inventory") < reads.indexOf("details.character2"));
assert.deepEqual(
  Object.keys(firstTrapEvent.properties).slice(0, 3),
  ["schemaVersion", "runId", "hp"]
);
assert.deepEqual(Object.keys(firstTrapEvent.properties).slice(-11), [
  "trapBonus", "trapGuard", "detectionSupport", "treasureSense", "hearRange", "traceRead",
  "trapKitCount", "availableToolIds", "coreIds", "coreTrapEater", "coreTombRaider"
]);
assert.deepEqual([firstTrapEvent.properties.floor, firstTrapEvent.properties.source, firstTrapEvent.properties.trapType,
  firstTrapEvent.properties.outcome, firstTrapEvent.properties.x, firstTrapEvent.properties.y], [2, "floor", "damage", "triggered", 4, 5]);

trackTrapResolution("free text", {
  state,
  floor: "invalid",
  x: "1001",
  y: "-1",
  source: "migrated-source",
  trapType: "migrated-trap"
});
const normalizedTrapEvent = events.filter(event => event.name === "trap_resolution")[1];
assert.deepEqual([
  normalizedTrapEvent.properties.floor,
  normalizedTrapEvent.properties.source,
  normalizedTrapEvent.properties.trapType,
  normalizedTrapEvent.properties.outcome,
  normalizedTrapEvent.properties.x,
  normalizedTrapEvent.properties.y
], [null, "other", "other", "other", 1000, 0]);

const beforeDuplicate = { characterReads, actionReads, successRateReads, count: events.filter(event => event.name === "trap_resolution").length };
trackTrapResolution("triggered", {
  state,
  source: "floor",
  floor: 2,
  x: 4,
  y: 5,
  trapType: "damage",
  get character() { throw new Error("duplicate must skip build/context"); },
  get action() { throw new Error("duplicate must skip payload"); },
  get successRate() { throw new Error("duplicate must skip payload"); }
});
assert.deepEqual({
  characterReads,
  actionReads,
  successRateReads,
  count: events.filter(event => event.name === "trap_resolution").length
}, beforeDuplicate);

console.log("[PASS] JavaScript trap resolution guards and dedupe precede build/context/payload");
