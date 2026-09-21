import assert from "node:assert/strict";

import {
  createDefaultCodex,
  createDefaultCurrentRun,
  createStartingKitCharacter,
  state
} from "../../../src/state.js";
import { EVENT_TYPES } from "../../../src/data.js";
import { checkCellEvents } from "../../../src/movement.js";
import { menuContext } from "../../../src/navigation.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  isNormalizedVisitedMilestoneMerchants,
  normalizeVisitedMilestoneMerchants
} from "../../../src/state/milestone_state.js";
import * as canonicalMilestoneState from "../../../src/state/milestone_state.ts";

assert.strictEqual(
  isNormalizedVisitedMilestoneMerchants,
  canonicalMilestoneState.isNormalizedVisitedMilestoneMerchants,
  "JS facade delegates to canonical visited-merchant guard"
);
assert.strictEqual(
  normalizeVisitedMilestoneMerchants,
  canonicalMilestoneState.normalizeVisitedMilestoneMerchants,
  "JS facade delegates to canonical visited-merchant normalizer"
);

for (const value of [[], [5], [5, 10, 15]]) {
  assert.equal(isNormalizedVisitedMilestoneMerchants(value), true, "canonical collection accepted");
}

for (const value of [
  [10, 5], [5, 5], [5, 15, 10], [0], [-5], [1], [4], [6], [5.5],
  [Number.NaN], [Number.POSITIVE_INFINITY], ["5"], [null], [{}], "5"
]) {
  assert.equal(
    isNormalizedVisitedMilestoneMerchants(value),
    false,
    `noncanonical collection rejected: ${String(value)}`
  );
}

assert.deepEqual(
  normalizeVisitedMilestoneMerchants([10, 5, 10, "15", 6]),
  [5, 10],
  "invalid entries drop without numeric coercion"
);
assert.deepEqual(
  normalizeVisitedMilestoneMerchants([15, 0, -5, 5, 10, 5.5, null, {}]),
  [5, 10, 15],
  "normalization deduplicates and sorts valid milestone floors"
);
assert.deepEqual(normalizeVisitedMilestoneMerchants("5"), [], "non-array becomes empty canonical collection");

const baseRun = createDefaultCurrentRun();
const normalized = normalizeSavePayload({
  codex: { events: { facilities: { merchant: { found: 7, purchased: 2 } } } },
  currentRun: {
    ...baseRun,
    deepestFloor: 10,
    defeatedMilestones: [5],
    visitedMilestoneMerchants: [10, 5, 10, "15", 6],
    itemsFound: ["UNCHANGED_ITEM"],
    keyItemsBefore: ["UNCHANGED_KEY_ITEM"]
  }
}).currentRun;
assert.deepEqual(normalized.visitedMilestoneMerchants, [5, 10]);
assert.equal(normalized.deepestFloor, 10, "valid sibling field preserved");
assert.deepEqual(normalized.itemsFound, ["UNCHANGED_ITEM"], "valid sibling collection preserved");
assert.deepEqual(normalized.keyItemsBefore, ["UNCHANGED_KEY_ITEM"], "valid sibling collection preserved");
assert.equal(isNormalizedCurrentRun(normalized), true, "currentRun guard accepts canonical collection");
assert.equal(
  isNormalizedCurrentRun({ ...normalized, visitedMilestoneMerchants: [10, 5] }),
  false,
  "currentRun guard delegates canonical ordering validation"
);
assert.equal(
  isNormalizedCurrentRun({ ...normalized, visitedMilestoneMerchants: [5, 5] }),
  false,
  "currentRun guard delegates canonical uniqueness validation"
);

const independentHistories = normalizeSavePayload({
  currentRun: {
    ...baseRun,
    defeatedMilestones: [],
    visitedMilestoneMerchants: [5]
  }
}).currentRun;
assert.deepEqual(independentHistories.defeatedMilestones, [], "visited merchant does not repair defeats");
assert.deepEqual(
  normalizeSavePayload({
    currentRun: {
      ...baseRun,
      defeatedMilestones: [5],
      visitedMilestoneMerchants: []
    }
  }).currentRun.visitedMilestoneMerchants,
  [],
  "defeat does not infer visited merchant"
);

assert.equal(
  normalizeSavePayload({
    codex: { events: { facilities: { merchant: { found: 7, purchased: 2 } } } },
    currentRun: { ...baseRun, visitedMilestoneMerchants: [5] }
  }).codex.events.facilities.merchant.found,
  7,
  "normalization does not change merchant codex count"
);

const roundTrip = JSON.parse(JSON.stringify(normalized));
assert.deepEqual(roundTrip.visitedMilestoneMerchants, normalized.visitedMilestoneMerchants);
assert.deepEqual(
  normalizeSavePayload({ currentRun: roundTrip }).currentRun,
  normalized,
  "repeated normalization is idempotent after JSON roundtrip"
);

function createElementStub() {
  return { style: {}, textContent: "", className: "", innerHTML: "", replaceChildren: () => {} };
}

const originalDocument = global.document;
global.document = { getElementById: () => createElementStub() };
try {
  state.party = [createStartingKitCharacter("vanguard")];
  state.floor = 5;
  state.maps[4] = [[{ type: "floor", event: EVENT_TYPES.MERCHANT }]];
  state.x = 0;
  state.y = 0;
  state.gameState = "explore";
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.defeatedMilestones = [5];
  state.codex = createDefaultCodex();

  checkCellEvents();
  assert.deepEqual(state.currentRun.visitedMilestoneMerchants, [5], "first visit records floor");
  assert.equal(state.codex.events.facilities.merchant.found, 1, "first visit increments merchant found");

  state.gameState = "explore";
  checkCellEvents();
  assert.deepEqual(state.currentRun.visitedMilestoneMerchants, [5], "repeat visit does not duplicate floor");
  assert.equal(state.codex.events.facilities.merchant.found, 1, "repeat visit does not increment merchant found");
  assert.equal(menuContext.type, "milestone_merchant", "repeat visit keeps merchant action path");
} finally {
  global.document = originalDocument;
}

console.log("[PASS] #1492 canonical visited-milestone-merchant type, migration, guard, roundtrip, and runtime semantics verified.");
