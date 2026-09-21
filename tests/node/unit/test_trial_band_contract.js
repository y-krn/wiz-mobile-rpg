import assert from "node:assert/strict";

import { FLOOR_TRIALS } from "../../../src/data/floor_trials.js";
import { getBandTrialForFloor, getBandTrialForRun, getStoredBandTrial } from "../../../src/rules/floor_trials.js";
import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import { ensureRunFloor } from "../../../src/state/run_floor_state.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import {
  isNormalizedStoredBandTrial,
  isNormalizedTrialBands,
  normalizeTrialBands
} from "../../../src/state/trial_band.js";

const runSeed = "ISSUE-1467-TRIAL-BANDS";
const generated = getBandTrialForRun(runSeed, 0);
const generatedStored = getStoredBandTrial(generated);
assert.ok(generatedStored);
assert.equal(isNormalizedStoredBandTrial(generatedStored), true);
assert.deepEqual(normalizeTrialBands({ "0": generatedStored }), { "0": generatedStored });

const forcedStored = {
  bandIndex: 0,
  mainId: FLOOR_TRIALS[0].id,
  subId: FLOOR_TRIALS[1].id
};
if (forcedStored.mainId === generatedStored.mainId && forcedStored.subId === generatedStored.subId) {
  forcedStored.mainId = FLOOR_TRIALS[1].id;
  forcedStored.subId = FLOOR_TRIALS[2].id;
}
assert.notDeepEqual(forcedStored, generatedStored);
assert.equal(isNormalizedTrialBands({ "0": forcedStored }), true);
assert.deepEqual(
  getBandTrialForFloor(runSeed, 1, forcedStored),
  { bandIndex: 0, main: FLOOR_TRIALS.find(trial => trial.id === forcedStored.mainId), sub: FLOOR_TRIALS.find(trial => trial.id === forcedStored.subId), mainId: forcedStored.mainId, subId: forcedStored.subId }
);

const validBands = {
  "0": forcedStored,
  "1": { bandIndex: 1, mainId: FLOOR_TRIALS[2].id, subId: FLOOR_TRIALS[3].id }
};
assert.equal(isNormalizedTrialBands(validBands), true);
assert.deepEqual(normalizeTrialBands(validBands), validBands);
assert.deepEqual(normalizeTrialBands(JSON.parse(JSON.stringify(validBands))), validBands);
assert.deepEqual(normalizeTrialBands({}), {});

const malformed = {
  "-1": { bandIndex: -1, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "1.5": { bandIndex: 1.5, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "01": { bandIndex: 1, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "+1": { bandIndex: 1, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "1e0": { bandIndex: 1, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  arbitrary: { bandIndex: 2, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "2": { bandIndex: -1, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "3": { bandIndex: 3.5, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "4": { bandIndex: 5, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id },
  "5": { bandIndex: 5, mainId: undefined, subId: FLOOR_TRIALS[1].id },
  "6": { bandIndex: 6, mainId: FLOOR_TRIALS[0].id, subId: 1 },
  "7": { bandIndex: 7, mainId: "removed_trial", subId: FLOOR_TRIALS[1].id },
  "8": { bandIndex: 8, mainId: FLOOR_TRIALS[0].id, subId: "removed_trial" },
  "9": { bandIndex: 9, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[0].id },
  "10": [],
  "11": null,
  "12": { bandIndex: 12, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id }
};
assert.deepEqual(normalizeTrialBands(malformed), { "12": malformed["12"] });
assert.deepEqual(
  normalizeTrialBands({ ...malformed, "12": { bandIndex: 12, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id } }),
  { "12": { bandIndex: 12, mainId: FLOOR_TRIALS[0].id, subId: FLOOR_TRIALS[1].id } }
);
assert.equal(isNormalizedTrialBands(malformed), false);

const currentRun = createDefaultCurrentRun();
currentRun.trialBands = {
  "0": { bandIndex: 0, mainId: "removed_trial", subId: FLOOR_TRIALS[1].id },
  "1": { bandIndex: 1, mainId: FLOOR_TRIALS[2].id, subId: FLOOR_TRIALS[3].id }
};
const normalized = normalizeSavePayload({ floor: 1, currentRun });
assert.deepEqual(normalized.currentRun.trialBands, { "1": currentRun.trialBands["1"] });
assert.equal(normalized.currentRun.runSeed, undefined, "normalization does not require runSeed");
assert.equal(isNormalizedTrialBands(normalized.currentRun.trialBands), true);

const forcedActiveRun = normalizeSavePayload({
  floor: 1,
  currentRun: { ...createDefaultCurrentRun(), runSeed, trialBands: { "0": forcedStored } }
}).currentRun;
assert.deepEqual(forcedActiveRun.trialBands, { "0": forcedStored });
assert.deepEqual(
  getStoredBandTrial(getBandTrialForFloor(runSeed, 1, forcedActiveRun.trialBands["0"])),
  forcedStored,
  "valid stored pair survives normalization even when it differs from generated pair"
);

const activeRun = createDefaultCurrentRun();
activeRun.runSeed = runSeed;
activeRun.trialBands = { "0": { bandIndex: 0, mainId: "removed_trial", subId: FLOOR_TRIALS[1].id } };
const normalizedActiveRun = normalizeSavePayload({ floor: 1, currentRun: activeRun }).currentRun;
assert.deepEqual(normalizedActiveRun.trialBands, {});
const fallback = getBandTrialForFloor(runSeed, 1, normalizedActiveRun.trialBands["0"]);
assert.deepEqual(getStoredBandTrial(fallback), generatedStored);

const cacheState = {
  floor: 1,
  maps: [],
  visitedMaps: [],
  floorChestsOpened: [],
  floorChestsTotal: [],
  _freshRunFloor: 1,
  currentRun: normalizedActiveRun
};
ensureRunFloor(cacheState, 1);
assert.deepEqual(cacheState.currentRun.trialBands["0"], generatedStored);

const repeated = normalizeTrialBands(normalizeTrialBands({ "0": forcedStored, malformed: null }));
assert.deepEqual(repeated, { "0": forcedStored });
assert.equal(isNormalizedTrialBands(repeated), true);

console.log("[PASS] #1467 canonical trial-band contract, fail-safe normalization, JSON stability, and deterministic fallback verified.");
