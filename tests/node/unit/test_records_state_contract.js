import assert from "node:assert/strict";

import {
  createDefaultRecords,
  finalizeRunRecords,
  isNormalizedAdventureRecords,
  isNormalizedRecords,
  isNormalizedRecordsBase,
  normalizeRecords
} from "../../../src/state/records_state.js";
import { isNormalizedSavePayload } from "../../../src/state/save_contract.js";
import { createSavePayload } from "../../../src/state/save_payload.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";

const base = { deepestRetreat: 2, deepestDeath: 3, totalRuns: 4 };
const full = createDefaultRecords();

assert.equal(isNormalizedRecordsBase(base), true);
assert.equal(isNormalizedRecordsBase(full), false);
assert.equal(isNormalizedRecords({ ...base, extra: true }), false);
assert.equal(isNormalizedRecords(full), true);
assert.equal(isNormalizedAdventureRecords(full), true);
assert.equal(isNormalizedAdventureRecords({ ...full, adventureStats: undefined }), false);
assert.equal(isNormalizedAdventureRecords({
  ...full,
  firstAchievements: [{ id: "first", runNumber: 1, floor: 5, recordedAt: 0, extra: true }]
}), false);
assert.equal(isNormalizedAdventureRecords({
  ...full,
  deathCauses: [{ floor: 1, type: "trap", source: "fire", count: 1, extra: true }]
}), false);
assert.equal(isNormalizedAdventureRecords({
  ...full,
  deathCauses: [{ floor: 0, type: "trap", source: "fire", count: 1 }]
}), false);
assert.equal(isNormalizedAdventureRecords({
  ...full,
  adventureStats: { ...full.adventureStats, floorDistribution: { ...full.adventureStats.floorDistribution, extra: 1 } }
}), false);

assert.deepEqual(normalizeRecords({}), { deepestRetreat: 0, deepestDeath: 0, totalRuns: 0 },
  "legacy base-only records stay base-only");
assert.equal(isNormalizedRecords(normalizeRecords({}, { includeAdventure: true })), true);
assert.equal(isNormalizedRecords(normalizeRecords({ personalBests: {} })), true);
assert.deepEqual(normalizeRecords({ deepestRetreat: "7.9", deepestDeath: -3, totalRuns: "bad" }), {
  deepestRetreat: 7,
  deepestDeath: 0,
  totalRuns: 0
});
assert.deepEqual(normalizeRecords({ deepestRetreat: Infinity, deepestDeath: "7", totalRuns: 1.9 }), {
  deepestRetreat: 0,
  deepestDeath: 7,
  totalRuns: 1
});

const malformedAdventure = normalizeRecords({
  personalBests: { deepestFloor: "7", kills: 2.9, extra: 99 },
  adventureStats: { floorDistribution: { B5: 3.9, extra: 99 }, extra: 99 },
  firstAchievements: [
    { id: "a", label: "A", runNumber: "2", floor: 5.9, recordedAt: 1, extra: true },
    { id: "a", runNumber: 3, floor: 6, recordedAt: 2 },
    { id: 7 },
    null
  ],
  deathCauses: [
    { floor: 0, type: "trap", source: "fire", count: "2.9", extra: true },
    { floor: 5, type: "trap", source: "fire", count: 1 },
    { floor: 5, type: "trap", source: "fire", count: 1 },
    { floor: 5, type: "trap" }
  ]
});
assert.deepEqual(malformedAdventure.firstAchievements, [
  { id: "a", label: "A", runNumber: 2, floor: 5, recordedAt: 1 },
  { id: "a", runNumber: 3, floor: 6, recordedAt: 2 }
]);
assert.deepEqual(malformedAdventure.deathCauses, [
  { floor: 1, type: "trap", source: "fire", count: 2 },
  { floor: 5, type: "trap", source: "fire", count: 1 },
  { floor: 5, type: "trap", source: "fire", count: 1 }
]);
assert.equal(isNormalizedRecords(malformedAdventure), true);
assert.deepEqual(normalizeRecords(JSON.parse(JSON.stringify(base))), base);
assert.deepEqual(normalizeRecords(JSON.parse(JSON.stringify(malformedAdventure))), malformedAdventure);
assert.deepEqual(normalizeRecords(malformedAdventure), malformedAdventure);

let finalized = finalizeRunRecords(base, {
  deepestFloor: 5,
  kills: 14,
  chestsOpened: 5,
  materials: { "獣の牙": 7 }
}, "retreat");
assert.equal(isNormalizedAdventureRecords(finalized.records), true);
assert.equal(finalized.records.totalRuns, 5);
assert.equal(finalized.records.deepestRetreat, 5);
assert.deepEqual(finalized.milestones, ["first_b5_reached"]);

const death = finalizeRunRecords(finalized.records, {
  deepestFloor: 10,
  deathLogs: [
    { floor: 10, type: "trap", source: "fire" },
    { floor: 10, type: "trap", source: "fire" }
  ]
}, "death");
assert.equal(death.records.deepestDeath, 10);
assert.deepEqual(death.milestones, ["first_b5_broken", "first_b10_reached"]);
assert.deepEqual(death.records.deathCauses, [{ floor: 10, type: "trap", source: "fire", count: 1 }]);

const abandoned = finalizeRunRecords(death.records, { deepestFloor: 12 }, "abandon");
assert.equal(abandoned.records.totalRuns, 7);
assert.equal(abandoned.records.deepestRetreat, 5);
assert.equal(abandoned.records.deepestDeath, 10);
assert.equal(isNormalizedAdventureRecords(abandoned.records), true);

const payload = normalizeSavePayload(createSavePayload());
assert.equal(isNormalizedSavePayload(payload), true);
assert.equal(isNormalizedSavePayload({ ...payload, records: { ...base, personalBests: {} } }), false);
assert.equal(isNormalizedSavePayload({ ...payload, records: { ...payload.records, extra: true } }), false);

console.log("[PASS] records canonical shapes, guards, normalization, finalization, and save boundary");
