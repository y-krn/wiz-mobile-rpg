import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import {
  createDefaultNormalizedEliteFloorState,
  isNormalizedEliteFloorState,
  isNormalizedEliteFloors,
  normalizeEliteFloors
} from "../../../src/state/elite_floor.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";

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
assert.equal(isNormalizedCurrentRun(validCurrentRun), true);
assert.equal(isNormalizedCurrentRun({ ...validCurrentRun, eliteFloors: { "01": progress } }), false);

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
  }
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
assert.equal(isNormalizedCurrentRun(normalized), true);

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

console.log("[PASS] #1472 canonical elite-floor contract, save normalization, legacy omen migration, and progress preservation verified.");
