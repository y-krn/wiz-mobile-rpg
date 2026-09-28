import assert from "node:assert/strict";
import {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackFloorExploration,
  trackRunStart,
  trackStairsDiscovery
} from "../../../src/telemetry.js";

const events = [];
const state = {
  floor: 2,
  party: [],
  currentRun: {
    floorSteps: { "2": 12 },
    unbankedObjectLoot: [{ item: { baseId: "DAGGER" } }, { invalid: true }]
  }
};
const evaluationOrder = [];

__setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
trackRunStart({ startedAt: Date.now(), startFloor: 1 }, { level: 1, maxHp: 10, maxMp: 5, equipment: {} }, state);
events.length = 0;

trackStairsDiscovery({
  get floor() { evaluationOrder.push("floor"); return "2"; },
  get stairsType() { evaluationOrder.push("stairsType"); return false; },
  get stepsAtDiscovery() { evaluationOrder.push("stepsAtDiscovery"); return "9.25"; },
  get stepsBeforeDiscovery() { evaluationOrder.push("stepsBeforeDiscovery"); return "8.5"; },
  get hpRate() { evaluationOrder.push("hpRate"); return 1.5; },
  get mpRate() { evaluationOrder.push("mpRate"); return ""; },
  get explorationMode() { evaluationOrder.push("explorationMode"); return " "; },
  get state() { evaluationOrder.push("state"); return state; },
  get character() { evaluationOrder.push("character"); return undefined; }
});
assert.deepEqual(evaluationOrder, [
  "floor", "stairsType", "stepsAtDiscovery", "state", "character", "stepsAtDiscovery",
  "stepsBeforeDiscovery", "hpRate", "mpRate", "explorationMode", "state"
]);

const stairs = events.find(event => event.name === "stairs_discovered").properties;
assert.equal(stairs.floor, 2);
assert.equal(stairs.stairsType, "stairs-down");
assert.equal(stairs.stepsAtDiscovery, 9.25);
assert.equal(stairs.stepsBeforeDiscovery, 8.5);
assert.equal(stairs.hpRate, 1);
assert.equal(stairs.mpRate, 0);
assert.equal(stairs.explorationMode, "other");
assert.equal(stairs.unbankedObjectLootCount, 1);

const duplicate = { floor: 2, stairsType: "" };
for (const key of [
  "stepsAtDiscovery", "stepsBeforeDiscovery", "hpRate", "mpRate", "explorationMode", "state", "character"
]) {
  Object.defineProperty(duplicate, key, {
    get() { throw new Error(`duplicate path evaluated ${key}`); }
  });
}
assert.doesNotThrow(() => trackStairsDiscovery(duplicate));
assert.equal(events.filter(event => event.name === "stairs_discovered").length, 1);

trackFloorExploration({ state, floor: 2, stairsDiscovered: true, floorCompleted: true });
const exploration = events.find(event => event.name === "floor_exploration").properties;
assert.equal(exploration.stepsBeforeStairs, 9.25);
assert.equal(exploration.stepsAfterStairs, 2.75);

for (const [index, stairsType] of ["", 0, false, null, undefined].entries()) {
  trackStairsDiscovery({ state, floor: 20 + index, stairsType, stepsAtDiscovery: 1 });
  assert.equal(events.filter(event => event.name === "stairs_discovered").at(-1).properties.stairsType, "stairs-down");
}
trackStairsDiscovery({ state, floor: 30, stairsType: "Stairs-down", stepsAtDiscovery: 1 });
assert.equal(events.filter(event => event.name === "stairs_discovered").at(-1).properties.stairsType, "other");

__resetTelemetryForTests();
console.log("[PASS] stairs telemetry deduplicates before step, context, and loot evaluation and retains floor-local cache");
