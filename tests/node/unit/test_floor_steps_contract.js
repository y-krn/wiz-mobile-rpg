import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  isNormalizedFloorSteps,
  normalizeFloorSteps
} from "../../../src/state/floor_steps.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";

const malformed = {
  "0": 1,
  "-1": 2,
  "01": 3,
  "+1": 4,
  "1.5": 5,
  "1e1": 6,
  "1e0": 7,
  "2": "8",
  "3": -1,
  "4": 2.5,
  "5": Number.NaN,
  "6": Number.POSITIVE_INFINITY,
  "7": null,
  "8": {},
  "9": 0,
  "10": 12
};

assert.deepEqual(normalizeFloorSteps(malformed), { "9": 0, "10": 12 });
assert.deepEqual(normalizeFloorSteps(null), {});
assert.deepEqual(normalizeFloorSteps([]), {});
assert.equal(isNormalizedFloorSteps({}), true);
assert.equal(isNormalizedFloorSteps({ "1": 0, "2": 12 }), true);
assert.equal(isNormalizedFloorSteps(malformed), false);
assert.deepEqual(normalizeFloorSteps(normalizeFloorSteps(malformed)), { "9": 0, "10": 12 });
assert.deepEqual(
  normalizeFloorSteps(JSON.parse(JSON.stringify({ "1": 0, "2": 12 }))),
  { "1": 0, "2": 12 }
);

const validRun = createDefaultCurrentRun();
assert.equal(isNormalizedCurrentRun(validRun), true);
assert.equal(isNormalizedCurrentRun({ ...validRun, floorSteps: { "1": 1, "01": 2 } }), false);
assert.equal(isNormalizedCurrentRun({ ...validRun, floorSteps: { "1": "1" } }), false);

const rawRun = {
  ...createDefaultCurrentRun(),
  steps: 42,
  floorSteps: { "1": 0, "2": 12, "03": 7, "4": "8" },
  floor: 99,
  deepestFloor: 9,
  floorsVisited: [1, 9]
};
const normalized = normalizeSavePayload({
  version: SAVE_VERSION,
  floor: 6,
  currentRun: rawRun
}).currentRun;

assert.deepEqual(normalized.floorSteps, { "1": 0, "2": 12 });
assert.equal(normalized.steps, 42);
assert.equal(normalized.deepestFloor, 9);
assert.deepEqual(normalized.floorsVisited, [1, 9]);
assert.equal(Object.hasOwn(normalized.floorSteps, "6"), false);
assert.equal(isNormalizedCurrentRun(normalized), true);

console.log("[PASS] #1495 canonical floorSteps contract, save normalization, and non-repair policy verified.");
