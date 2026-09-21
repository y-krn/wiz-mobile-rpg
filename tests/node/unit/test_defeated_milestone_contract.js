import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isCampEntryEligible } from "../../../src/systems/camp_rest.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun, recordMilestoneVictory } from "../../../src/state/run_state.js";
import {
  isNormalizedDefeatedMilestones,
  normalizeDefeatedMilestones
} from "../../../src/state/milestone_state.js";
import * as canonicalMilestoneState from "../../../src/state/milestone_state.ts";

assert.strictEqual(isNormalizedDefeatedMilestones, canonicalMilestoneState.isNormalizedDefeatedMilestones,
  "JS facade delegates to canonical defeated-milestone guard");
assert.strictEqual(normalizeDefeatedMilestones, canonicalMilestoneState.normalizeDefeatedMilestones,
  "JS facade delegates to canonical defeated-milestone normalizer");

for (const value of [[], [5, 10, 15]]) {
  assert.equal(isNormalizedDefeatedMilestones(value), true, "canonical collection accepted");
}

for (const value of [
  [10, 5], [5, 5], [5, 15, 10], [0], [-5], [1], [4], [6], [5.5],
  [Number.NaN], [Number.POSITIVE_INFINITY], ["5"], [null], [{}],
]) {
  assert.equal(isNormalizedDefeatedMilestones(value), false, `noncanonical collection rejected: ${String(value)}`);
}

assert.equal(isNormalizedDefeatedMilestones("5"), false);
assert.deepEqual(
  normalizeDefeatedMilestones([10, 5, 10, "15", 6]),
  [5, 10],
  "invalid entries drop without numeric coercion"
);
assert.deepEqual(
  normalizeDefeatedMilestones([15, 0, -5, 5, 10, 5.5, null, {}]),
  [5, 10, 15],
  "normalization deduplicates and sorts valid milestone floors"
);
assert.deepEqual(normalizeDefeatedMilestones("5"), [], "non-array becomes empty canonical collection");

const baseRun = createDefaultCurrentRun();
const normalized = normalizeSavePayload({
  unlockedMilestones: [5],
  currentRun: {
    ...baseRun,
    deepestFloor: 10,
    defeatedMilestones: [10, 5, 10, "15", 6],
    itemsFound: ["UNCHANGED_ITEM"],
    keyItemsBefore: ["UNCHANGED_KEY_ITEM"]
  }
}).currentRun;
assert.deepEqual(normalized.defeatedMilestones, [5, 10]);
assert.equal(normalized.deepestFloor, 10, "valid sibling field preserved");
assert.deepEqual(normalized.itemsFound, ["UNCHANGED_ITEM"], "valid sibling collection preserved");
assert.deepEqual(normalized.keyItemsBefore, ["UNCHANGED_KEY_ITEM"], "valid sibling collection preserved");
assert.equal(isNormalizedCurrentRun(normalized), true, "currentRun guard accepts canonical collection");
assert.equal(isNormalizedCurrentRun({ ...normalized, defeatedMilestones: [10, 5] }), false,
  "currentRun guard delegates canonical ordering validation");
assert.equal(isNormalizedCurrentRun({ ...normalized, defeatedMilestones: [5, 5] }), false,
  "currentRun guard delegates canonical uniqueness validation");

const roundTrip = JSON.parse(JSON.stringify(normalized));
assert.deepEqual(roundTrip.defeatedMilestones, normalized.defeatedMilestones, "JSON roundtrip stable");
assert.deepEqual(normalizeSavePayload({ currentRun: roundTrip }).currentRun, normalized,
  "repeated normalization idempotent after JSON roundtrip");

const independentMilestones = normalizeSavePayload({
  unlockedMilestones: [5],
  currentRun: { ...baseRun, defeatedMilestones: [10] }
});
assert.deepEqual(independentMilestones.unlockedMilestones, [5],
  "save normalization does not repair unlockedMilestones from currentRun");

const campState = { floor: 6, currentRun: normalized };
assert.equal(isCampEntryEligible(campState, 6), true, "canonical [5] preserves B6 Camp eligibility");

const recordState = { currentRun: { defeatedMilestones: [] }, unlockedMilestones: [] };
assert.deepEqual(recordMilestoneVictory(recordState, 10), { ok: true, unlocked: true });
assert.deepEqual(recordState.currentRun.defeatedMilestones, [10],
  "recordMilestoneVictory keeps canonical runtime behavior");
assert.deepEqual(recordMilestoneVictory(recordState, 10), { ok: true, unlocked: false });

console.log("[PASS] #1486 canonical defeated-milestone type, guard, normalization, migration, and gameplay preservation verified.");
