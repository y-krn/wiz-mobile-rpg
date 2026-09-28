import assert from "node:assert/strict";
import { buildFloorExplorationPayload } from "../../../src/telemetry_floor_exploration.ts";

const payload = buildFloorExplorationPayload({
  runId: "run-1",
  context: {
    floor: 99,
    stepsBeforeStairs: 99,
    stairsDiscovered: "context",
    contextOnly: "kept"
  },
  floor: 2,
  stepsBeforeStairs: "9.25",
  stepsAfterStairs: false,
  stairsDiscovered: "false",
  floorCompleted: 0,
  chestsDiscovered: "",
  chestsSkipped: null,
  explorationMode: " "
});

assert.deepEqual(Object.keys(payload), [
  "runId", "floor", "stepsBeforeStairs", "stairsDiscovered", "contextOnly",
  "stepsAfterStairs", "floorCompleted", "chestsDiscovered", "chestsSkipped", "explorationMode"
]);
assert.equal(payload.runId, "run-1");
assert.equal(payload.floor, 2);
assert.equal(payload.stepsBeforeStairs, 9.25);
assert.equal(payload.stepsAfterStairs, 0);
assert.equal(payload.stairsDiscovered, true);
assert.equal(payload.floorCompleted, false);
assert.equal(payload.chestsDiscovered, 0);
assert.equal(payload.chestsSkipped, 0);
assert.equal(payload.explorationMode, "other");
assert.equal(payload.contextOnly, "kept");

for (const explorationMode of [null, undefined, ""]) {
  assert.equal(buildFloorExplorationPayload({
    runId: null,
    context: {},
    floor: null,
    stepsBeforeStairs: undefined,
    stepsAfterStairs: Number.POSITIVE_INFINITY,
    stairsDiscovered: null,
    floorCompleted: undefined,
    chestsDiscovered: "invalid",
    chestsSkipped: Number.NaN,
    explorationMode
  }).explorationMode, null);
}

const validModes = ["discovery", "known_route", "unknown"];
for (const explorationMode of validModes) {
  assert.equal(buildFloorExplorationPayload({
    runId: null,
    context: {},
    floor: null,
    stepsBeforeStairs: undefined,
    stepsAfterStairs: undefined,
    stairsDiscovered: false,
    floorCompleted: false,
    chestsDiscovered: undefined,
    chestsSkipped: undefined,
    explorationMode
  }).explorationMode, explorationMode);
}

console.log("[PASS] floor exploration TypeScript payload preserves coercion, precedence, and property order");
