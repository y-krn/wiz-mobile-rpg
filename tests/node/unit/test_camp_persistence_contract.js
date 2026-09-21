import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  isNormalizedCampRested,
  isNormalizedCompletedCampEntryFloors,
  isNormalizedPendingCampEntryFloor,
  normalizeCampRested,
  normalizeCompletedCampEntryFloors,
  normalizePendingCampEntryFloor
} from "../../../src/state/camp_state.js";
import * as canonicalCampState from "../../../src/state/camp_state.ts";

assert.strictEqual(isNormalizedCampRested, canonicalCampState.isNormalizedCampRested,
  "JS facade delegates Camp-rested guard");
assert.strictEqual(normalizeCampRested, canonicalCampState.normalizeCampRested,
  "JS facade delegates Camp-rested normalizer");

assert.equal(isNormalizedCampRested({}), true);
assert.equal(isNormalizedCampRested({ "2": true, "6": true }), true);
assert.deepEqual(normalizeCampRested({
  "2": true,
  "6": true,
  "0": true,
  "-1": true,
  "01": true,
  "+2": true,
  "1.5": true,
  "1e1": true,
  "7": false,
  "8": 1,
  "9": "true",
  "10": {}
}), { "2": true, "6": true }, "legacy and current Camp floors survive without key repair");
assert.deepEqual(normalizeCampRested(null), {});
assert.equal(isNormalizedCampRested({ "01": true }), false);
assert.equal(isNormalizedCampRested({ "2": 1 }), false);

assert.equal(isNormalizedCompletedCampEntryFloors([]), true);
assert.deepEqual(normalizeCompletedCampEntryFloors([6, 2, 6, 0, -1, 1.5, "4", Number.NaN]), [2, 6]);
assert.deepEqual(normalizeCompletedCampEntryFloors("6"), []);
assert.equal(isNormalizedCompletedCampEntryFloors([2, 6]), true);
for (const value of [[6, 2], [2, 2], [0], [-1], [1.5], ["2"], [Number.POSITIVE_INFINITY]]) {
  assert.equal(isNormalizedCompletedCampEntryFloors(value), false, `noncanonical completed floors rejected: ${String(value)}`);
}

assert.equal(isNormalizedPendingCampEntryFloor(null), true);
assert.equal(isNormalizedPendingCampEntryFloor(6), true);
for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "6", {}, undefined]) {
  assert.equal(isNormalizedPendingCampEntryFloor(value), false, `invalid pending floor rejected: ${String(value)}`);
  assert.equal(normalizePendingCampEntryFloor(value), null);
}

const baseRun = createDefaultCurrentRun();
const valid = normalizeSavePayload({
  floor: 6,
  currentRun: {
    ...baseRun,
    campRested: { "2": true },
    completedCampEntryFloors: [],
    pendingCampEntryFloor: 6,
    defeatedMilestones: [5]
  }
}).currentRun;
assert.deepEqual(valid.campRested, { "2": true }, "legacy B2 Camp rest survives migration");
assert.equal(valid.pendingCampEntryFloor, 6, "valid pending Camp entry survives migration");
assert.equal(isNormalizedCurrentRun(valid), true, "currentRun delegates Camp field guards");
assert.equal(isNormalizedCurrentRun({ ...valid, campRested: { "01": true } }), false);
assert.equal(isNormalizedCurrentRun({ ...valid, pendingCampEntryFloor: "6" }), false);
assert.equal(isNormalizedCurrentRun({ ...valid, completedCampEntryFloors: [6, 2] }), false);

for (const currentRun of [
  { ...baseRun, pendingCampEntryFloor: 7, defeatedMilestones: [5] },
  { ...baseRun, pendingCampEntryFloor: 6, completedCampEntryFloors: [6], defeatedMilestones: [5] },
  { ...baseRun, pendingCampEntryFloor: 6, defeatedMilestones: [] },
  { ...baseRun, pendingCampEntryFloor: "6", defeatedMilestones: [5] }
]) {
  assert.equal(normalizeSavePayload({ floor: 6, currentRun }).currentRun.pendingCampEntryFloor, null,
    "stale or malformed pending Camp entry is cleared");
}

const normalizedAgain = normalizeSavePayload({ floor: 6, currentRun: valid }).currentRun;
assert.deepEqual(normalizedAgain, valid, "Camp normalization is idempotent");
assert.deepEqual(JSON.parse(JSON.stringify(valid)), valid, "Camp state JSON roundtrip stable");
assert.deepEqual(normalizedAgain.campRested, { "2": true }, "no inferred Camp completion or rest history");
assert.deepEqual(normalizedAgain.completedCampEntryFloors, []);
assert.deepEqual(normalizedAgain.defeatedMilestones, [5]);

console.log("[PASS] #1490 canonical Camp persistence contract, stale-pending repair, and legacy compatibility verified.");
