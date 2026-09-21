import assert from "node:assert/strict";

import { createDefaultCurrentRun } from "../../../src/state/initial_state.js";
import {
  isNormalizedRunRecordResult,
  normalizeRunRecordResult
} from "../../../src/state/run_record_result.js";
import { isNormalizedCurrentRun } from "../../../src/state/run_state.js";
import { normalizeSavePayload, SAVE_VERSION } from "../../../src/state/save_migrations.js";

const canonical = {
  updated: true,
  updates: ["撤退最深", "最深到達記録", "最深到達記録"],
  milestones: ["first_b5_reached", "unknown-historical-milestone", "first_b5_reached"],
  runNumber: 3,
  depth: 8,
  outcome: "retreat"
};

assert.equal(normalizeRunRecordResult(null), null);
assert.equal(normalizeRunRecordResult([]), null);
assert.equal(normalizeRunRecordResult("legacy"), null);
assert.equal(isNormalizedRunRecordResult(canonical), true);
assert.deepEqual(normalizeRunRecordResult(canonical), canonical);

assert.deepEqual(normalizeRunRecordResult({
  updated: "true",
  updates: ["撤退最深", 1, "Mage最深", "B12到達", "撤退最深"],
  milestones: ["first", 2, "second", "first"],
  runNumber: -1,
  depth: 0,
  outcome: "victory",
  records: { totalRuns: 99 },
  personalBestUpdates: ["最深到達記録"],
  class: "Mage",
  className: "Mage",
  extra: true
}), {
  updated: false,
  updates: ["撤退最深", "B12到達", "撤退最深"],
  milestones: ["first", "second", "first"],
  runNumber: 0,
  depth: 1,
  outcome: ""
});

assert.deepEqual(normalizeRunRecordResult({
  updated: true,
  updates: {},
  milestones: null,
  runNumber: 1.5,
  depth: Number.POSITIVE_INFINITY,
  outcome: "death"
}), {
  updated: true,
  updates: [],
  milestones: [],
  runNumber: 0,
  depth: 1,
  outcome: "death"
});

for (const outcome of ["", "retreat", "death", "abandon"]) {
  assert.equal(normalizeRunRecordResult({ ...canonical, outcome }).outcome, outcome);
}

const baseRun = createDefaultCurrentRun();
assert.equal(baseRun.recordResult, null);
assert.equal(isNormalizedCurrentRun(baseRun), true);
assert.equal(isNormalizedCurrentRun({ ...baseRun, recordResult: canonical }), true);
assert.equal(isNormalizedCurrentRun({ ...baseRun, recordResult: { ...canonical, updates: [1] } }), false);
const missingRecordResult = { ...baseRun };
delete missingRecordResult.recordResult;
assert.equal(isNormalizedCurrentRun(missingRecordResult), false);

const legacyRecordResult = {
  records: { totalRuns: 99 },
  updated: true,
  updates: ["撤退最深", "Mage最深", "最深到達記録"],
  milestones: ["first_b5_reached", 7, "first_b5_reached"],
  runNumber: 3,
  depth: 8,
  outcome: "retreat",
  personalBestUpdates: ["最深到達記録"],
  className: "Mage",
  class: "Mage",
  extra: "legacy"
};
const normalizedSave = normalizeSavePayload({
  version: SAVE_VERSION,
  records: { deepestRetreat: 12, totalRuns: 4 },
  currentRun: { ...baseRun, recordResult: legacyRecordResult }
});
assert.deepEqual(normalizedSave.currentRun.recordResult, {
  updated: true,
  updates: ["撤退最深", "最深到達記録"],
  milestones: ["first_b5_reached", "first_b5_reached"],
  runNumber: 3,
  depth: 8,
  outcome: "retreat"
});
assert.deepEqual(normalizedSave.records, { deepestRetreat: 12, deepestDeath: 0, totalRuns: 4 });
assert.deepEqual(
  normalizeSavePayload(JSON.parse(JSON.stringify(normalizedSave))),
  normalizedSave,
  "recordResult normalization is idempotent after JSON roundtrip"
);

console.log("[PASS] #1522 canonical recordResult type, guard, normalizer, writer, and migration boundary");
