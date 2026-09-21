import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  createDefaultNormalizedEliteFloorState,
  isNormalizedEliteDefeatedFloors,
  isNormalizedEliteFloorState,
  isNormalizedEliteFloors,
  normalizeEliteDefeatedFloors,
  normalizeEliteFloors
} from "../../../src/state/elite_floor.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { markEliteEntryRollResolved } from "../../../src/systems/roaming_elites.js";

const progress = {
  entryRollResolved: true,
  spawned: true,
  defeated: false,
  warningStage: 3,
  prolongedChecks: 7,
  greedScore: 12.5,
  stairsFound: true,
  actionKeys: ["new_room", "merchant"]
};

assert.equal(isNormalizedEliteFloorState(progress), true);
assert.equal(isNormalizedEliteFloors({ "1": progress, "12": createDefaultNormalizedEliteFloorState() }), true);
assert.deepEqual(normalizeEliteFloors(JSON.parse(JSON.stringify({ "1": progress }))), { "1": progress });

const defeatedFloors = [5, 2, 5, 11];
assert.equal(isNormalizedEliteDefeatedFloors([]), true);
assert.equal(isNormalizedEliteDefeatedFloors(defeatedFloors), true);
assert.deepEqual(normalizeEliteDefeatedFloors(JSON.parse(JSON.stringify(defeatedFloors))), defeatedFloors);
assert.deepEqual(normalizeEliteDefeatedFloors([
  5, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2", null, {}, 2, 5
]), [5, 2, 5]);
assert.deepEqual(normalizeEliteDefeatedFloors("5"), []);
assert.deepEqual(normalizeEliteDefeatedFloors(defeatedFloors), defeatedFloors);
assert.equal(isNormalizedEliteDefeatedFloors([1, "2"]), false);

const malformedKeys = {
  "0": progress,
  "-1": progress,
  "01": progress,
  "+1": progress,
  "1.5": progress,
  "1e0": progress,
  arbitrary: progress,
  "2": null,
  "3": []
};
assert.deepEqual(normalizeEliteFloors(malformedKeys), {});
assert.equal(isNormalizedEliteFloors(malformedKeys), false);

const actionKeys = Array.from({ length: 102 }, (_, index) => index % 2 === 0 ? `action-${index}` : index);
assert.deepEqual(normalizeEliteFloors({
  "2": {
    entryRollResolved: "yes",
    spawned: true,
    defeated: false,
    warningStage: 99,
    prolongedChecks: -1,
    greedScore: Number.POSITIVE_INFINITY,
    stairsFound: true,
    actionKeys
  }
}), {
  "2": {
    entryRollResolved: false,
    spawned: true,
    defeated: false,
    warningStage: 3,
    prolongedChecks: 0,
    greedScore: 0,
    stairsFound: true,
    actionKeys: actionKeys.filter(actionKey => typeof actionKey === "string")
  }
});

const lastActions = Array.from({ length: 101 }, (_, index) => `action-${index}`);
const normalizedLastActions = normalizeEliteFloors({ "3": { ...progress, actionKeys: lastActions } });
assert.deepEqual(normalizedLastActions["3"].actionKeys, lastActions.slice(-100));
assert.equal(isNormalizedEliteFloors(normalizedLastActions), true);
assert.deepEqual(normalizeEliteFloors(normalizedLastActions), normalizedLastActions);

const validCurrentRun = createDefaultCurrentRun();
validCurrentRun.eliteFloors = { "1": progress };
validCurrentRun.eliteDefeatedFloors = defeatedFloors;
assert.equal(isNormalizedCurrentRun(validCurrentRun), true);
assert.equal(isNormalizedCurrentRun({ ...validCurrentRun, eliteFloors: { "01": progress } }), false);
assert.equal(isNormalizedCurrentRun({ ...validCurrentRun, eliteDefeatedFloors: [1, "2"] }), false);

const savePayload = { currentRun: {
  ...createDefaultCurrentRun(),
  eliteFloors: {
    "1": { ...progress, actionKeys: ["persisted"], warningStage: 2 },
    "01": { ...progress, warningStage: 3 },
    "2": { ...progress, entryRollResolved: true, prolongedChecks: 4, greedScore: 8, stairsFound: true }
  },
  eliteOmenSteps: {
    "1": ["old-omen"],
    "2": ["a", "b", "c"],
    "03": ["invalid-key-omen"]
  },
  eliteDefeatedFloors: [3, "4", 0, 3, -1, 1.5, null, 7]
}};
const normalized = normalizeSavePayload(savePayload).currentRun;
assert.deepEqual(normalized.eliteFloors, {
  "1": { ...progress, actionKeys: ["persisted"], warningStage: 2 },
  "2": { ...progress, warningStage: 3, prolongedChecks: 4, greedScore: 8 }
});
assert.equal(normalized.eliteFloors["1"].entryRollResolved, true);
assert.equal(normalized.eliteFloors["2"].prolongedChecks, 4);
assert.equal(normalized.eliteFloors["2"].greedScore, 8);
assert.equal(normalized.eliteFloors["2"].stairsFound, true);
assert.deepEqual(normalized.eliteDefeatedFloors, [3, 3, 7]);
assert.equal(isNormalizedCurrentRun(normalized), true);

const defeatedFloorState = structuredClone(normalized);
defeatedFloorState.eliteDefeatedFloors = [3];
defeatedFloorState.eliteOmenSteps = {};
defeatedFloorState.eliteFloors = { "3": { ...progress, defeated: false } };
const unchangedEliteFloors = structuredClone(defeatedFloorState.eliteFloors);
const normalizedDefeatSignal = normalizeSavePayload({ currentRun: defeatedFloorState }).currentRun;
assert.deepEqual(normalizedDefeatSignal.eliteFloors, unchangedEliteFloors);
assert.deepEqual(normalizedDefeatSignal.eliteDefeatedFloors, [3]);
const runtimeState = { currentRun: normalizedDefeatSignal, roamingMonsters: [] };
assert.equal(markEliteEntryRollResolved(runtimeState, 3).defeated, true);
assert.equal(Object.hasOwn(normalizedDefeatSignal.eliteFloors, "4"), false);

const legacyOnly = normalizeSavePayload({ currentRun: {
  ...createDefaultCurrentRun(),
  eliteFloors: {},
  eliteOmenSteps: { "1": ["omen-1", "omen-2"], "01": ["invalid"] }
}}).currentRun;
assert.deepEqual(legacyOnly.eliteFloors, {
  "1": { ...createDefaultNormalizedEliteFloorState(), warningStage: 2 }
});

const beforeReroll = structuredClone(normalized.eliteFloors);
assert.deepEqual(normalizeSavePayload({ currentRun: normalized }).currentRun.eliteFloors, beforeReroll);

console.log("[PASS] #1476 canonical elite defeated-floor contract, save normalization, legacy omen migration, and progress preservation verified.");
